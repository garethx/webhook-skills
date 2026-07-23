const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.ASHBY_WEBHOOK_SECRET = 'test_ashby_secret';

const { app, verifyAshbyWebhook } = require('../src/index');

/**
 * Generate a valid Ashby signature for testing (HMAC-SHA256 hex, "sha256=" prefix)
 */
function generateAshbySignature(payload, secret) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

describe('Ashby Webhook Endpoint', () => {
  const webhookSecret = process.env.ASHBY_WEBHOOK_SECRET;

  describe('verifyAshbyWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"action":"ping","data":{}}');
      const signature = generateAshbySignature(payload, webhookSecret);

      expect(verifyAshbyWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"action":"ping","data":{}}');

      expect(verifyAshbyWebhook(payload, 'sha256=invalid', webhookSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"action":"ping","data":{}}');

      expect(verifyAshbyWebhook(payload, null, webhookSecret)).toBe(false);
    });

    it('should return false for a malformed header', () => {
      const payload = Buffer.from('{"action":"ping","data":{}}');

      expect(verifyAshbyWebhook(payload, 'not_a_valid_format', webhookSecret)).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from('{"action":"ping","data":{}}');
      const signature = generateAshbySignature(payload, webhookSecret);

      expect(verifyAshbyWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = Buffer.from('{"action":"candidateHire","data":{"id":1}}');
      const signature = generateAshbySignature(original, webhookSecret);
      const tampered = Buffer.from('{"action":"candidateHire","data":{"id":999}}');

      expect(verifyAshbyWebhook(tampered, signature, webhookSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/ashby', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/ashby')
        .set('Content-Type', 'application/json')
        .send('{"action":"ping","data":{}}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({ action: 'ping', data: {} });

      const response = await request(app)
        .post('/webhooks/ashby')
        .set('Content-Type', 'application/json')
        .set('Ashby-Signature', 'sha256=invalid')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for a valid ping event', async () => {
      const payload = JSON.stringify({ action: 'ping', data: {} });
      const signature = generateAshbySignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/ashby')
        .set('Content-Type', 'application/json')
        .set('Ashby-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle applicationSubmit event', async () => {
      const payload = JSON.stringify({
        action: 'applicationSubmit',
        data: { application: { id: 'app_123' } }
      });
      const signature = generateAshbySignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/ashby')
        .set('Content-Type', 'application/json')
        .set('Ashby-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle candidateHire event', async () => {
      const payload = JSON.stringify({
        action: 'candidateHire',
        data: { candidate: { id: 'cand_123' } }
      });
      const signature = generateAshbySignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/ashby')
        .set('Content-Type', 'application/json')
        .set('Ashby-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle interviewScheduleCreate event', async () => {
      const payload = JSON.stringify({
        action: 'interviewScheduleCreate',
        data: { interviewSchedule: { id: 'sched_123' } }
      });
      const signature = generateAshbySignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/ashby')
        .set('Content-Type', 'application/json')
        .set('Ashby-Signature', signature)
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
