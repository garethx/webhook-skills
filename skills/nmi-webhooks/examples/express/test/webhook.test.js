process.env.NMI_SIGNING_KEY = 'test_nmi_signing_key';

const crypto = require('crypto');
const request = require('supertest');
const { app, verifyNmiWebhook } = require('../src/index');

const SIGNING_KEY = process.env.NMI_SIGNING_KEY;

/**
 * Build a valid NMI Webhook-Signature header for a raw body.
 *
 * Mirrors NMI: signature = HMAC-SHA256(signing_key, "<nonce>.<raw_body>"), hex.
 * `t` is a nonce (any random-ish string), NOT a timestamp.
 */
function signBody(rawBody, nonce = 'f3c1e9a2b7d84c15', signingKey = SIGNING_KEY) {
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(`${nonce}.${rawBody}`)
    .digest('hex');
  return `t=${nonce},s=${signature}`;
}

const sampleEvent = {
  event_id: 'b7f1c0d2-3e4a-4b5c-8d6e-7f8091a2b3c4',
  event_type: 'transaction.sale.success',
  event_body: {
    merchant: { merchant_id: '900000', gateway_id: '12345' },
    transaction: {
      transaction_id: '9876543210',
      transaction_type: 'sale',
      condition: 'complete',
      amount: '49.99',
      order_id: 'ORDER-1001',
    },
  },
};

const sampleBody = JSON.stringify(sampleEvent);

describe('verifyNmiWebhook', () => {
  test('returns true for a valid signature', () => {
    const header = signBody(sampleBody);
    expect(verifyNmiWebhook(sampleBody, header, SIGNING_KEY)).toBe(true);
  });

  test('accepts a Buffer body', () => {
    const header = signBody(sampleBody);
    expect(verifyNmiWebhook(Buffer.from(sampleBody, 'utf8'), header, SIGNING_KEY)).toBe(true);
  });

  test('returns false for a tampered body', () => {
    const header = signBody(sampleBody);
    const tampered = sampleBody.replace('49.99', '9999.99');
    expect(verifyNmiWebhook(tampered, header, SIGNING_KEY)).toBe(false);
  });

  test('returns false for the wrong signing key', () => {
    const header = signBody(sampleBody);
    expect(verifyNmiWebhook(sampleBody, header, 'wrong_key')).toBe(false);
  });

  test('returns false when the nonce is altered (signed content changes)', () => {
    // A valid signature over nonce A must not verify if the header claims nonce B.
    const header = signBody(sampleBody, 'aaaa1111');
    const swapped = header.replace('t=aaaa1111', 't=bbbb2222');
    expect(verifyNmiWebhook(sampleBody, swapped, SIGNING_KEY)).toBe(false);
  });

  test('returns false when the header is missing t or s', () => {
    expect(verifyNmiWebhook(sampleBody, 's=abc123', SIGNING_KEY)).toBe(false);
    expect(verifyNmiWebhook(sampleBody, 't=nonce', SIGNING_KEY)).toBe(false);
    expect(verifyNmiWebhook(sampleBody, '', SIGNING_KEY)).toBe(false);
  });

  test('returns false when the signing key is not set', () => {
    const header = signBody(sampleBody);
    expect(verifyNmiWebhook(sampleBody, header, undefined)).toBe(false);
  });
});

describe('POST /webhooks/nmi', () => {
  function post(body, header) {
    const req = request(app)
      .post('/webhooks/nmi')
      .set('Content-Type', 'application/json');
    if (header !== undefined) {
      req.set('Webhook-Signature', header);
    }
    return req.send(body);
  }

  test('returns 200 for a valid signature', async () => {
    const res = await post(sampleBody, signBody(sampleBody));
    expect(res.status).toBe(200);
  });

  test('returns 400 when the signature header is missing', async () => {
    const res = await post(sampleBody);
    expect(res.status).toBe(400);
  });

  test('returns 401 for an invalid signature', async () => {
    const res = await post(sampleBody, 't=f3c1e9a2b7d84c15,s=deadbeef');
    expect(res.status).toBe(401);
  });

  test('returns 401 for a tampered payload', async () => {
    // Sign the original, then tamper the body so the HMAC no longer matches.
    const header = signBody(sampleBody);
    const tampered = sampleBody.replace('transaction.sale.success', 'transaction.refund.success');
    const res = await post(tampered, header);
    expect(res.status).toBe(401);
  });

  test('handles each transaction action with 200', async () => {
    const actions = ['sale', 'auth', 'capture', 'void', 'refund', 'credit', 'validate'];
    for (const action of actions) {
      const body = JSON.stringify({
        ...sampleEvent,
        event_type: `transaction.${action}.success`,
      });
      const res = await post(body, signBody(body));
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
