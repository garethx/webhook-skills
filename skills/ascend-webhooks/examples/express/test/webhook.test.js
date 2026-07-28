const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.ASCEND_WEBHOOK_SECRET = 'test_ascend_secret';

const app = require('../src/index');

/**
 * Generate a valid Ascend signature header for testing.
 * Signed string is `<timestamp>:<payload>` (colon separator, RAW body).
 */
function generateAscendSignature(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}:${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('Ascend Webhook Endpoint', () => {
  const webhookSecret = process.env.ASCEND_WEBHOOK_SECRET;

  describe('POST /webhooks/ascend', () => {
    it('should return 400 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/ascend')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid signature');
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({
        id: 'evt_test_123',
        type: 'invoice.paid',
        data: { id: 'inv_test_123' },
      });

      const response = await request(app)
        .post('/webhooks/ascend')
        .set('Content-Type', 'application/json')
        .set('X-Ascend-Signature', 't=123,v1=deadbeef')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 400 for tampered payload', async () => {
      const originalPayload = JSON.stringify({
        id: 'evt_test_123',
        type: 'invoice.paid',
        data: { id: 'inv_test_123' },
      });

      // Sign the original payload but send a different one.
      const signature = generateAscendSignature(originalPayload, webhookSecret);
      const tamperedPayload = JSON.stringify({
        id: 'evt_test_123',
        type: 'invoice.paid',
        data: { id: 'inv_tampered' },
      });

      const response = await request(app)
        .post('/webhooks/ascend')
        .set('Content-Type', 'application/json')
        .set('X-Ascend-Signature', signature)
        .send(tamperedPayload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({
        id: 'evt_test_valid',
        type: 'invoice.paid',
        data: { id: 'inv_test_valid', invoice_number: 'II2DH1HGHJ' },
      });
      const signature = generateAscendSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/ascend')
        .set('Content-Type', 'application/json')
        .set('X-Ascend-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle different event types', async () => {
      const eventTypes = [
        'invoice.paid',
        'invoice.voided',
        'payout.paid',
        'refund.paid',
        'unknown.event.type',
      ];

      for (const eventType of eventTypes) {
        const payload = JSON.stringify({
          id: `evt_${eventType.replace(/\./g, '_')}`,
          type: eventType,
          data: { id: 'obj_123' },
        });
        const signature = generateAscendSignature(payload, webhookSecret);

        const response = await request(app)
          .post('/webhooks/ascend')
          .set('Content-Type', 'application/json')
          .set('X-Ascend-Signature', signature)
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
