const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.TYPEFORM_WEBHOOK_SECRET = 'test_typeform_secret';

const { app, verifyTypeformSignature } = require('../src/index');

/**
 * Generate a valid Typeform signature for testing.
 * Format: "sha256=" + base64(HMAC-SHA256(rawBody, secret))
 */
function generateTypeformSignature(payload, secret) {
  const hash = crypto.createHmac('sha256', secret).update(payload).digest('base64');
  return `sha256=${hash}`;
}

const samplePayload = JSON.stringify({
  event_id: '01F5N...',
  event_type: 'form_response',
  form_response: {
    form_id: 'lT4Z3j',
    token: 'a3a12ec67a1365927098a606107fac15',
    submitted_at: '2026-07-22T14:05:00Z',
    answers: [
      { type: 'email', email: 'jane@example.com', field: { id: 'abc', type: 'email' } }
    ]
  }
});

describe('Typeform Webhook Endpoint', () => {
  const secret = process.env.TYPEFORM_WEBHOOK_SECRET;

  describe('verifyTypeformSignature', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"event_type":"form_response"}');
      const signature = generateTypeformSignature(payload, secret);

      expect(verifyTypeformSignature(payload, signature, secret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"event_type":"form_response"}');

      expect(verifyTypeformSignature(payload, 'sha256=invalid', secret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"event_type":"form_response"}');

      expect(verifyTypeformSignature(payload, undefined, secret)).toBe(false);
    });

    it('should return false when the sha256= prefix is missing', () => {
      const payload = Buffer.from('{"event_type":"form_response"}');
      const bare = crypto.createHmac('sha256', secret).update(payload).digest('base64');

      expect(verifyTypeformSignature(payload, bare, secret)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = Buffer.from(samplePayload);
      const signature = generateTypeformSignature(original, secret);
      const tampered = Buffer.from(samplePayload.replace('jane@example.com', 'evil@example.com'));

      expect(verifyTypeformSignature(tampered, signature, secret)).toBe(false);
    });
  });

  describe('POST /webhooks/typeform', () => {
    it('should return 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/typeform')
        .set('Content-Type', 'application/json')
        .send(samplePayload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for an invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/typeform')
        .set('Content-Type', 'application/json')
        .set('Typeform-Signature', 'sha256=invalid')
        .send(samplePayload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid signature', async () => {
      const signature = generateTypeformSignature(Buffer.from(samplePayload), secret);

      const response = await request(app)
        .post('/webhooks/typeform')
        .set('Content-Type', 'application/json')
        .set('Typeform-Signature', signature)
        .send(samplePayload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle both Typeform event types', async () => {
      const eventTypes = ['form_response', 'form_response_partial'];

      for (const eventType of eventTypes) {
        const payload = JSON.stringify({
          event_id: 'evt_1',
          event_type: eventType,
          form_response: { form_id: 'lT4Z3j', token: 'tok', answers: [] }
        });
        const signature = generateTypeformSignature(Buffer.from(payload), secret);

        const response = await request(app)
          .post('/webhooks/typeform')
          .set('Content-Type', 'application/json')
          .set('Typeform-Signature', signature)
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
