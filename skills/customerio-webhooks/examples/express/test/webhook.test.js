const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.CUSTOMERIO_WEBHOOK_SIGNING_KEY = 'test_signing_key';

const { app, verifyCustomerIoWebhook } = require('../src/index');

/**
 * Generate a valid Customer.io signature for testing.
 * Signed string: "v0:<timestamp>:<raw body>", HMAC-SHA256, hex.
 */
function generateCustomerIoSignature(payload, timestamp, signingKey) {
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(`v0:${timestamp}:`);
  hmac.update(payload);
  return hmac.digest('hex');
}

describe('Customer.io Webhook Endpoint', () => {
  const signingKey = process.env.CUSTOMERIO_WEBHOOK_SIGNING_KEY;
  const timestamp = '1613063089';

  describe('verifyCustomerIoWebhook', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"object_type":"email","metric":"opened"}');
      const signature = generateCustomerIoSignature(payload, timestamp, signingKey);

      expect(verifyCustomerIoWebhook(payload, timestamp, signature, signingKey)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"object_type":"email","metric":"opened"}');

      expect(verifyCustomerIoWebhook(payload, timestamp, 'deadbeef', signingKey)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"object_type":"email","metric":"opened"}');

      expect(verifyCustomerIoWebhook(payload, timestamp, null, signingKey)).toBe(false);
    });

    it('should return false for a missing timestamp', () => {
      const payload = Buffer.from('{"object_type":"email","metric":"opened"}');
      const signature = generateCustomerIoSignature(payload, timestamp, signingKey);

      expect(verifyCustomerIoWebhook(payload, null, signature, signingKey)).toBe(false);
    });

    it('should return false when the timestamp is tampered', () => {
      const payload = Buffer.from('{"object_type":"email","metric":"opened"}');
      const signature = generateCustomerIoSignature(payload, timestamp, signingKey);

      expect(verifyCustomerIoWebhook(payload, '9999999999', signature, signingKey)).toBe(false);
    });

    it('should return false for the wrong signing key', () => {
      const payload = Buffer.from('{"object_type":"email","metric":"opened"}');
      const signature = generateCustomerIoSignature(payload, timestamp, signingKey);

      expect(verifyCustomerIoWebhook(payload, timestamp, signature, 'wrong_key')).toBe(false);
    });
  });

  describe('POST /webhooks/customerio', () => {
    function post(payload, { signature, timestamp: ts } = {}) {
      const req = request(app)
        .post('/webhooks/customerio')
        .set('Content-Type', 'application/json');
      if (ts !== undefined) req.set('X-CIO-Timestamp', ts);
      if (signature !== undefined) req.set('X-CIO-Signature', signature);
      return req.send(payload);
    }

    it('should return 401 for a missing signature', async () => {
      const payload = JSON.stringify({ object_type: 'email', metric: 'delivered' });
      const response = await post(payload, { timestamp });

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for an invalid signature', async () => {
      const payload = JSON.stringify({ object_type: 'email', metric: 'delivered' });
      const response = await post(payload, { signature: 'deadbeef', timestamp });

      expect(response.status).toBe(401);
    });

    it('should return 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        event_id: '01E4C4CT6YDC7Y5M7FE1GWWPQJ',
        object_type: 'email',
        metric: 'delivered',
        timestamp: 1613063089,
        data: { recipient: 'test@example.com' }
      });
      const signature = generateCustomerIoSignature(payload, timestamp, signingKey);
      const response = await post(payload, { signature, timestamp });

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle an email opened event', async () => {
      const payload = JSON.stringify({
        event_id: 'evt_1',
        object_type: 'email',
        metric: 'opened',
        data: { recipient: 'test@example.com' }
      });
      const signature = generateCustomerIoSignature(payload, timestamp, signingKey);
      const response = await post(payload, { signature, timestamp });

      expect(response.status).toBe(200);
    });

    it('should handle an email clicked event', async () => {
      const payload = JSON.stringify({
        event_id: 'evt_2',
        object_type: 'email',
        metric: 'clicked',
        data: { recipient: 'test@example.com', href: 'https://example.com', link_id: 'lnk_1' }
      });
      const signature = generateCustomerIoSignature(payload, timestamp, signingKey);
      const response = await post(payload, { signature, timestamp });

      expect(response.status).toBe(200);
    });

    it('should handle a customer unsubscribed event', async () => {
      const payload = JSON.stringify({
        event_id: 'evt_3',
        object_type: 'customer',
        metric: 'unsubscribed',
        data: { customer_id: '42' }
      });
      const signature = generateCustomerIoSignature(payload, timestamp, signingKey);
      const response = await post(payload, { signature, timestamp });

      expect(response.status).toBe(200);
    });

    it('should reject a tampered payload', async () => {
      const original = JSON.stringify({ object_type: 'email', metric: 'delivered' });
      const signature = generateCustomerIoSignature(original, timestamp, signingKey);
      const tampered = JSON.stringify({ object_type: 'email', metric: 'bounced' });
      const response = await post(tampered, { signature, timestamp });

      expect(response.status).toBe(401);
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
