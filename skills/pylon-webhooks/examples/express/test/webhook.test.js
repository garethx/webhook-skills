const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.PYLON_WEBHOOK_SECRET = 'test_pylon_secret';

const { app, verifyPylonWebhook } = require('../src/index');

/**
 * Generate a valid Pylon signature for testing.
 * Signs `timestamp + "." + payload` with HMAC-SHA256, hex, "hs256=" prefix.
 */
function generatePylonSignature(payload, timestamp, secret) {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(payload)
    .digest('hex');
  return `hs256=${digest}`;
}

describe('Pylon Webhook Endpoint', () => {
  const webhookSecret = process.env.PYLON_WEBHOOK_SECRET;
  const timestamp = '1624235417';

  describe('verifyPylonWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"event_type":"issue.created"}');
      const signature = generatePylonSignature(payload, timestamp, webhookSecret);

      expect(verifyPylonWebhook(payload, timestamp, signature, webhookSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"event_type":"issue.created"}');

      expect(verifyPylonWebhook(payload, timestamp, 'hs256=deadbeef', webhookSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"event_type":"issue.created"}');

      expect(verifyPylonWebhook(payload, timestamp, null, webhookSecret)).toBe(false);
    });

    it('should return false for missing timestamp', () => {
      const payload = Buffer.from('{"event_type":"issue.created"}');
      const signature = generatePylonSignature(payload, timestamp, webhookSecret);

      expect(verifyPylonWebhook(payload, null, signature, webhookSecret)).toBe(false);
    });

    it('should return false when timestamp is tampered', () => {
      const payload = Buffer.from('{"event_type":"issue.created"}');
      const signature = generatePylonSignature(payload, timestamp, webhookSecret);

      expect(verifyPylonWebhook(payload, '9999999999', signature, webhookSecret)).toBe(false);
    });

    it('should return false for wrong secret', () => {
      const payload = Buffer.from('{"event_type":"issue.created"}');
      const signature = generatePylonSignature(payload, timestamp, webhookSecret);

      expect(verifyPylonWebhook(payload, timestamp, signature, 'wrong_secret')).toBe(false);
    });
  });

  describe('POST /webhooks/pylon', () => {
    it('should return 400 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/pylon')
        .set('Content-Type', 'application/json')
        .set('Pylon-Webhook-Timestamp', timestamp)
        .send('{"event_type":"issue.created"}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({ event_type: 'issue.created' });

      const response = await request(app)
        .post('/webhooks/pylon')
        .set('Content-Type', 'application/json')
        .set('Pylon-Webhook-Signature', 'hs256=deadbeef')
        .set('Pylon-Webhook-Timestamp', timestamp)
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 400 when the payload is tampered', async () => {
      const original = JSON.stringify({ event_type: 'issue.created', data: { id: '1' } });
      const signature = generatePylonSignature(original, timestamp, webhookSecret);
      const tampered = JSON.stringify({ event_type: 'issue.created', data: { id: '999' } });

      const response = await request(app)
        .post('/webhooks/pylon')
        .set('Content-Type', 'application/json')
        .set('Pylon-Webhook-Signature', signature)
        .set('Pylon-Webhook-Timestamp', timestamp)
        .send(tampered);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid issue.created event', async () => {
      const payload = JSON.stringify({
        event_type: 'issue.created',
        data: { id: 'issue_1', title: 'Login is broken' }
      });
      const signature = generatePylonSignature(payload, timestamp, webhookSecret);

      const response = await request(app)
        .post('/webhooks/pylon')
        .set('Content-Type', 'application/json')
        .set('Pylon-Webhook-Signature', signature)
        .set('Pylon-Webhook-Timestamp', timestamp)
        .set('Pylon-Webhook-Version', '2021-07')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should return 200 for a valid issue.updated event', async () => {
      const payload = JSON.stringify({
        event_type: 'issue.updated',
        data: { id: 'issue_1', state: 'closed' }
      });
      const signature = generatePylonSignature(payload, timestamp, webhookSecret);

      const response = await request(app)
        .post('/webhooks/pylon')
        .set('Content-Type', 'application/json')
        .set('Pylon-Webhook-Signature', signature)
        .set('Pylon-Webhook-Timestamp', timestamp)
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
