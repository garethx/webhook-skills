const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.NUVEMSHOP_CLIENT_SECRET = 'test_client_secret';

const { app, verifyNuvemshopWebhook } = require('../src/index');

/**
 * Generate a valid Nuvemshop HMAC-SHA256 (hex) signature for testing.
 * Mirrors the provider's algorithm: HMAC over the raw body, hex-encoded.
 */
function generateNuvemshopSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

describe('Nuvemshop Webhook Endpoint', () => {
  const clientSecret = process.env.NUVEMSHOP_CLIENT_SECRET;

  describe('verifyNuvemshopWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"store_id":123,"event":"order/created","id":999}');
      const signature = generateNuvemshopSignature(payload, clientSecret);

      expect(verifyNuvemshopWebhook(payload, signature, clientSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"store_id":123,"event":"order/created","id":999}');

      expect(verifyNuvemshopWebhook(payload, 'deadbeef', clientSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"store_id":123}');

      expect(verifyNuvemshopWebhook(payload, undefined, clientSecret)).toBe(false);
    });

    it('should return false for tampered payload', () => {
      const original = Buffer.from('{"store_id":123,"event":"order/paid","id":1}');
      const signature = generateNuvemshopSignature(original, clientSecret);
      const tampered = Buffer.from('{"store_id":123,"event":"order/paid","id":2}');

      expect(verifyNuvemshopWebhook(tampered, signature, clientSecret)).toBe(false);
    });

    it('should return false for wrong secret', () => {
      const payload = Buffer.from('{"store_id":123}');
      const signature = generateNuvemshopSignature(payload, clientSecret);

      expect(verifyNuvemshopWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });
  });

  describe('POST /webhooks/nuvemshop', () => {
    it('should return 400 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/nuvemshop')
        .set('Content-Type', 'application/json')
        .send('{"store_id":123,"event":"order/created","id":999}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({ store_id: 123, event: 'order/created', id: 999 });

      const response = await request(app)
        .post('/webhooks/nuvemshop')
        .set('Content-Type', 'application/json')
        .set('x-linkedstore-hmac-sha256', 'deadbeef')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({ store_id: 123, event: 'order/created', id: 999 });
      const signature = generateNuvemshopSignature(payload, clientSecret);

      const response = await request(app)
        .post('/webhooks/nuvemshop')
        .set('Content-Type', 'application/json')
        .set('x-linkedstore-hmac-sha256', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle different webhook events', async () => {
      const events = [
        'order/created',
        'order/paid',
        'order/cancelled',
        'order/updated',
        'order/fulfilled',
        'product/created',
        'product/updated',
        'product/deleted',
        'customer/created',
        'app/uninstalled'
      ];

      for (const event of events) {
        const payload = JSON.stringify({ store_id: 123, event, id: 456 });
        const signature = generateNuvemshopSignature(payload, clientSecret);

        const response = await request(app)
          .post('/webhooks/nuvemshop')
          .set('Content-Type', 'application/json')
          .set('x-linkedstore-hmac-sha256', signature)
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
