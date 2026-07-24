const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.SHIPHERO_WEBHOOK_SECRET = 'test_shiphero_secret';

const { app, verifyShipHeroWebhook } = require('../src/index');

/**
 * Generate a valid ShipHero HMAC signature for testing.
 * Matches ShipHero's algorithm: base64(HMAC-SHA256(rawBody, secret)).
 */
function generateShipHeroSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

describe('ShipHero Webhook Endpoint', () => {
  const secret = process.env.SHIPHERO_WEBHOOK_SECRET;

  describe('verifyShipHeroWebhook', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"webhook_type":"Order Allocated"}');
      const signature = generateShipHeroSignature(payload, secret);

      expect(verifyShipHeroWebhook(payload, signature, secret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"webhook_type":"Order Allocated"}');

      expect(verifyShipHeroWebhook(payload, 'invalid_signature', secret)).toBe(false);
    });

    it('should return false when signature header is missing', () => {
      const payload = Buffer.from('{"webhook_type":"Order Allocated"}');

      expect(verifyShipHeroWebhook(payload, undefined, secret)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = Buffer.from('{"webhook_type":"Inventory Update","qty":10}');
      const signature = generateShipHeroSignature(original, secret);
      const tampered = Buffer.from('{"webhook_type":"Inventory Update","qty":999}');

      expect(verifyShipHeroWebhook(tampered, signature, secret)).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from('{"webhook_type":"Order Allocated"}');
      const signature = generateShipHeroSignature(payload, secret);

      expect(verifyShipHeroWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });
  });

  describe('POST /webhooks/shiphero', () => {
    it('should return 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/shiphero')
        .set('Content-Type', 'application/json')
        .send('{"webhook_type":"Order Allocated"}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for an invalid signature', async () => {
      const payload = JSON.stringify({ webhook_type: 'Order Allocated' });

      const response = await request(app)
        .post('/webhooks/shiphero')
        .set('Content-Type', 'application/json')
        .set('x-shiphero-hmac-sha256', 'invalid_signature')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 and the ShipHero ack body for a valid signature', async () => {
      const payload = JSON.stringify({
        account_id: 63898,
        webhook_type: 'Order Allocated',
        order_number: 'SO-1001',
      });
      const signature = generateShipHeroSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/shiphero')
        .set('Content-Type', 'application/json')
        .set('x-shiphero-hmac-sha256', signature)
        .set('X-Shiphero-Message-ID', 'msg-123')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ code: '200', Status: 'Success' });
    });

    it('should handle the different ShipHero webhook types', async () => {
      const types = [
        'Order Allocated',
        'Shipment Update',
        'Inventory Update',
        'Order Canceled',
        'PO Update',
        'Return Update',
        'Tote Complete',
        'Package Added',
      ];

      for (const webhook_type of types) {
        const payload = JSON.stringify({ account_id: 63898, webhook_type });
        const signature = generateShipHeroSignature(payload, secret);

        const response = await request(app)
          .post('/webhooks/shiphero')
          .set('Content-Type', 'application/json')
          .set('x-shiphero-hmac-sha256', signature)
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
