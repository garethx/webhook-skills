const crypto = require('crypto');

// Generate a real Ed25519 key pair and expose the public key (base64url `x`)
// via the env var the app reads. Do this BEFORE importing the app.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PUBLIC_KEY_B64URL = publicKey.export({ format: 'jwk' }).x;
process.env.TOKEN_WEBHOOK_PUBLIC_KEY = PUBLIC_KEY_B64URL;

const request = require('supertest');
const { app, verifyTokenWebhook } = require('../src/index');

/**
 * Sign a raw body with the test private key exactly as Token.io would:
 * Ed25519 over the raw bytes, base64url encoded.
 */
function sign(rawBody, key = privateKey) {
  return crypto
    .sign(null, Buffer.from(rawBody, 'utf8'), key)
    .toString('base64url');
}

const samplePayment = {
  payment: {
    id: 'a4hV9mQ2Zx7',
    memberId: 'm:3xamp1e:5tuv',
    status: 'INITIATION_COMPLETED',
    bankPaymentStatus: 'ACSC',
    bankPaymentId: 'bank-ref-0001',
    createdDateTime: '2026-07-27T10:00:00Z',
    updatedDateTime: '2026-07-27T10:01:12Z',
  },
};

describe('verifyTokenWebhook', () => {
  test('returns true for a valid Ed25519 signature', () => {
    const body = JSON.stringify(samplePayment);
    expect(verifyTokenWebhook(body, sign(body), PUBLIC_KEY_B64URL)).toBe(true);
  });

  test('accepts a Buffer body', () => {
    const body = JSON.stringify(samplePayment);
    expect(
      verifyTokenWebhook(Buffer.from(body, 'utf8'), sign(body), PUBLIC_KEY_B64URL)
    ).toBe(true);
  });

  test('returns false for a tampered body', () => {
    const body = JSON.stringify(samplePayment);
    const signature = sign(body);
    const tampered = body.replace('INITIATION_COMPLETED', 'INITIATION_REJECTED');
    expect(verifyTokenWebhook(tampered, signature, PUBLIC_KEY_B64URL)).toBe(false);
  });

  test('returns false for a signature from a different key', () => {
    const { privateKey: otherKey } = crypto.generateKeyPairSync('ed25519');
    const body = JSON.stringify(samplePayment);
    expect(
      verifyTokenWebhook(body, sign(body, otherKey), PUBLIC_KEY_B64URL)
    ).toBe(false);
  });

  test('returns false when the signature header is missing', () => {
    const body = JSON.stringify(samplePayment);
    expect(verifyTokenWebhook(body, undefined, PUBLIC_KEY_B64URL)).toBe(false);
  });

  test('returns false when the public key is missing', () => {
    const body = JSON.stringify(samplePayment);
    expect(verifyTokenWebhook(body, sign(body), undefined)).toBe(false);
  });

  test('returns false for a malformed signature', () => {
    const body = JSON.stringify(samplePayment);
    expect(verifyTokenWebhook(body, 'not-a-real-signature', PUBLIC_KEY_B64URL)).toBe(
      false
    );
  });
});

describe('POST /webhooks/tokenio', () => {
  function post(body, { signature, event } = {}) {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    const req = request(app)
      .post('/webhooks/tokenio')
      .set('Content-Type', 'application/json');
    if (signature !== null) {
      req.set('token-signature', signature ?? sign(raw));
    }
    if (event) {
      req.set('token-event', event);
    }
    return req.send(raw);
  }

  test('returns 200 for a valid signature', async () => {
    const res = await post(samplePayment, { event: 'PAYMENT_STATUS_CHANGED' });
    expect(res.status).toBe(200);
  });

  test('returns 400 for an invalid signature', async () => {
    const res = await post(samplePayment, {
      signature: sign(JSON.stringify({ payment: { id: 'other' } })),
      event: 'PAYMENT_STATUS_CHANGED',
    });
    expect(res.status).toBe(400);
  });

  test('returns 400 when the signature header is missing', async () => {
    const res = await post(samplePayment, {
      signature: null,
      event: 'PAYMENT_STATUS_CHANGED',
    });
    expect(res.status).toBe(400);
  });

  test('returns 400 for a tampered payload', async () => {
    const raw = JSON.stringify(samplePayment);
    const signature = sign(raw);
    const tampered = raw.replace('ACSC', 'RJCT');
    const res = await request(app)
      .post('/webhooks/tokenio')
      .set('Content-Type', 'application/json')
      .set('token-signature', signature)
      .set('token-event', 'PAYMENT_STATUS_CHANGED')
      .send(tampered);
    expect(res.status).toBe(400);
  });

  test('handles each common event with 200', async () => {
    const events = [
      'PAYMENT_STATUS_CHANGED',
      'TRANSFER_STATUS_CHANGED',
      'REFUND_STATUS_CHANGED',
      'VRP_STATUS_CHANGED',
      'VRP_CONSENT_STATUS_CHANGED',
      'VIRTUAL_ACCOUNT_CREDIT_RECEIVED',
      'PAYOUT_STATUS_CHANGED',
    ];
    for (const event of events) {
      const res = await post(samplePayment, { event });
      expect(res.status).toBe(200);
    }
  });

  test('handles each payment status with 200', async () => {
    const statuses = [
      'INITIATION_PROCESSING',
      'INITIATION_COMPLETED',
      'INITIATION_REJECTED',
      'SUCCESS',
    ];
    for (const status of statuses) {
      const body = { payment: { ...samplePayment.payment, status } };
      const res = await post(body, { event: 'PAYMENT_STATUS_CHANGED' });
      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
