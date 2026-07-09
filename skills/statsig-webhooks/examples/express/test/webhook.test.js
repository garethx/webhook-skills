const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.STATSIG_WEBHOOK_SECRET = 'test_statsig_secret';

const app = require('../src/index');

/**
 * Generate a valid Statsig signature for testing
 */
function generateStatsigSignature(rawBody, timestamp, secret) {
  const basestring = `v0:${timestamp}:${rawBody}`;
  return 'v0=' + crypto.createHmac('sha256', secret).update(basestring).digest('hex');
}

describe('Statsig Webhook Endpoint', () => {
  const webhookSecret = process.env.STATSIG_WEBHOOK_SECRET;
  const timestamp = '1655231253265';

  describe('POST /webhooks/statsig', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/statsig')
        .set('Content-Type', 'application/json')
        .set('X-Statsig-Request-Timestamp', timestamp)
        .send('{"data":[]}');

      expect(response.status).toBe(401);
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({ data: [{ eventName: 'statsig::gate_exposure' }] });

      const response = await request(app)
        .post('/webhooks/statsig')
        .set('Content-Type', 'application/json')
        .set('X-Statsig-Request-Timestamp', timestamp)
        .set('X-Statsig-Signature', 'v0=invalid_signature')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 401 for tampered payload', async () => {
      const originalPayload = JSON.stringify({ data: [{ eventName: 'statsig::gate_exposure' }] });
      const signature = generateStatsigSignature(originalPayload, timestamp, webhookSecret);
      const tamperedPayload = JSON.stringify({ data: [{ eventName: 'statsig::config_change' }] });

      const response = await request(app)
        .post('/webhooks/statsig')
        .set('Content-Type', 'application/json')
        .set('X-Statsig-Request-Timestamp', timestamp)
        .set('X-Statsig-Signature', signature)
        .send(tamperedPayload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({
        data: [{ eventName: 'statsig::gate_exposure', metadata: { gate: 'a_gate' } }]
      });
      const signature = generateStatsigSignature(payload, timestamp, webhookSecret);

      const response = await request(app)
        .post('/webhooks/statsig')
        .set('Content-Type', 'application/json')
        .set('X-Statsig-Request-Timestamp', timestamp)
        .set('X-Statsig-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle different event types', async () => {
      const eventNames = [
        'statsig::gate_exposure',
        'statsig::config_exposure',
        'statsig::experiment_exposure',
        'statsig::config_change',
        'my_custom_event'
      ];

      for (const eventName of eventNames) {
        const payload = JSON.stringify({ data: [{ eventName, metadata: {} }] });
        const signature = generateStatsigSignature(payload, timestamp, webhookSecret);

        const response = await request(app)
          .post('/webhooks/statsig')
          .set('Content-Type', 'application/json')
          .set('X-Statsig-Request-Timestamp', timestamp)
          .set('X-Statsig-Signature', signature)
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
