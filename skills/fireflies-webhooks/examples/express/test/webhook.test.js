const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.FIREFLIES_WEBHOOK_SECRET = 'test_fireflies_secret_1234';

const { app, verifyFirefliesWebhook } = require('../src/index');

/**
 * Generate a valid Fireflies signature for testing.
 * HMAC-SHA256 over the raw body, hex-encoded, no prefix.
 */
function generateFirefliesSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

describe('Fireflies Webhook Endpoint', () => {
  const webhookSecret = process.env.FIREFLIES_WEBHOOK_SECRET;

  describe('verifyFirefliesWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"meetingId":"abc","eventType":"Transcription completed"}');
      const signature = generateFirefliesSignature(payload, webhookSecret);

      expect(verifyFirefliesWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"meetingId":"abc"}');

      expect(verifyFirefliesWebhook(payload, 'deadbeef', webhookSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"meetingId":"abc"}');

      expect(verifyFirefliesWebhook(payload, null, webhookSecret)).toBe(false);
    });

    it('should return false for wrong secret', () => {
      const payload = Buffer.from('{"meetingId":"abc"}');
      const signature = generateFirefliesSignature(payload, webhookSecret);

      expect(verifyFirefliesWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });

    it('should return false for tampered payload', () => {
      const original = Buffer.from('{"meetingId":"abc"}');
      const signature = generateFirefliesSignature(original, webhookSecret);
      const tampered = Buffer.from('{"meetingId":"xyz"}');

      expect(verifyFirefliesWebhook(tampered, signature, webhookSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/fireflies', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .send('{"meetingId":"abc","eventType":"Transcription completed"}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({ meetingId: 'abc', eventType: 'Transcription completed' });

      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', 'deadbeef')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({
        meetingId: '01HXXXXXXXXXXXXXXXXXXXXXXX',
        eventType: 'Transcription completed'
      });
      const signature = generateFirefliesSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle Transcription completed event with clientReferenceId', async () => {
      const payload = JSON.stringify({
        meetingId: '01HXXXXXXXXXXXXXXXXXXXXXXX',
        eventType: 'Transcription completed',
        clientReferenceId: 'upload-42'
      });
      const signature = generateFirefliesSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should acknowledge unknown event types with 200', async () => {
      const payload = JSON.stringify({
        meetingId: '01HXXXXXXXXXXXXXXXXXXXXXXX',
        eventType: 'Some future event'
      });
      const signature = generateFirefliesSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
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
