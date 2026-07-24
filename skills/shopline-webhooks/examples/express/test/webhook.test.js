const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.SHOPLINE_APP_SECRET = 'test_shopline_secret';

const { app, verifyShoplineWebhook } = require('../src/index');

/**
 * Generate a valid SHOPLINE HMAC signature for testing.
 * SHOPLINE's documented encoding is base64 (Shopify-style).
 */
function generateShoplineSignature(payload, secret, encoding = 'base64') {
  return crypto.createHmac('sha256', secret).update(payload).digest(encoding);
}

describe('SHOPLINE Webhook Endpoint', () => {
  const appSecret = process.env.SHOPLINE_APP_SECRET;

  describe('verifyShoplineWebhook', () => {
    it('should return true for a valid base64 signature', () => {
      const payload = Buffer.from('{"id":123}');
      const signature = generateShoplineSignature(payload, appSecret, 'base64');

      expect(verifyShoplineWebhook(payload, signature, appSecret)).toBe(true);
    });

    it('should return true for a valid hex signature (fallback encoding)', () => {
      const payload = Buffer.from('{"id":123}');
      const signature = generateShoplineSignature(payload, appSecret, 'hex');

      expect(verifyShoplineWebhook(payload, signature, appSecret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"id":123}');

      expect(verifyShoplineWebhook(payload, 'invalid_signature', appSecret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"id":123}');

      expect(verifyShoplineWebhook(payload, undefined, appSecret)).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from('{"id":123}');
      const signature = generateShoplineSignature(payload, appSecret);

      expect(verifyShoplineWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const signature = generateShoplineSignature(Buffer.from('{"amount":100}'), appSecret);

      expect(verifyShoplineWebhook(Buffer.from('{"amount":999}'), signature, appSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/shopline', () => {
    it('should return 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/shopline')
        .set('Content-Type', 'application/json')
        .set('X-Shopline-Topic', 'orders/create')
        .set('X-Shopline-Shop-Domain', 'test.myshopline.com')
        .send('{"id":123}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for an invalid signature', async () => {
      const payload = JSON.stringify({ id: 123 });

      const response = await request(app)
        .post('/webhooks/shopline')
        .set('Content-Type', 'application/json')
        .set('X-Shopline-Hmac-Sha256', 'invalid_signature')
        .set('X-Shopline-Topic', 'orders/create')
        .set('X-Shopline-Shop-Domain', 'test.myshopline.com')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid signature', async () => {
      const payload = JSON.stringify({ id: 123, email: 'test@example.com' });
      const signature = generateShoplineSignature(payload, appSecret);

      const response = await request(app)
        .post('/webhooks/shopline')
        .set('Content-Type', 'application/json')
        .set('X-Shopline-Hmac-Sha256', signature)
        .set('X-Shopline-Topic', 'orders/create')
        .set('X-Shopline-Shop-Domain', 'test.myshopline.com')
        .set('X-Shopline-Webhook-Id', 'evt_123')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle different webhook topics', async () => {
      const topics = [
        'orders/create',
        'orders/update',
        'orders/paid',
        'orders/cancelled',
        'products/create',
        'products/update',
        'products/delete',
        'collect/create',
        'collect/delete',
        'customers/create',
        'app/uninstalled'
      ];

      for (const topic of topics) {
        const payload = JSON.stringify({ id: 456 });
        const signature = generateShoplineSignature(payload, appSecret);

        const response = await request(app)
          .post('/webhooks/shopline')
          .set('Content-Type', 'application/json')
          .set('X-Shopline-Hmac-Sha256', signature)
          .set('X-Shopline-Topic', topic)
          .set('X-Shopline-Shop-Domain', 'test.myshopline.com')
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
