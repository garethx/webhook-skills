const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.FASTSPRING_WEBHOOK_SECRET = 'test_fastspring_secret';

const { app, verifyFastSpringWebhook } = require('../src/index');

/**
 * Generate a valid FastSpring X-FS-Signature for testing.
 * base64( HMAC-SHA256( raw_body, secret ) )
 */
function generateFastSpringSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');
}

function batch(events) {
  return JSON.stringify({ events });
}

describe('FastSpring Webhook Endpoint', () => {
  const secret = process.env.FASTSPRING_WEBHOOK_SECRET;

  describe('verifyFastSpringWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from(batch([{ id: 'a', type: 'order.completed' }]));
      const signature = generateFastSpringSignature(payload, secret);

      expect(verifyFastSpringWebhook(payload, signature, secret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from(batch([{ id: 'a', type: 'order.completed' }]));

      expect(verifyFastSpringWebhook(payload, 'invalid_signature', secret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from(batch([{ id: 'a', type: 'order.completed' }]));

      expect(verifyFastSpringWebhook(payload, undefined, secret)).toBe(false);
    });

    it('should return false for tampered payload', () => {
      const original = Buffer.from(batch([{ id: 'a', type: 'order.completed' }]));
      const signature = generateFastSpringSignature(original, secret);
      const tampered = Buffer.from(batch([{ id: 'a', type: 'order.failed' }]));

      expect(verifyFastSpringWebhook(tampered, signature, secret)).toBe(false);
    });

    it('should return false for wrong secret', () => {
      const payload = Buffer.from(batch([{ id: 'a', type: 'order.completed' }]));
      const signature = generateFastSpringSignature(payload, secret);

      expect(verifyFastSpringWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });
  });

  describe('POST /webhooks/fastspring', () => {
    it('should return 400 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/fastspring')
        .set('Content-Type', 'application/json')
        .send(batch([{ id: 'a', type: 'order.completed' }]));

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for invalid signature', async () => {
      const payload = batch([{ id: 'a', type: 'order.completed' }]);

      const response = await request(app)
        .post('/webhooks/fastspring')
        .set('Content-Type', 'application/json')
        .set('X-FS-Signature', 'invalid_signature')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for valid signature', async () => {
      const payload = batch([
        { id: 'evt_1', type: 'order.completed', live: true, data: { order: 'ORD-1' } },
      ]);
      const signature = generateFastSpringSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/fastspring')
        .set('Content-Type', 'application/json')
        .set('X-FS-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should process a batch of multiple events', async () => {
      const payload = batch([
        { id: 'evt_1', type: 'order.completed' },
        { id: 'evt_2', type: 'subscription.activated' },
        { id: 'evt_3', type: 'subscription.charge.completed' },
      ]);
      const signature = generateFastSpringSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/fastspring')
        .set('Content-Type', 'application/json')
        .set('X-FS-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle different event types', async () => {
      const types = [
        'order.completed',
        'order.failed',
        'order.canceled',
        'subscription.activated',
        'subscription.charge.completed',
        'subscription.charge.failed',
        'subscription.updated',
        'subscription.canceled',
        'subscription.deactivated',
        'return.created',
      ];

      for (const type of types) {
        const payload = batch([{ id: `evt_${type}`, type }]);
        const signature = generateFastSpringSignature(payload, secret);

        const response = await request(app)
          .post('/webhooks/fastspring')
          .set('Content-Type', 'application/json')
          .set('X-FS-Signature', signature)
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
