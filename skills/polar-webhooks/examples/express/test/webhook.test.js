const fs = require('fs');
const path = require('path');
const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app
process.env.POLAR_WEBHOOK_SECRET = 'polar_whs_test_secret';

const app = require('../src/index');

const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;

// A complete, schema-valid `order.paid` payload (matches @polar-sh/sdk's parser).
const orderPaidFixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'order-paid.json'),
  'utf8'
);

/**
 * Generate valid Standard Webhooks headers for a payload, exactly as Polar signs.
 *
 * Signed content: `${webhookId}.${timestamp}.${payload}`
 * Signature: base64(HMAC-SHA256(key, signedContent)), where key is the raw UTF-8
 * bytes of the dashboard secret. (The SDK base64-encodes the secret before signing,
 * and the verifier base64-decodes it back, so the effective key is the raw secret.)
 * The header value is `v1,<signature>`.
 */
function generatePolarHeaders(payload, secret, { id = 'msg_test_123', timestamp } = {}) {
  const ts = timestamp || Math.floor(Date.now() / 1000).toString();
  const signedContent = `${id}.${ts}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('base64');
  return {
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': `v1,${signature}`,
  };
}

describe('Polar Webhook Endpoint', () => {
  describe('POST /webhooks/polar', () => {
    it('should return 400 for missing signature headers', async () => {
      const response = await request(app)
        .post('/webhooks/polar')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/polar')
        .set('Content-Type', 'application/json')
        .set('webhook-id', 'msg_test_123')
        .set('webhook-timestamp', Math.floor(Date.now() / 1000).toString())
        .set('webhook-signature', 'v1,invalidsignature')
        .send(orderPaidFixture);

      expect(response.status).toBe(400);
    });

    it('should return 400 for a tampered payload', async () => {
      // Sign the original payload, then send a modified one.
      const headers = generatePolarHeaders(orderPaidFixture, webhookSecret);
      const tampered = JSON.stringify({
        ...JSON.parse(orderPaidFixture),
        data: { ...JSON.parse(orderPaidFixture).data, total_amount: 999999 },
      });

      const response = await request(app)
        .post('/webhooks/polar')
        .set('Content-Type', 'application/json')
        .set(headers)
        .send(tampered);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid, fully-parsed event', async () => {
      const headers = generatePolarHeaders(orderPaidFixture, webhookSecret);

      const response = await request(app)
        .post('/webhooks/polar')
        .set('Content-Type', 'application/json')
        .set(headers)
        .send(orderPaidFixture);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should reject an old timestamp (replay protection)', async () => {
      const oldTs = (Math.floor(Date.now() / 1000) - 60 * 60).toString();
      const headers = generatePolarHeaders(orderPaidFixture, webhookSecret, {
        timestamp: oldTs,
      });

      const response = await request(app)
        .post('/webhooks/polar')
        .set('Content-Type', 'application/json')
        .set(headers)
        .send(orderPaidFixture);

      expect(response.status).toBe(400);
    });

    it('should acknowledge an authentic event it cannot parse (2xx, no retry)', async () => {
      // Valid signature, but a payload/type this SDK version does not model.
      const payload = JSON.stringify({
        type: 'some.future.event',
        data: { id: 'obj_123' },
      });
      const headers = generatePolarHeaders(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/polar')
        .set('Content-Type', 'application/json')
        .set(headers)
        .send(payload);

      // 2xx so Polar does not retry and eventually auto-disable the endpoint.
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
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
