const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.REVOLUT_SIGNING_SECRET = 'wsk_test_secret';

const app = require('../src/index');

/**
 * Generate a valid Revolut signature header for testing.
 * Signed payload is `v1.{timestamp}.{raw body}`, HMAC-SHA256, hex.
 */
function generateRevolutSignature(payload, secret, timestamp = String(Date.now())) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`v1.${timestamp}.${payload}`)
    .digest('hex');
  return { signature: `v1=${signature}`, timestamp };
}

describe('Revolut Webhook Endpoint', () => {
  const secret = process.env.REVOLUT_SIGNING_SECRET;

  describe('POST /webhooks/revolut', () => {
    it('should return 400 for missing signature headers', async () => {
      const response = await request(app)
        .post('/webhooks/revolut')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({
        event: 'ORDER_COMPLETED',
        order_id: 'ord_123',
      });

      const response = await request(app)
        .post('/webhooks/revolut')
        .set('Content-Type', 'application/json')
        .set('Revolut-Request-Timestamp', String(Date.now()))
        .set('Revolut-Signature', 'v1=invalidsignature')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid signature');
    });

    it('should return 400 for a tampered payload', async () => {
      const original = JSON.stringify({ event: 'ORDER_COMPLETED', order_id: 'ord_123' });
      const { signature, timestamp } = generateRevolutSignature(original, secret);
      const tampered = JSON.stringify({ event: 'ORDER_COMPLETED', order_id: 'ord_tampered' });

      const response = await request(app)
        .post('/webhooks/revolut')
        .set('Content-Type', 'application/json')
        .set('Revolut-Request-Timestamp', timestamp)
        .set('Revolut-Signature', signature)
        .send(tampered);

      expect(response.status).toBe(400);
    });

    it('should return 400 for a stale timestamp', async () => {
      const payload = JSON.stringify({ event: 'ORDER_COMPLETED', order_id: 'ord_123' });
      const staleTs = String(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const { signature } = generateRevolutSignature(payload, secret, staleTs);

      const response = await request(app)
        .post('/webhooks/revolut')
        .set('Content-Type', 'application/json')
        .set('Revolut-Request-Timestamp', staleTs)
        .set('Revolut-Signature', signature)
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        event: 'ORDER_COMPLETED',
        order_id: 'ord_valid',
        merchant_order_ext_ref: 'Order #1',
      });
      const { signature, timestamp } = generateRevolutSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/revolut')
        .set('Content-Type', 'application/json')
        .set('Revolut-Request-Timestamp', timestamp)
        .set('Revolut-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should accept any of multiple comma-separated signatures (rotation)', async () => {
      const payload = JSON.stringify({ event: 'ORDER_AUTHORISED', order_id: 'ord_rot' });
      const { signature, timestamp } = generateRevolutSignature(payload, secret);
      const header = `v1=deadbeef,${signature}`; // first is wrong, second is correct

      const response = await request(app)
        .post('/webhooks/revolut')
        .set('Content-Type', 'application/json')
        .set('Revolut-Request-Timestamp', timestamp)
        .set('Revolut-Signature', header)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle different event types', async () => {
      const eventTypes = [
        'ORDER_COMPLETED',
        'ORDER_AUTHORISED',
        'ORDER_CANCELLED',
        'ORDER_PAYMENT_AUTHENTICATED',
        'ORDER_PAYMENT_DECLINED',
        'ORDER_PAYMENT_FAILED',
        'UNKNOWN_EVENT',
      ];

      for (const eventType of eventTypes) {
        const payload = JSON.stringify({ event: eventType, order_id: 'ord_123' });
        const { signature, timestamp } = generateRevolutSignature(payload, secret);

        const response = await request(app)
          .post('/webhooks/revolut')
          .set('Content-Type', 'application/json')
          .set('Revolut-Request-Timestamp', timestamp)
          .set('Revolut-Signature', signature)
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
