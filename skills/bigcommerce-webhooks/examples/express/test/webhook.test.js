const request = require('supertest');
const { Webhook } = require('standardwebhooks');

// Set test environment before importing the app.
// BIGCOMMERCE_CLIENT_SECRET is the app's client secret (raw); the handler
// base64-encodes it before handing it to the standardwebhooks library.
process.env.BIGCOMMERCE_CLIENT_SECRET = 'test_client_secret_value';

const app = require('../src/index');

// Reconstruct the same signer the handler uses: base64-encoded client secret.
const wh = new Webhook(
  Buffer.from(process.env.BIGCOMMERCE_CLIENT_SECRET).toString('base64')
);

/**
 * Generate valid Standard Webhooks headers for a payload.
 * Signs `${webhookId}.${unixTimestamp}.${payload}` with HMAC-SHA256.
 */
function signedHeaders(payload, { webhookId = 'msg_test_123', date = new Date() } = {}) {
  const signature = wh.sign(webhookId, date, payload);
  return {
    'webhook-id': webhookId,
    'webhook-timestamp': Math.floor(date.getTime() / 1000).toString(),
    'webhook-signature': signature,
  };
}

describe('BigCommerce Webhook Endpoint', () => {
  describe('POST /webhooks/bigcommerce', () => {
    it('returns 400 when signature headers are missing', async () => {
      const response = await request(app)
        .post('/webhooks/bigcommerce')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 400 for an invalid signature', async () => {
      const payload = JSON.stringify({
        scope: 'store/order/created',
        data: { type: 'order', id: 123 },
      });

      const response = await request(app)
        .post('/webhooks/bigcommerce')
        .set('Content-Type', 'application/json')
        .set('webhook-id', 'msg_test_123')
        .set('webhook-timestamp', Math.floor(Date.now() / 1000).toString())
        .set('webhook-signature', 'v1,not_a_real_signature')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 400 for an expired timestamp (replay protection)', async () => {
      const payload = JSON.stringify({
        scope: 'store/order/created',
        data: { type: 'order', id: 123 },
      });
      // 10 minutes ago — outside the 5-minute Standard Webhooks tolerance.
      const oldDate = new Date(Date.now() - 600 * 1000);

      const response = await request(app)
        .post('/webhooks/bigcommerce')
        .set('Content-Type', 'application/json')
        .set(signedHeaders(payload, { date: oldDate }))
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 400 when the payload is tampered after signing', async () => {
      const original = JSON.stringify({
        scope: 'store/order/created',
        data: { type: 'order', id: 123 },
      });
      const headers = signedHeaders(original);

      const tampered = JSON.stringify({
        scope: 'store/order/created',
        data: { type: 'order', id: 999 },
      });

      const response = await request(app)
        .post('/webhooks/bigcommerce')
        .set('Content-Type', 'application/json')
        .set(headers)
        .send(tampered);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        store_id: '1000',
        producer: 'stores/abc123',
        scope: 'store/order/statusUpdated',
        data: { type: 'order', id: 173331 },
        hash: 'a1b2c3',
        created_at: 1561479335,
      });

      const response = await request(app)
        .post('/webhooks/bigcommerce')
        .set('Content-Type', 'application/json')
        .set(signedHeaders(payload))
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('verifies with case-insensitive headers', async () => {
      const payload = JSON.stringify({
        scope: 'store/product/updated',
        data: { type: 'product', id: 42 },
      });
      const headers = signedHeaders(payload);

      const response = await request(app)
        .post('/webhooks/bigcommerce')
        .set('Content-Type', 'application/json')
        .set('Webhook-Id', headers['webhook-id'])
        .set('WEBHOOK-TIMESTAMP', headers['webhook-timestamp'])
        .set('webhook-signature', headers['webhook-signature'])
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    const scopes = [
      'store/order/created',
      'store/order/updated',
      'store/order/statusUpdated',
      'store/product/created',
      'store/product/updated',
      'store/product/deleted',
      'store/product/inventory/updated',
      'store/customer/created',
      'store/cart/created',
      'store/cart/abandoned',
    ];

    scopes.forEach((scope) => {
      it(`handles ${scope}`, async () => {
        const payload = JSON.stringify({
          scope,
          data: { type: scope.split('/')[1], id: 555 },
        });

        const response = await request(app)
          .post('/webhooks/bigcommerce')
          .set('Content-Type', 'application/json')
          .set(signedHeaders(payload))
          .send(payload);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });
      });
    });

    it('handles an unrecognized scope', async () => {
      const payload = JSON.stringify({
        scope: 'store/something/unknown',
        data: { type: 'thing', id: 1 },
      });

      const response = await request(app)
        .post('/webhooks/bigcommerce')
        .set('Content-Type', 'application/json')
        .set(signedHeaders(payload))
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });
  });

  describe('GET /health', () => {
    it('returns 200 OK', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
