const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.PICQER_WEBHOOK_SECRET = 'test_picqer_secret';

const { app, verifyPicqerWebhook } = require('../src/index');

/**
 * Generate a valid Picqer HMAC signature for testing.
 * Mirrors Picqer: base64(HMAC-SHA256(rawBody, secret)).
 */
function generatePicqerSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');
}

describe('Picqer Webhook Endpoint', () => {
  const secret = process.env.PICQER_WEBHOOK_SECRET;

  describe('verifyPicqerWebhook', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"event":"orders.completed"}');
      const signature = generatePicqerSignature(payload, secret);

      expect(verifyPicqerWebhook(payload, signature, secret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"event":"orders.completed"}');

      expect(verifyPicqerWebhook(payload, 'invalid_signature', secret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"event":"orders.completed"}');

      expect(verifyPicqerWebhook(payload, undefined, secret)).toBe(false);
    });

    it('should return false for a missing secret', () => {
      const payload = Buffer.from('{"event":"orders.completed"}');
      const signature = generatePicqerSignature(payload, secret);

      expect(verifyPicqerWebhook(payload, signature, undefined)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = Buffer.from('{"event":"orders.completed","data":{"idorder":1}}');
      const signature = generatePicqerSignature(original, secret);
      const tampered = Buffer.from('{"event":"orders.completed","data":{"idorder":999}}');

      expect(verifyPicqerWebhook(tampered, signature, secret)).toBe(false);
    });
  });

  describe('POST /webhooks/picqer', () => {
    it('should return 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/picqer')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ event: 'orders.completed' }));

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for an invalid signature', async () => {
      const payload = JSON.stringify({ event: 'orders.completed' });

      const response = await request(app)
        .post('/webhooks/picqer')
        .set('Content-Type', 'application/json')
        .set('X-Picqer-Signature', 'invalid_signature')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        idhook: 12345,
        name: 'My hook',
        event: 'orders.completed',
        event_triggered_at: '2026-07-22 10:30:00',
        data: { idorder: 42 },
      });
      const signature = generatePicqerSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/picqer')
        .set('Content-Type', 'application/json')
        .set('X-Picqer-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle different event types', async () => {
      const events = [
        'orders.created',
        'orders.completed',
        'orders.status_changed',
        'picklists.created',
        'picklists.closed',
        'picklists.shipments.created',
        'products.created',
        'products.stock_changed',
        'purchase_orders.created',
        'returns.created',
      ];

      for (const event of events) {
        const payload = JSON.stringify({ event, data: { idorder: 1 } });
        const signature = generatePicqerSignature(payload, secret);

        const response = await request(app)
          .post('/webhooks/picqer')
          .set('Content-Type', 'application/json')
          .set('X-Picqer-Signature', signature)
          .send(payload);

        expect(response.status).toBe(200);
      }
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
