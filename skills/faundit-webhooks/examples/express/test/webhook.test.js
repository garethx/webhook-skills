const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.FAUNDIT_WEBHOOK_SECRET = 'test_faundit_secret';

const { app, verifyFaunditWebhook } = require('../src/index');

/**
 * Generate a valid Faundit v1 signature for testing.
 * Signs "v1:<timestamp>:<body>" with HMAC-SHA256 (hex).
 */
function generateFaunditSignature(payload, timestamp, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`v1:${timestamp}:${payload}`)
    .digest('hex');
}

describe('Faundit Webhook Endpoint', () => {
  const webhookSecret = process.env.FAUNDIT_WEBHOOK_SECRET;
  const timestamp = '1737021000';

  describe('verifyFaunditWebhook', () => {
    it('should return true for a valid signature', () => {
      const payload = '{"event-type":"item-status","data":{"id":1,"status":"delivered"}}';
      const signature = generateFaunditSignature(payload, timestamp, webhookSecret);

      expect(verifyFaunditWebhook(payload, timestamp, signature, webhookSecret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = '{"event-type":"item-status"}';

      expect(verifyFaunditWebhook(payload, timestamp, 'deadbeef', webhookSecret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = '{"event-type":"item-status"}';

      expect(verifyFaunditWebhook(payload, timestamp, null, webhookSecret)).toBe(false);
    });

    it('should return false for a missing timestamp', () => {
      const payload = '{"event-type":"item-status"}';
      const signature = generateFaunditSignature(payload, timestamp, webhookSecret);

      expect(verifyFaunditWebhook(payload, null, signature, webhookSecret)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = '{"event-type":"item-status","data":{"id":1}}';
      const signature = generateFaunditSignature(original, timestamp, webhookSecret);
      const tampered = '{"event-type":"item-status","data":{"id":999}}';

      expect(verifyFaunditWebhook(tampered, timestamp, signature, webhookSecret)).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = '{"event-type":"item-status"}';
      const signature = generateFaunditSignature(payload, timestamp, webhookSecret);

      expect(verifyFaunditWebhook(payload, timestamp, signature, 'wrong_secret')).toBe(false);
    });
  });

  describe('POST /webhooks/faundit', () => {
    it('should return 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/faundit')
        .set('Content-Type', 'application/json')
        .set('X-Faundit-Timestamp', timestamp)
        .send('{"event-type":"item-status","data":{"id":1,"status":"delivered"}}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for an invalid signature', async () => {
      const payload = JSON.stringify({ 'event-type': 'item-status', data: { id: 1 } });

      const response = await request(app)
        .post('/webhooks/faundit')
        .set('Content-Type', 'application/json')
        .set('X-Faundit-Timestamp', timestamp)
        .set('X-Faundit-Signature-Next', 'deadbeef')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid item-status event', async () => {
      const payload = JSON.stringify({
        'event-type': 'item-status',
        data: { id: 12345, timestamp: '2026-01-15T10:30:00Z', status: 'delivered', locationID: 'loc_abc123' },
      });
      const signature = generateFaunditSignature(payload, timestamp, webhookSecret);

      const response = await request(app)
        .post('/webhooks/faundit')
        .set('Content-Type', 'application/json')
        .set('X-Faundit-Timestamp', timestamp)
        .set('X-Faundit-Signature-Next', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should return 200 for a valid request-status event', async () => {
      const payload = JSON.stringify({
        'event-type': 'request-status',
        data: { id: 678, timestamp: '2026-01-15T10:30:00Z', status: 'resolved', locationID: 'loc_abc123' },
      });
      const signature = generateFaunditSignature(payload, timestamp, webhookSecret);

      const response = await request(app)
        .post('/webhooks/faundit')
        .set('Content-Type', 'application/json')
        .set('X-Faundit-Timestamp', timestamp)
        .set('X-Faundit-Signature-Next', signature)
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
