const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.AKENEO_WEBHOOK_SECRET = 'test_akeneo_secret';

const { app, verifyAkeneoWebhook } = require('../src/index');

const webhookSecret = process.env.AKENEO_WEBHOOK_SECRET;

/**
 * Generate a valid Akeneo signature for testing.
 * Signs `timestamp + "." + payload` with HMAC-SHA256 (hex).
 */
function generateAkeneoSignature(payload, secret, timestamp) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(payload)
    .digest('hex');
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

function samplePayload(action = 'product.updated') {
  return JSON.stringify({
    events: [
      {
        action,
        event_id: 'evt_test_123',
        event_datetime: '2024-06-01T12:34:56+00:00',
        author: 'julia',
        author_type: 'ui',
        pim_source: 'https://demo.akeneo.com',
        data: { resource: { identifier: 'top-sku-001', code: 'model-001' } }
      }
    ]
  });
}

describe('verifyAkeneoWebhook', () => {
  it('returns true for a valid signature', () => {
    const ts = now();
    const payload = samplePayload();
    const sig = generateAkeneoSignature(payload, webhookSecret, ts);

    expect(verifyAkeneoWebhook(payload, sig, ts, webhookSecret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const ts = now();
    expect(verifyAkeneoWebhook(samplePayload(), 'deadbeef', ts, webhookSecret)).toBe(false);
  });

  it('returns false for a missing signature', () => {
    const ts = now();
    expect(verifyAkeneoWebhook(samplePayload(), undefined, ts, webhookSecret)).toBe(false);
  });

  it('returns false for a missing timestamp', () => {
    const payload = samplePayload();
    const sig = generateAkeneoSignature(payload, webhookSecret, now());
    expect(verifyAkeneoWebhook(payload, sig, undefined, webhookSecret)).toBe(false);
  });

  it('returns false for a tampered payload', () => {
    const ts = now();
    const sig = generateAkeneoSignature(samplePayload('product.created'), webhookSecret, ts);
    const tampered = samplePayload('product.removed');
    expect(verifyAkeneoWebhook(tampered, sig, ts, webhookSecret)).toBe(false);
  });

  it('returns false for a stale timestamp (replay)', () => {
    const staleTs = (Math.floor(Date.now() / 1000) - 3600).toString();
    const payload = samplePayload();
    const sig = generateAkeneoSignature(payload, webhookSecret, staleTs);
    expect(verifyAkeneoWebhook(payload, sig, staleTs, webhookSecret)).toBe(false);
  });

  it('returns false for the wrong secret', () => {
    const ts = now();
    const payload = samplePayload();
    const sig = generateAkeneoSignature(payload, webhookSecret, ts);
    expect(verifyAkeneoWebhook(payload, sig, ts, 'wrong_secret')).toBe(false);
  });
});

describe('POST /webhooks/akeneo', () => {
  it('returns 401 when the signature is missing', async () => {
    const response = await request(app)
      .post('/webhooks/akeneo')
      .set('Content-Type', 'application/json')
      .set('x-akeneo-request-timestamp', now())
      .send(samplePayload());

    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const response = await request(app)
      .post('/webhooks/akeneo')
      .set('Content-Type', 'application/json')
      .set('x-akeneo-request-signature', 'invalid')
      .set('x-akeneo-request-timestamp', now())
      .send(samplePayload());

    expect(response.status).toBe(401);
  });

  it('returns 401 for a tampered payload', async () => {
    const ts = now();
    const sig = generateAkeneoSignature(samplePayload('product.created'), webhookSecret, ts);

    const response = await request(app)
      .post('/webhooks/akeneo')
      .set('Content-Type', 'application/json')
      .set('x-akeneo-request-signature', sig)
      .set('x-akeneo-request-timestamp', ts)
      .send(samplePayload('product.removed'));

    expect(response.status).toBe(401);
  });

  it('returns 200 for a valid signature', async () => {
    const ts = now();
    const payload = samplePayload();
    const sig = generateAkeneoSignature(payload, webhookSecret, ts);

    const response = await request(app)
      .post('/webhooks/akeneo')
      .set('Content-Type', 'application/json')
      .set('x-akeneo-request-signature', sig)
      .set('x-akeneo-request-timestamp', ts)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });

  it('handles all product and product-model event types', async () => {
    const actions = [
      'product.created',
      'product.updated',
      'product.removed',
      'product_model.created',
      'product_model.updated',
      'product_model.removed',
      'unknown.action'
    ];

    for (const action of actions) {
      const ts = now();
      const payload = samplePayload(action);
      const sig = generateAkeneoSignature(payload, webhookSecret, ts);

      const response = await request(app)
        .post('/webhooks/akeneo')
        .set('Content-Type', 'application/json')
        .set('x-akeneo-request-signature', sig)
        .set('x-akeneo-request-timestamp', ts)
        .send(payload);

      expect(response.status).toBe(200);
    }
  });

  it('processes a batched payload with multiple events', async () => {
    const ts = now();
    const payload = JSON.stringify({
      events: [
        { action: 'product.created', event_id: 'e1', data: { resource: { identifier: 'a' } } },
        { action: 'product.updated', event_id: 'e2', data: { resource: { identifier: 'b' } } }
      ]
    });
    const sig = generateAkeneoSignature(payload, webhookSecret, ts);

    const response = await request(app)
      .post('/webhooks/akeneo')
      .set('Content-Type', 'application/json')
      .set('x-akeneo-request-signature', sig)
      .set('x-akeneo-request-timestamp', ts)
      .send(payload);

    expect(response.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
