const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.FRONT_WEBHOOK_SECRET = 'test_app_signing_key';

const app = require('../src/index');

/**
 * Generate a valid Front signature for testing.
 * base64(HMAC-SHA256(key = secret, msg = timestamp + ":" + rawBody))
 */
function generateFrontSignature(payload, secret, timestamp) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(timestamp + ':');
  hmac.update(Buffer.from(payload, 'utf8'));
  return hmac.digest('base64');
}

describe('Front Webhook Endpoint', () => {
  const webhookSecret = process.env.FRONT_WEBHOOK_SECRET;

  describe('POST /webhooks/frontapp', () => {
    it('should echo the X-Front-Challenge on subscription validation', async () => {
      const response = await request(app)
        .post('/webhooks/frontapp')
        .set('Content-Type', 'application/json')
        .set('X-Front-Challenge', 'abc123challenge')
        .send('');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ challenge: 'abc123challenge' });
    });

    it('should return 400 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/frontapp')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({
        type: 'inbound',
        payload: { id: 'evt_test' }
      });

      const response = await request(app)
        .post('/webhooks/frontapp')
        .set('Content-Type', 'application/json')
        .set('X-Front-Request-Timestamp', '1615496636')
        .set('X-Front-Signature', 'invalid_signature')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 400 for tampered payload', async () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const originalPayload = JSON.stringify({
        type: 'inbound',
        payload: { id: 'evt_original' }
      });
      const signature = generateFrontSignature(originalPayload, webhookSecret, timestamp);

      const tamperedPayload = JSON.stringify({
        type: 'inbound',
        payload: { id: 'evt_tampered' }
      });

      const response = await request(app)
        .post('/webhooks/frontapp')
        .set('Content-Type', 'application/json')
        .set('X-Front-Request-Timestamp', timestamp)
        .set('X-Front-Signature', signature)
        .send(tamperedPayload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for valid signature', async () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const payload = JSON.stringify({
        type: 'inbound',
        payload: { id: 'evt_valid', conversation: { id: 'cnv_valid' } }
      });
      const signature = generateFrontSignature(payload, webhookSecret, timestamp);

      const response = await request(app)
        .post('/webhooks/frontapp')
        .set('Content-Type', 'application/json')
        .set('X-Front-Request-Timestamp', timestamp)
        .set('X-Front-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle different event types', async () => {
      const eventTypes = [
        'inbound',
        'outbound',
        'move',
        'assign',
        'archive',
        'tag',
        'comment',
        'message_bounce_error',
        'unknown_event'
      ];

      for (const eventType of eventTypes) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const payload = JSON.stringify({
          type: eventType,
          payload: { id: `evt_${eventType}`, conversation: { id: 'cnv_123' } }
        });
        const signature = generateFrontSignature(payload, webhookSecret, timestamp);

        const response = await request(app)
          .post('/webhooks/frontapp')
          .set('Content-Type', 'application/json')
          .set('X-Front-Request-Timestamp', timestamp)
          .set('X-Front-Signature', signature)
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
