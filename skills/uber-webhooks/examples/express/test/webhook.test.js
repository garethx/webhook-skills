const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.UBER_CLIENT_SECRET = 'test_client_secret';

const { app, verifyUberWebhook } = require('../src/index');

/**
 * Generate a valid Uber signature for testing.
 * Lowercased hex HMAC-SHA256 of the raw body, keyed with the client secret.
 */
function generateUberSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

describe('Uber Webhook Endpoint', () => {
  const clientSecret = process.env.UBER_CLIENT_SECRET;

  describe('verifyUberWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"event_type":"orders.notification"}');
      const signature = generateUberSignature(payload, clientSecret);

      expect(verifyUberWebhook(payload, signature, clientSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"event_type":"orders.notification"}');

      expect(verifyUberWebhook(payload, 'deadbeef', clientSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"event_type":"orders.notification"}');

      expect(verifyUberWebhook(payload, null, clientSecret)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = Buffer.from('{"event_type":"orders.notification"}');
      const signature = generateUberSignature(original, clientSecret);
      const tampered = Buffer.from('{"event_type":"orders.cancel"}');

      expect(verifyUberWebhook(tampered, signature, clientSecret)).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from('{"event_type":"orders.notification"}');
      const signature = generateUberSignature(payload, clientSecret);

      expect(verifyUberWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });
  });

  describe('POST /webhooks/uber', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/uber')
        .set('Content-Type', 'application/json')
        .send('{"event_type":"orders.notification"}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({ event_type: 'orders.notification' });

      const response = await request(app)
        .post('/webhooks/uber')
        .set('Content-Type', 'application/json')
        .set('X-Uber-Signature', 'deadbeef')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 with an empty body for valid signature', async () => {
      const payload = JSON.stringify({
        event_id: 'evt_1',
        event_type: 'orders.notification',
        resource_href: 'https://api.uber.com/v2/eats/order/abc',
      });
      const signature = generateUberSignature(payload, clientSecret);

      const response = await request(app)
        .post('/webhooks/uber')
        .set('Content-Type', 'application/json')
        .set('X-Uber-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('');
    });

    it('should handle orders.cancel event', async () => {
      const payload = JSON.stringify({
        event_id: 'evt_2',
        event_type: 'orders.cancel',
        resource_href: 'https://api.uber.com/v2/eats/order/abc',
      });
      const signature = generateUberSignature(payload, clientSecret);

      const response = await request(app)
        .post('/webhooks/uber')
        .set('Content-Type', 'application/json')
        .set('X-Uber-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle store.provisioned event', async () => {
      const payload = JSON.stringify({
        event_id: 'evt_3',
        event_type: 'store.provisioned',
        meta: { resource_id: 'store_123' },
      });
      const signature = generateUberSignature(payload, clientSecret);

      const response = await request(app)
        .post('/webhooks/uber')
        .set('Content-Type', 'application/json')
        .set('X-Uber-Signature', signature)
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
