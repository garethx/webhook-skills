const request = require('supertest');
const crypto = require('crypto');

// A 32-character APIv3 key (AES-256 needs 32 bytes).
const API_V3_KEY = 'abcdefghijklmnopqrstuvwxyz012345';
const SERIAL = 'PLATFORM_CERT_SERIAL_123';

// Generate an RSA keypair to stand in for WeChat Pay's platform key.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Set environment before importing the app.
process.env.WECHAT_PAY_PUBLIC_KEY = publicKey;
process.env.WECHAT_PAY_API_V3_KEY = API_V3_KEY;
process.env.WECHAT_PAY_PLATFORM_SERIAL = SERIAL;

const app = require('../src/index');

/** Encrypt a plaintext object into a WeChat Pay `resource` (AEAD_AES_256_GCM). */
function encryptResource(plaintextObj, apiV3Key, associatedData = 'transaction') {
  const nonce = crypto.randomBytes(12).toString('hex').slice(0, 12); // 12-byte IV
  const cipher = crypto.createCipheriv('aes-256-gcm', apiV3Key, nonce);
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(plaintextObj), 'utf8'),
    cipher.final(),
  ]);
  const ciphertext = Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64');
  return { algorithm: 'AEAD_AES_256_GCM', ciphertext, nonce, associated_data: associatedData };
}

/** Build a signed WeChat Pay notification: returns { body, headers }. */
function buildNotification(eventType, resourceObj, overrides = {}) {
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
  const signature = crypto.sign('RSA-SHA256', Buffer.from(message, 'utf8'), privateKey).toString('base64');
  return {
    body,
    headers: {
      'Content-Type': 'application/json',
      'Wechatpay-Timestamp': timestamp,
      'Wechatpay-Nonce': nonce,
      'Wechatpay-Signature': overrides.signature || signature,
      'Wechatpay-Serial': overrides.serial || SERIAL,
    },
  };
}

const transaction = {
  out_trade_no: 'order-12345',
  transaction_id: '4200001234',
  trade_state: 'SUCCESS',
  amount: { total: 100, currency: 'USD' },
};

describe('WeChat Pay Webhook Endpoint', () => {
  describe('POST /webhooks/wechat', () => {
    it('should return 400 for missing signature headers', async () => {
      const response = await request(app)
        .post('/webhooks/wechat')
        .set('Content-Type', 'application/json')
        .send('{}');
      expect(response.status).toBe(400);
    });

    it('should return 401 for an invalid signature', async () => {
      const { body, headers } = buildNotification('TRANSACTION.SUCCESS', transaction, {
        signature: Buffer.from('not-a-real-signature').toString('base64'),
      });
      const response = await request(app).post('/webhooks/wechat').set(headers).send(body);
      expect(response.status).toBe(401);
    });

    it('should return 400 for a tampered body', async () => {
      const { body, headers } = buildNotification('TRANSACTION.SUCCESS', transaction);
      const tampered = body.replace('EV-TEST-123', 'EV-TAMPERED');
      const response = await request(app).post('/webhooks/wechat').set(headers).send(tampered);
      expect(response.status).toBe(401); // signature no longer matches the body
    });

    it('should return 400 for a stale timestamp', async () => {
      const old = String(Math.floor(Date.now() / 1000) - 400);
      const { body, headers } = buildNotification('TRANSACTION.SUCCESS', transaction, { timestamp: old });
      const response = await request(app).post('/webhooks/wechat').set(headers).send(body);
      expect(response.status).toBe(400);
    });

    it('should return 400 for an unknown platform serial', async () => {
      const { body, headers } = buildNotification('TRANSACTION.SUCCESS', transaction, {
        serial: 'SOME_OTHER_SERIAL',
      });
      const response = await request(app).post('/webhooks/wechat').set(headers).send(body);
      expect(response.status).toBe(400);
    });

    it('should return 200 and SUCCESS for a valid TRANSACTION.SUCCESS', async () => {
      const { body, headers } = buildNotification('TRANSACTION.SUCCESS', transaction);
      const response = await request(app).post('/webhooks/wechat').set(headers).send(body);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ code: 'SUCCESS', message: 'OK' });
    });

    it('should handle refund event types', async () => {
      for (const eventType of ['REFUND.SUCCESS', 'REFUND.CLOSED']) {
        const refund = { out_refund_no: 'refund-1', refund_id: '50000001' };
        const { body, headers } = buildNotification(eventType, refund, { nonce: eventType });
        const response = await request(app).post('/webhooks/wechat').set(headers).send(body);
        expect(response.status).toBe(200);
      }
    });

    it('should acknowledge unknown event types', async () => {
      const { body, headers } = buildNotification('SOMETHING.ELSE', transaction, { nonce: 'other' });
      const response = await request(app).post('/webhooks/wechat').set(headers).send(body);
      expect(response.status).toBe(200);
    });
  });

  describe('helpers', () => {
    it('verifySignature returns false on malformed input', () => {
      expect(app.verifySignature('1', 'n', 'body', 'not-base64', publicKey)).toBe(false);
    });

    it('decryptResource recovers the plaintext', () => {
      const resource = encryptResource(transaction, API_V3_KEY);
      expect(app.decryptResource(resource, API_V3_KEY)).toEqual(transaction);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
