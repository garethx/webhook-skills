const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.ATTENTIVE_WEBHOOK_SECRET = 'test_attentive_signing_key';

const { app, verifyAttentiveWebhook } = require('../src/index');

/**
 * Generate a valid Attentive signature for testing:
 * HMAC-SHA256 over the raw body, hex-encoded.
 */
function generateAttentiveSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

describe('Attentive Webhook Endpoint', () => {
  const webhookSecret = process.env.ATTENTIVE_WEBHOOK_SECRET;

  describe('verifyAttentiveWebhook', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"type":"sms.subscribed"}');
      const signature = generateAttentiveSignature(payload, webhookSecret);

      expect(verifyAttentiveWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"type":"sms.subscribed"}');

      expect(verifyAttentiveWebhook(payload, 'deadbeef', webhookSecret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"type":"sms.subscribed"}');

      expect(verifyAttentiveWebhook(payload, null, webhookSecret)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = Buffer.from('{"type":"sms.subscribed","id":1}');
      const signature = generateAttentiveSignature(original, webhookSecret);
      const tampered = Buffer.from('{"type":"sms.subscribed","id":999}');

      expect(verifyAttentiveWebhook(tampered, signature, webhookSecret)).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from('{"type":"sms.subscribed"}');
      const signature = generateAttentiveSignature(payload, webhookSecret);

      expect(verifyAttentiveWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });

    it('should return false for a non-hex signature header', () => {
      const payload = Buffer.from('{"type":"sms.subscribed"}');

      expect(verifyAttentiveWebhook(payload, 'not-a-valid-hex-string', webhookSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/attentive', () => {
    it('should return 401 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/attentive')
        .set('Content-Type', 'application/json')
        .send('{"type":"sms.subscribed"}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for an invalid signature', async () => {
      const payload = JSON.stringify({ type: 'sms.subscribed' });

      const response = await request(app)
        .post('/webhooks/attentive')
        .set('Content-Type', 'application/json')
        .set('x-attentive-hmac-sha256', 'deadbeef')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for a valid sms.subscribed event', async () => {
      const payload = JSON.stringify({
        type: 'sms.subscribed',
        timestamp: 1721664000000,
        subscriber: { phone: '+15555550123' }
      });
      const signature = generateAttentiveSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/attentive')
        .set('Content-Type', 'application/json')
        .set('x-attentive-hmac-sha256', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle sms.unsubscribed event', async () => {
      const payload = JSON.stringify({
        type: 'sms.unsubscribed',
        timestamp: 1721664000000,
        subscriber: { phone: '+15555550123' }
      });
      const signature = generateAttentiveSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/attentive')
        .set('Content-Type', 'application/json')
        .set('x-attentive-hmac-sha256', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle email.opened event', async () => {
      const payload = JSON.stringify({
        type: 'email.opened',
        timestamp: 1721664000000,
        subscriber: { email: 'user@example.com' }
      });
      const signature = generateAttentiveSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/attentive')
        .set('Content-Type', 'application/json')
        .set('x-attentive-hmac-sha256', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle custom_attribute.set event', async () => {
      const payload = JSON.stringify({
        type: 'custom_attribute.set',
        timestamp: 1721664000000,
        subscriber: { email: 'user@example.com' }
      });
      const signature = generateAttentiveSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/attentive')
        .set('Content-Type', 'application/json')
        .set('x-attentive-hmac-sha256', signature)
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
