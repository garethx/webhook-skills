const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app.
process.env.COMMERCELAYER_SHARED_SECRET = 'test_shared_secret';

const { app, verifyCommerceLayerSignature } = require('../src/index');

/**
 * Generate a valid Commerce Layer signature (base64 HMAC-SHA256 of the raw body).
 */
function generateSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

const secret = process.env.COMMERCELAYER_SHARED_SECRET;

// A minimal JSON:API order payload as Commerce Layer would send it.
function orderPayload(id = 'yzkWXfWDnu') {
  return JSON.stringify({
    data: { id, type: 'orders', attributes: { number: 1234, status: 'placed' } },
  });
}

describe('verifyCommerceLayerSignature', () => {
  it('returns true for a valid signature', () => {
    const payload = Buffer.from(orderPayload());
    const signature = generateSignature(payload, secret);
    expect(verifyCommerceLayerSignature(payload, signature, secret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const payload = Buffer.from(orderPayload());
    expect(verifyCommerceLayerSignature(payload, 'not-a-real-signature', secret)).toBe(false);
  });

  it('returns false when the signature is missing', () => {
    const payload = Buffer.from(orderPayload());
    expect(verifyCommerceLayerSignature(payload, undefined, secret)).toBe(false);
  });

  it('returns false for a tampered body', () => {
    const signed = Buffer.from(orderPayload('yzkWXfWDnu'));
    const signature = generateSignature(signed, secret);
    const tampered = Buffer.from(orderPayload('TAMPERED123'));
    expect(verifyCommerceLayerSignature(tampered, signature, secret)).toBe(false);
  });

  it('returns false for the wrong secret', () => {
    const payload = Buffer.from(orderPayload());
    const signature = generateSignature(payload, secret);
    expect(verifyCommerceLayerSignature(payload, signature, 'wrong_secret')).toBe(false);
  });
});

describe('POST /webhooks/commercelayer', () => {
  it('returns 400 when the signature header is missing', async () => {
    const response = await request(app)
      .post('/webhooks/commercelayer')
      .set('Content-Type', 'application/json')
      .set('X-CommerceLayer-Topic', 'orders.place')
      .send(orderPayload());

    expect(response.status).toBe(400);
    expect(response.text).toBe('Invalid signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const response = await request(app)
      .post('/webhooks/commercelayer')
      .set('Content-Type', 'application/json')
      .set('X-CommerceLayer-Signature', 'invalid')
      .set('X-CommerceLayer-Topic', 'orders.place')
      .send(orderPayload());

    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = orderPayload();
    const signature = generateSignature(Buffer.from(payload), secret);

    const response = await request(app)
      .post('/webhooks/commercelayer')
      .set('Content-Type', 'application/json')
      .set('X-CommerceLayer-Signature', signature)
      .set('X-CommerceLayer-Topic', 'orders.place')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  it('handles the full set of dispatched topics', async () => {
    const topics = [
      'orders.place',
      'orders.approve',
      'orders.cancel',
      'orders.pay',
      'orders.refund',
      'customers.create',
      'shipments.ship',
      'shipments.deliver',
    ];

    for (const topic of topics) {
      const payload = orderPayload('abc123');
      const signature = generateSignature(Buffer.from(payload), secret);

      const response = await request(app)
        .post('/webhooks/commercelayer')
        .set('Content-Type', 'application/json')
        .set('X-CommerceLayer-Signature', signature)
        .set('X-CommerceLayer-Topic', topic)
        .send(payload);

      expect(response.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
