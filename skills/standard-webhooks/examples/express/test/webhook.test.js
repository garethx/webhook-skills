const request = require('supertest');
const crypto = require('crypto');
const { app, server } = require('../src/index');

// Test webhook secret (base64-encoded after the whsec_ prefix)
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Generates a valid Standard Webhooks v1 signature for the given payload.
// Matches the spec: HMAC-SHA256("<id>.<timestamp>.<body>", base64decode(secret)) → base64.
function generateSignature(payload, secret, timestamp, msgId) {
  const signedContent = `${msgId}.${timestamp}.${payload}`;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');
  return `v1,${signature}`;
}

describe('Standard Webhooks Handler', () => {
  beforeAll(() => {
    process.env.WEBHOOK_SECRET = TEST_SECRET;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('successfully processes valid webhook', async () => {
    const payload = JSON.stringify({
      type: 'contact.created',
      timestamp: new Date().toISOString(),
      data: { id: 'ct_123', email: 'test@example.com' },
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSignature(payload, TEST_SECRET, timestamp, msgId);

    const response = await request(app)
      .post('/webhooks/standard')
      .set('Content-Type', 'application/json')
      .set('webhook-id', msgId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, type: 'contact.created' });
  });

  test('handles multiple signatures (key rotation)', async () => {
    const payload = JSON.stringify({
      type: 'contact.updated',
      timestamp: new Date().toISOString(),
      data: { id: 'ct_123' },
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const validSignature = generateSignature(payload, TEST_SECRET, timestamp, msgId);
    const invalidSignature = 'v1,aW52YWxpZF9zaWduYXR1cmU=';

    const multiSignature = `${invalidSignature} ${validSignature}`;

    const response = await request(app)
      .post('/webhooks/standard')
      .set('Content-Type', 'application/json')
      .set('webhook-id', msgId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', multiSignature)
      .send(payload);

    expect(response.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const payload = JSON.stringify({ type: 'contact.created', data: {} });

    const response = await request(app)
      .post('/webhooks/standard')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing required');
  });

  test('rejects invalid signature', async () => {
    const payload = JSON.stringify({ type: 'contact.created', data: {} });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');

    const response = await request(app)
      .post('/webhooks/standard')
      .set('Content-Type', 'application/json')
      .set('webhook-id', msgId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', 'v1,aW52YWxpZF9zaWduYXR1cmU=')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid signature');
  });

  test('rejects old timestamps (outside 5-minute tolerance)', async () => {
    const payload = JSON.stringify({ type: 'contact.created', data: {} });

    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSignature(payload, TEST_SECRET, oldTimestamp, msgId);

    const response = await request(app)
      .post('/webhooks/standard')
      .set('Content-Type', 'application/json')
      .set('webhook-id', msgId)
      .set('webhook-timestamp', oldTimestamp)
      .set('webhook-signature', signature)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Timestamp too old');
  });

  test('handles all illustrative event types', async () => {
    const eventTypes = [
      'contact.created',
      'contact.updated',
      'contact.deleted',
      'message.sent',
      'message.failed',
    ];

    for (const type of eventTypes) {
      const payload = JSON.stringify({
        type,
        timestamp: new Date().toISOString(),
        data: { id: 'resource_123' },
      });

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
      const signature = generateSignature(payload, TEST_SECRET, timestamp, msgId);

      const response = await request(app)
        .post('/webhooks/standard')
        .set('Content-Type', 'application/json')
        .set('webhook-id', msgId)
        .set('webhook-timestamp', timestamp)
        .set('webhook-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.type).toBe(type);
    }
  });

  test('handles unknown event types gracefully', async () => {
    const payload = JSON.stringify({
      type: 'unknown.event.type',
      timestamp: new Date().toISOString(),
      data: { id: 'resource_123' },
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSignature(payload, TEST_SECRET, timestamp, msgId);

    const response = await request(app)
      .post('/webhooks/standard')
      .set('Content-Type', 'application/json')
      .set('webhook-id', msgId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.type).toBe('unknown.event.type');
  });

  test('health check endpoint works', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
