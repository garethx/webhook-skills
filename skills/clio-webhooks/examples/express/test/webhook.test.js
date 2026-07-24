const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.CLIO_WEBHOOK_SECRET = 'test_clio_shared_secret';

const { app, verifyClioWebhook } = require('../src/index');

/**
 * Generate a valid Clio signature for testing.
 * Clio: HMAC-SHA256 of the raw body, keyed with the shared secret. Clio's docs
 * do not specify hex vs base64, so the handler accepts either.
 */
function generateClioSignature(payload, secret, encoding = 'hex') {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest(encoding);
}

describe('Clio Webhook Endpoint', () => {
  const webhookSecret = process.env.CLIO_WEBHOOK_SECRET;

  describe('verifyClioWebhook', () => {
    it('should return true for a valid hex signature', () => {
      const payload = Buffer.from('{"meta":{"event":"created"}}');
      const signature = generateClioSignature(payload, webhookSecret, 'hex');

      expect(verifyClioWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return true for a valid base64 signature', () => {
      const payload = Buffer.from('{"meta":{"event":"created"}}');
      const signature = generateClioSignature(payload, webhookSecret, 'base64');

      expect(verifyClioWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"meta":{"event":"created"}}');

      expect(verifyClioWebhook(payload, 'deadbeef', webhookSecret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"meta":{"event":"created"}}');

      expect(verifyClioWebhook(payload, null, webhookSecret)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const signature = generateClioSignature(
        Buffer.from('{"data":{"id":1}}'),
        webhookSecret
      );

      expect(
        verifyClioWebhook(Buffer.from('{"data":{"id":999}}'), signature, webhookSecret)
      ).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from('{"meta":{"event":"created"}}');
      const signature = generateClioSignature(payload, webhookSecret);

      expect(verifyClioWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });
  });

  describe('POST /webhooks/clio - handshake', () => {
    it('should echo X-Hook-Secret and return 200 for the handshake', async () => {
      const secret = 'handshake_secret_from_clio';

      const response = await request(app)
        .post('/webhooks/clio')
        .set('X-Hook-Secret', secret)
        .send('');

      expect(response.status).toBe(200);
      expect(response.headers['x-hook-secret']).toBe(secret);
    });
  });

  describe('POST /webhooks/clio - events', () => {
    it('should return 401 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/clio')
        .set('Content-Type', 'application/json')
        .send('{"meta":{"event":"created"}}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for an invalid signature', async () => {
      const payload = JSON.stringify({ meta: { event: 'created' } });

      const response = await request(app)
        .post('/webhooks/clio')
        .set('Content-Type', 'application/json')
        .set('X-Hook-Signature', 'deadbeef')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for a valid base64-signed event', async () => {
      const payload = JSON.stringify({
        data: { id: 152 },
        meta: { event: 'created', webhook_id: 1234 }
      });
      const signature = generateClioSignature(payload, webhookSecret, 'base64');

      const response = await request(app)
        .post('/webhooks/clio')
        .set('Content-Type', 'application/json')
        .set('X-Hook-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should return 200 for a valid created event', async () => {
      const payload = JSON.stringify({
        data: { id: 152, etag: '"abc"' },
        meta: { event: 'created', webhook_id: 1234 }
      });
      const signature = generateClioSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/clio')
        .set('Content-Type', 'application/json')
        .set('X-Hook-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle a matter_closed lifecycle event', async () => {
      const payload = JSON.stringify({
        data: { id: 77 },
        meta: { event: 'matter_closed', webhook_id: 1234 }
      });
      const signature = generateClioSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/clio')
        .set('Content-Type', 'application/json')
        .set('X-Hook-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
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
