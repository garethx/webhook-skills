import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// A 32-character APIv3 key (AES-256 needs 32 bytes).
const API_V3_KEY = 'abcdefghijklmnopqrstuvwxyz012345';
const SERIAL = 'PLATFORM_CERT_SERIAL_123';
// A second serial, as published ~24h ahead of a certificate rotation.
const ROTATED_SERIAL = 'PLATFORM_CERT_SERIAL_456';

function generateKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

// Generate RSA keypairs to stand in for WeChat Pay's platform keys.
const { publicKey, privateKey } = generateKeyPair();
const { publicKey: rotatedPublicKey, privateKey: rotatedPrivateKey } = generateKeyPair();

beforeAll(() => {
  process.env.WECHAT_PAY_PUBLIC_KEY = publicKey;
  process.env.WECHAT_PAY_API_V3_KEY = API_V3_KEY;
  process.env.WECHAT_PAY_PLATFORM_SERIAL = SERIAL;
  process.env.WECHAT_PAY_PLATFORM_KEYS = JSON.stringify({ [ROTATED_SERIAL]: rotatedPublicKey });
});

/** Encrypt a plaintext object into a WeChat Pay `resource` (AEAD_AES_256_GCM). */
function encryptResource(plaintextObj: object, apiV3Key: string, associatedData = 'transaction') {
  const nonce = crypto.randomBytes(12).toString('hex').slice(0, 12);
  const cipher = crypto.createCipheriv('aes-256-gcm', apiV3Key, nonce);
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(plaintextObj), 'utf8'),
    cipher.final(),
  ]);
  const ciphertext = Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64');
  return { algorithm: 'AEAD_AES_256_GCM', ciphertext, nonce, associated_data: associatedData };
}

interface Overrides {
  timestamp?: string;
  nonce?: string;
  signature?: string;
  serial?: string;
  privateKey?: string;
}

/** Build a signed WeChat Pay notification request. */
function buildRequest(eventType: string, resourceObj: object, overrides: Overrides = {}) {
  const notification = {
    id: 'EV-TEST-123',
    create_time: '2018-06-08T10:34:56+08:00',
    event_type: eventType,
    resource_type: 'encrypt-resource',
    summary: 'test',
    resource: encryptResource(resourceObj, API_V3_KEY),
  };
  const body = JSON.stringify(notification);
  const timestamp = overrides.timestamp || String(Math.floor(Date.now() / 1000));
  const nonce = overrides.nonce || 'test-nonce';
  const message = `${timestamp}\n${nonce}\n${body}\n`;
  const signature =
    overrides.signature ||
    crypto
      .sign('RSA-SHA256', Buffer.from(message, 'utf8'), overrides.privateKey || privateKey)
      .toString('base64');

  return new Request('http://localhost/webhooks/wechat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Wechatpay-Timestamp': timestamp,
      'Wechatpay-Nonce': nonce,
      'Wechatpay-Signature': signature,
      'Wechatpay-Serial': overrides.serial || SERIAL,
    },
    body,
  });
}

const transaction = {
  out_trade_no: 'order-12345',
  transaction_id: '4200001234',
  trade_state: 'SUCCESS',
  amount: { total: 100, currency: 'USD' },
};

describe('WeChat Pay Webhook Route', () => {
  it('should return 400 for missing signature headers', async () => {
    const { POST } = await import('../app/webhooks/wechat/route');
    const req = new Request('http://localhost/webhooks/wechat', { method: 'POST', body: '{}' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('should return 401 for an invalid signature', async () => {
    const { POST } = await import('../app/webhooks/wechat/route');
    const req = buildRequest('TRANSACTION.SUCCESS', transaction, {
      signature: Buffer.from('not-a-real-signature').toString('base64'),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('should return 401 for a tampered body', async () => {
    const { POST } = await import('../app/webhooks/wechat/route');
    const req = buildRequest('TRANSACTION.SUCCESS', transaction);
    const body = (await req.text()).replace('EV-TEST-123', 'EV-TAMPERED');
    const tampered = new Request(req.url, { method: 'POST', headers: req.headers, body });
    const res = await POST(tampered as any);
    expect(res.status).toBe(401);
  });

  it('should return 400 for a stale timestamp', async () => {
    const { POST } = await import('../app/webhooks/wechat/route');
    const old = String(Math.floor(Date.now() / 1000) - 400);
    const req = buildRequest('TRANSACTION.SUCCESS', transaction, { timestamp: old });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('should reject an unknown platform serial with an actionable message', async () => {
    const { POST } = await import('../app/webhooks/wechat/route');
    const req = buildRequest('TRANSACTION.SUCCESS', transaction, { serial: 'SOME_OTHER_SERIAL' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain('No platform key configured for serial SOME_OTHER_SERIAL');
    expect(json.message).toContain('/v3/certificates');
  });

  it('should verify against the key matching Wechatpay-Serial after a rotation', async () => {
    const { POST } = await import('../app/webhooks/wechat/route');
    const req = buildRequest('TRANSACTION.SUCCESS', transaction, {
      serial: ROTATED_SERIAL,
      privateKey: rotatedPrivateKey,
      nonce: 'rotated-nonce',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: 'SUCCESS', message: 'OK' });
  });

  it('should not verify a notification signed by the wrong key for its serial', async () => {
    // Signed with the old key but announcing the rotated serial.
    const { POST } = await import('../app/webhooks/wechat/route');
    const req = buildRequest('TRANSACTION.SUCCESS', transaction, {
      serial: ROTATED_SERIAL,
      nonce: 'mismatched-nonce',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('should return 200 and SUCCESS for a valid TRANSACTION.SUCCESS', async () => {
    const { POST } = await import('../app/webhooks/wechat/route');
    const req = buildRequest('TRANSACTION.SUCCESS', transaction);
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: 'SUCCESS', message: 'OK' });
  });

  it('should handle refund event types', async () => {
    const { POST } = await import('../app/webhooks/wechat/route');
    for (const eventType of ['REFUND.SUCCESS', 'REFUND.CLOSED']) {
      const refund = { out_refund_no: 'refund-1', refund_id: '50000001' };
      const req = buildRequest(eventType, refund, { nonce: eventType });
      const res = await POST(req as any);
      expect(res.status).toBe(200);
    }
  });

  it('should acknowledge unknown event types', async () => {
    const { POST } = await import('../app/webhooks/wechat/route');
    const req = buildRequest('SOMETHING.ELSE', transaction, { nonce: 'other' });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
  });
});

describe('WeChat Pay verification helpers', () => {
  it('verifySignature validates a correct signature', async () => {
    const { verifySignature } = await import('../app/webhooks/wechat/route');
    const timestamp = '1700000000';
    const nonce = 'abc';
    const body = '{"hello":"world"}';
    const message = `${timestamp}\n${nonce}\n${body}\n`;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(message, 'utf8'), privateKey).toString('base64');
    expect(verifySignature(timestamp, nonce, body, sig, publicKey)).toBe(true);
  });

  it('verifySignature rejects a bad signature', async () => {
    const { verifySignature } = await import('../app/webhooks/wechat/route');
    expect(verifySignature('1', 'n', 'body', 'not-base64', publicKey)).toBe(false);
  });

  it('decryptResource recovers the plaintext', async () => {
    const { decryptResource } = await import('../app/webhooks/wechat/route');
    const resource = encryptResource(transaction, API_V3_KEY);
    expect(decryptResource(resource, API_V3_KEY)).toEqual(transaction);
  });
});
