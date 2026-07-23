const request = require('supertest');
const crypto = require('crypto');
const { app, server } = require('../src/index');

// Test signing secret. Svix secrets are 'whsec_' + base64(key).
// base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Generate a valid Svix signature the same way Svix does:
// base64(HMAC_SHA256(base64Decode(secret_after_whsec_), `${id}.${timestamp}.${payload}`))
function generateSvixSignature(payload, secret, timestamp, msgId) {
  const signedContent = `${msgId}.${timestamp}.${payload}`;
  const key = Buffer.from(secret.split('_')[1], 'base64');
  const signature = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  return `v1,${signature}`;
}

function headers(msgId, timestamp, signature) {
  return {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': signature,
  };
}

describe('Svix Webhook Handler', () => {
  beforeAll(() => {
    process.env.SVIX_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('successfully processes a valid webhook', async () => {
    const payload = JSON.stringify({ type: 'invoice.paid', data: { id: 'in_123' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSvixSignature(payload, TEST_SECRET, timestamp, msgId);

    const response = await request(app)
      .post('/webhooks/svix')
      .set('Content-Type', 'application/json')
      .set(headers(msgId, timestamp, signature))
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, type: 'invoice.paid' });
  });

  test('accepts webhook-* header aliases (Standard Webhooks)', async () => {
    const payload = JSON.stringify({ type: 'user.created', data: { id: 'user_123' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSvixSignature(payload, TEST_SECRET, timestamp, msgId);

    const response = await request(app)
      .post('/webhooks/svix')
      .set('Content-Type', 'application/json')
      .set('webhook-id', msgId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.type).toBe('user.created');
  });

  test('handles multiple signatures (secret rotation)', async () => {
    const payload = JSON.stringify({ type: 'user.updated', data: { id: 'user_123' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const validSignature = generateSvixSignature(payload, TEST_SECRET, timestamp, msgId);
    const invalidSignature = 'v1,aW52YWxpZF9zaWduYXR1cmU=';

    // One invalid + one valid, space-delimited — should still pass.
    const multi = `${invalidSignature} ${validSignature}`;

    const response = await request(app)
      .post('/webhooks/svix')
      .set('Content-Type', 'application/json')
      .set(headers(msgId, timestamp, multi))
      .send(payload);

    expect(response.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const payload = JSON.stringify({ type: 'user.created', data: { id: 'user_123' } });

    const response = await request(app)
      .post('/webhooks/svix')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing required');
  });

  test('rejects an invalid signature', async () => {
    const payload = JSON.stringify({ type: 'user.created', data: { id: 'user_123' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');

    const response = await request(app)
      .post('/webhooks/svix')
      .set('Content-Type', 'application/json')
      .set(headers(msgId, timestamp, 'v1,aW52YWxpZF9zaWduYXR1cmU='))
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid signature');
  });

  test('rejects an old timestamp', async () => {
    const payload = JSON.stringify({ type: 'user.created', data: { id: 'user_123' } });
    // 10 minutes ago — outside the 5-minute tolerance.
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSvixSignature(payload, TEST_SECRET, oldTimestamp, msgId);

    const response = await request(app)
      .post('/webhooks/svix')
      .set('Content-Type', 'application/json')
      .set(headers(msgId, oldTimestamp, signature))
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Timestamp too old');
  });

  test('handles all illustrative event types', async () => {
    const eventTypes = ['invoice.paid', 'user.created', 'user.updated', 'message.sent'];

    for (const eventType of eventTypes) {
      const payload = JSON.stringify({ type: eventType, data: { id: 'resource_123' } });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
      const signature = generateSvixSignature(payload, TEST_SECRET, timestamp, msgId);

      const response = await request(app)
        .post('/webhooks/svix')
        .set('Content-Type', 'application/json')
        .set(headers(msgId, timestamp, signature))
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.type).toBe(eventType);
    }
  });

  test('handles unknown event types gracefully', async () => {
    const payload = JSON.stringify({ type: 'some.unknown.event', data: { id: 'resource_123' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSvixSignature(payload, TEST_SECRET, timestamp, msgId);

    const response = await request(app)
      .post('/webhooks/svix')
      .set('Content-Type', 'application/json')
      .set(headers(msgId, timestamp, signature))
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.type).toBe('some.unknown.event');
  });

  test('health check endpoint works', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
