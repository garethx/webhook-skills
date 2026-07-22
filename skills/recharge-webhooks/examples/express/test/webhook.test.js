const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.RECHARGE_API_CLIENT_SECRET = 'test_client_secret';

const { app, verifyRechargeWebhook } = require('../src/index');

/**
 * Generate a valid Recharge signature for testing.
 * Recharge uses a plain SHA-256 of (clientSecret + rawBody), hex-encoded - NOT HMAC.
 */
function generateRechargeSignature(payload, secret) {
  return crypto
    .createHash('sha256')
    .update(secret)
    .update(payload)
    .digest('hex');
}

describe('Recharge Webhook Endpoint', () => {
  const clientSecret = process.env.RECHARGE_API_CLIENT_SECRET;

  describe('verifyRechargeWebhook', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');
      const signature = generateRechargeSignature(payload, clientSecret);

      expect(verifyRechargeWebhook(payload, signature, clientSecret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');

      expect(verifyRechargeWebhook(payload, 'invalid_signature', clientSecret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');

      expect(verifyRechargeWebhook(payload, undefined, clientSecret)).toBe(false);
    });

    it('should return false for a tampered body', () => {
      const original = Buffer.from('{"charge":{"id":123,"total_price":"10.00"}}');
      const signature = generateRechargeSignature(original, clientSecret);
      const tampered = Buffer.from('{"charge":{"id":123,"total_price":"999.00"}}');

      expect(verifyRechargeWebhook(tampered, signature, clientSecret)).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');
      const signature = generateRechargeSignature(payload, clientSecret);

      expect(verifyRechargeWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });

    it('should NOT match an HMAC signature (Recharge is a plain hash)', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');
      const hmacSig = crypto
        .createHmac('sha256', clientSecret)
        .update(payload)
        .digest('hex');

      expect(verifyRechargeWebhook(payload, hmacSig, clientSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/recharge', () => {
    it('should return 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/recharge')
        .set('Content-Type', 'application/json')
        .set('X-Recharge-Topic', 'charge/paid')
        .send('{"charge":{"id":123}}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for an invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/recharge')
        .set('Content-Type', 'application/json')
        .set('X-Recharge-Hmac-Sha256', 'invalid_signature')
        .set('X-Recharge-Topic', 'charge/paid')
        .send('{"charge":{"id":123}}');

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid signature', async () => {
      const payload = JSON.stringify({ charge: { id: 123, status: 'success' } });
      const signature = generateRechargeSignature(payload, clientSecret);

      const response = await request(app)
        .post('/webhooks/recharge')
        .set('Content-Type', 'application/json')
        .set('X-Recharge-Hmac-Sha256', signature)
        .set('X-Recharge-Topic', 'charge/paid')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle different webhook topics', async () => {
      const topics = [
        'charge/created',
        'charge/paid',
        'charge/failed',
        'subscription/created',
        'subscription/cancelled',
        'order/created',
        'order/processed',
        'customer/updated'
      ];

      for (const topic of topics) {
        const payload = JSON.stringify({ charge: { id: 456 } });
        const signature = generateRechargeSignature(payload, clientSecret);

        const response = await request(app)
          .post('/webhooks/recharge')
          .set('Content-Type', 'application/json')
          .set('X-Recharge-Hmac-Sha256', signature)
          .set('X-Recharge-Topic', topic)
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
