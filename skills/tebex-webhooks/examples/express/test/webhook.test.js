const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.TEBEX_WEBHOOK_SECRET = 'test_webhook_secret';

const app = require('../src/index');

/**
 * Generate a valid Tebex signature for testing.
 *
 * Matches the provider's two-step algorithm:
 *   HMAC-SHA256(secret, SHA256(body))
 */
function generateTebexSignature(payload, secret) {
  const bodyHash = crypto.createHash('sha256').update(payload).digest('hex');
  return crypto.createHmac('sha256', secret).update(bodyHash).digest('hex');
}

describe('Tebex Webhook Endpoint', () => {
  const webhookSecret = process.env.TEBEX_WEBHOOK_SECRET;

  describe('POST /webhooks/tebex', () => {
    it('should return 400 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/tebex')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({
        id: 'evt_123',
        type: 'payment.completed',
        subject: { transaction_id: 'tbx-1' }
      });

      const response = await request(app)
        .post('/webhooks/tebex')
        .set('Content-Type', 'application/json')
        .set('X-Signature', 'deadbeef')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid signature');
    });

    it('should return 400 for a tampered payload', async () => {
      const originalPayload = JSON.stringify({
        id: 'evt_123',
        type: 'payment.completed',
        subject: { transaction_id: 'tbx-1' }
      });
      // Sign the original but send a different body
      const signature = generateTebexSignature(originalPayload, webhookSecret);
      const tamperedPayload = JSON.stringify({
        id: 'evt_123',
        type: 'payment.completed',
        subject: { transaction_id: 'tbx-tampered' }
      });

      const response = await request(app)
        .post('/webhooks/tebex')
        .set('Content-Type', 'application/json')
        .set('X-Signature', signature)
        .send(tamperedPayload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        id: 'evt_valid',
        type: 'payment.completed',
        subject: { transaction_id: 'tbx-valid' }
      });
      const signature = generateTebexSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/tebex')
        .set('Content-Type', 'application/json')
        .set('X-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should echo the id back for validation.webhook', async () => {
      const payload = JSON.stringify({
        id: 'wh_validation_123',
        type: 'validation.webhook',
        subject: {}
      });
      const signature = generateTebexSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/tebex')
        .set('Content-Type', 'application/json')
        .set('X-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: 'wh_validation_123' });
    });

    it('should handle different event types', async () => {
      const eventTypes = [
        'payment.completed',
        'payment.declined',
        'payment.refunded',
        'payment.dispute.opened',
        'payment.dispute.won',
        'payment.dispute.lost',
        'payment.dispute.closed',
        'recurring-payment.started',
        'recurring-payment.renewed',
        'recurring-payment.ended',
        'recurring-payment.cancellation.requested',
        'recurring-payment.cancellation.aborted',
        'unknown.event.type'
      ];

      for (const eventType of eventTypes) {
        const payload = JSON.stringify({
          id: `evt_${eventType.replace(/[.-]/g, '_')}`,
          type: eventType,
          subject: { transaction_id: 'tbx-1' }
        });
        const signature = generateTebexSignature(payload, webhookSecret);

        const response = await request(app)
          .post('/webhooks/tebex')
          .set('Content-Type', 'application/json')
          .set('X-Signature', signature)
          .send(payload);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });
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
