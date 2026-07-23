const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.SANITY_WEBHOOK_SECRET = 'test_webhook_secret';

const app = require('../src/index');

/**
 * Generate a valid Sanity webhook signature for testing.
 *
 * Matches @sanity/webhook: HMAC-SHA256 over `${timestamp}.${payload}` where the
 * timestamp is in MILLISECONDS, base64url-encoded with no padding, formatted as
 * `t=<timestamp>,v1=<signature>`.
 */
function generateSanitySignature(payload, secret) {
  const timestamp = Date.now(); // milliseconds
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('base64url'); // base64url, no padding
  return `t=${timestamp},v1=${signature}`;
}

describe('Sanity Webhook Endpoint', () => {
  const webhookSecret = process.env.SANITY_WEBHOOK_SECRET;

  describe('POST /webhooks/sanity', () => {
    it('should return 400 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/sanity')
        .set('Content-Type', 'application/json')
        .send('{"_type":"post","_id":"abc"}');

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({ _type: 'post', _id: 'abc' });

      const response = await request(app)
        .post('/webhooks/sanity')
        .set('Content-Type', 'application/json')
        .set('sanity-webhook-signature', 't=1609459200000,v1=invalid_signature')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 400 for tampered payload', async () => {
      const originalPayload = JSON.stringify({ _type: 'post', _id: 'abc' });
      const signature = generateSanitySignature(originalPayload, webhookSecret);
      const tamperedPayload = JSON.stringify({ _type: 'post', _id: 'hacked' });

      const response = await request(app)
        .post('/webhooks/sanity')
        .set('Content-Type', 'application/json')
        .set('sanity-webhook-signature', signature)
        .send(tamperedPayload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({ _type: 'post', _id: 'abc', _rev: 'r1' });
      const signature = generateSanitySignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/sanity')
        .set('Content-Type', 'application/json')
        .set('sanity-webhook-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle different document types', async () => {
      const types = ['post', 'author', 'product', 'category', 'page', 'unknownType'];

      for (const type of types) {
        const payload = JSON.stringify({ _type: type, _id: `${type}_1` });
        const signature = generateSanitySignature(payload, webhookSecret);

        const response = await request(app)
          .post('/webhooks/sanity')
          .set('Content-Type', 'application/json')
          .set('sanity-webhook-signature', signature)
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
