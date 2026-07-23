const request = require('supertest');
const crypto = require('crypto');
const { app, server } = require('../src/index');

// Test webhook secret (whsec_ + base64-encoded key)
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Helper to generate valid ShipBob (Standard Webhooks) signatures.
// signed_content = "{webhook-id}.{webhook-timestamp}.{body}"
// key = base64-decode(secret after 'whsec_')
function generateSignature(payload, secret, timestamp, webhookId) {
  const signedContent = `${webhookId}.${timestamp}.${payload}`;
  const secretBytes = Buffer.from(secret.split('_')[1], 'base64');
  const signature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');
  return `v1,${signature}`;
}

describe('ShipBob Webhook Handler', () => {
  beforeAll(() => {
    process.env.SHIPBOB_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('successfully processes valid webhook', async () => {
    const payload = JSON.stringify({
      id: 'shipment_123',
      order_id: 456,
      status: 'Completed'
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const webhookId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSignature(payload, TEST_SECRET, timestamp, webhookId);

    const response = await request(app)
      .post('/webhooks/shipbob')
      .set('Content-Type', 'application/json')
      .set('webhook-id', webhookId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', signature)
      .set('x-webhook-topic', 'order.shipped')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, topic: 'order.shipped' });
  });

  test('handles multiple signatures correctly', async () => {
    const payload = JSON.stringify({ id: 'shipment_123', status: 'Delivered' });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const webhookId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const validSignature = generateSignature(payload, TEST_SECRET, timestamp, webhookId);
    const invalidSignature = 'v1,aW52YWxpZF9zaWduYXR1cmU=';
    const multiSignature = `${invalidSignature} ${validSignature}`;

    const response = await request(app)
      .post('/webhooks/shipbob')
      .set('Content-Type', 'application/json')
      .set('webhook-id', webhookId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', multiSignature)
      .set('x-webhook-topic', 'order.shipment.delivered')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, topic: 'order.shipment.delivered' });
  });

  test('rejects missing headers', async () => {
    const payload = JSON.stringify({ id: 'shipment_123' });

    const response = await request(app)
      .post('/webhooks/shipbob')
      .set('Content-Type', 'application/json')
      .set('x-webhook-topic', 'order.shipped')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing required');
  });

  test('rejects invalid signature', async () => {
    const payload = JSON.stringify({ id: 'shipment_123' });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const webhookId = 'msg_' + crypto.randomBytes(16).toString('hex');

    const response = await request(app)
      .post('/webhooks/shipbob')
      .set('Content-Type', 'application/json')
      .set('webhook-id', webhookId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', 'v1,aW52YWxpZF9zaWduYXR1cmU=')
      .set('x-webhook-topic', 'order.shipped')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid signature');
  });

  test('rejects old timestamps', async () => {
    const payload = JSON.stringify({ id: 'shipment_123' });

    // Timestamp from 10 minutes ago (outside the Standard Webhooks tolerance)
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const webhookId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSignature(payload, TEST_SECRET, oldTimestamp, webhookId);

    const response = await request(app)
      .post('/webhooks/shipbob')
      .set('Content-Type', 'application/json')
      .set('webhook-id', webhookId)
      .set('webhook-timestamp', oldTimestamp)
      .set('webhook-signature', signature)
      .set('x-webhook-topic', 'order.shipped')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Timestamp too old');
  });

  test('handles all common topics', async () => {
    const topics = [
      'order.shipped',
      'order.shipment.delivered',
      'order.shipment.tracking.updated',
      'order.shipment.exception',
      'return.created',
      'wro.created',
      'billing.charge.created'
    ];

    for (const topic of topics) {
      const payload = JSON.stringify({ id: 'resource_123', topic });

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const webhookId = 'msg_' + crypto.randomBytes(16).toString('hex');
      const signature = generateSignature(payload, TEST_SECRET, timestamp, webhookId);

      const response = await request(app)
        .post('/webhooks/shipbob')
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', timestamp)
        .set('webhook-signature', signature)
        .set('x-webhook-topic', topic)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.topic).toBe(topic);
    }
  });

  test('handles unknown topics gracefully', async () => {
    const payload = JSON.stringify({ id: 'resource_123' });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const webhookId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSignature(payload, TEST_SECRET, timestamp, webhookId);

    const response = await request(app)
      .post('/webhooks/shipbob')
      .set('Content-Type', 'application/json')
      .set('webhook-id', webhookId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', signature)
      .set('x-webhook-topic', 'some.unhandled.topic')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.topic).toBe('some.unhandled.topic');
  });

  test('health check endpoint works', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
