const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app.
process.env.AIPRISE_API_KEY = 'abcdef12-pqrs-abcd-pqrs-abcde0123456';

const { app, verifyAiPriseWebhook } = require('../src/index');

/**
 * Generate a valid AiPrise signature for testing — lowercase hex HMAC-SHA256
 * over the raw body, keyed with the API private key.
 */
function generateAiPriseSignature(payload, apiKey) {
  return crypto
    .createHmac('sha256', apiKey)
    .update(payload)
    .digest('hex')
    .toLowerCase();
}

function approvedPayload(overrides = {}) {
  return JSON.stringify({
    verification_session_id: '123408f2-2bbb-415f-aafc-92212341234',
    template_id: '123456-3434-2342-3453-b4218a4fb333',
    client_reference_id: null,
    aiprise_summary: {
      tags: [],
      reasons: [],
      notes: [],
      verification_result: 'APPROVED',
    },
    created_at: 1668974142818,
    ...overrides,
  });
}

describe('AiPrise Webhook Endpoint', () => {
  const apiKey = process.env.AIPRISE_API_KEY;

  describe('verifyAiPriseWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from(approvedPayload());
      const signature = generateAiPriseSignature(payload, apiKey);

      expect(verifyAiPriseWebhook(payload, signature, apiKey)).toBe(true);
    });

    it('should accept an uppercase signature header', () => {
      const payload = Buffer.from(approvedPayload());
      const signature = generateAiPriseSignature(payload, apiKey).toUpperCase();

      expect(verifyAiPriseWebhook(payload, signature, apiKey)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from(approvedPayload());

      expect(verifyAiPriseWebhook(payload, 'deadbeef', apiKey)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from(approvedPayload());

      expect(verifyAiPriseWebhook(payload, null, apiKey)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const payload = Buffer.from(approvedPayload());
      const signature = generateAiPriseSignature(payload, apiKey);
      const tampered = Buffer.from(
        approvedPayload({ verification_session_id: 'other' })
      );

      expect(verifyAiPriseWebhook(tampered, signature, apiKey)).toBe(false);
    });

    it('should return false for the wrong key', () => {
      const payload = Buffer.from(approvedPayload());
      const signature = generateAiPriseSignature(payload, apiKey);

      expect(verifyAiPriseWebhook(payload, signature, 'wrong-key')).toBe(false);
    });
  });

  describe('POST /webhooks/aiprise', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/aiprise')
        .set('Content-Type', 'application/json')
        .send(approvedPayload());

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/aiprise')
        .set('Content-Type', 'application/json')
        .set('X-HMAC-SIGNATURE', 'deadbeef')
        .send(approvedPayload());

      expect(response.status).toBe(401);
    });

    it('should return 200 for a valid APPROVED callback', async () => {
      const payload = approvedPayload();
      const signature = generateAiPriseSignature(payload, apiKey);

      const response = await request(app)
        .post('/webhooks/aiprise')
        .set('Content-Type', 'application/json')
        .set('X-HMAC-SIGNATURE', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it.each(['APPROVED', 'DECLINED', 'REVIEW', 'UNKNOWN'])(
      'should handle a %s verification_result',
      async (result) => {
        const payload = approvedPayload({
          aiprise_summary: { verification_result: result },
        });
        const signature = generateAiPriseSignature(payload, apiKey);

        const response = await request(app)
          .post('/webhooks/aiprise')
          .set('Content-Type', 'application/json')
          .set('X-HMAC-SIGNATURE', signature)
          .send(payload);

        expect(response.status).toBe(200);
      }
    );
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
