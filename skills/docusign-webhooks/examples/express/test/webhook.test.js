const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.DOCUSIGN_HMAC_SECRET = 'test_docusign_hmac_secret';

const { app, verifyDocuSignWebhook } = require('../src/index');

/**
 * Generate a valid DocuSign HMAC signature for testing.
 * HMAC-SHA256 over the raw body, base64-encoded.
 */
function generateDocuSignSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

describe('DocuSign Webhook Endpoint', () => {
  const secret = process.env.DOCUSIGN_HMAC_SECRET;

  describe('verifyDocuSignWebhook', () => {
    it('should return true for a valid signature in X-DocuSign-Signature-1', () => {
      const payload = Buffer.from('{"event":"envelope-completed"}');
      const signature = generateDocuSignSignature(payload, secret);

      expect(
        verifyDocuSignWebhook(payload, { 'x-docusign-signature-1': signature }, secret)
      ).toBe(true);
    });

    it('should return true when any numbered header matches (key rotation)', () => {
      const payload = Buffer.from('{"event":"envelope-sent"}');
      const signature = generateDocuSignSignature(payload, secret);

      expect(
        verifyDocuSignWebhook(
          payload,
          {
            'x-docusign-signature-1': 'wrong_key_signature',
            'x-docusign-signature-2': signature,
          },
          secret
        )
      ).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"event":"envelope-completed"}');

      expect(
        verifyDocuSignWebhook(payload, { 'x-docusign-signature-1': 'invalid' }, secret)
      ).toBe(false);
    });

    it('should return false when no signature header is present', () => {
      const payload = Buffer.from('{"event":"envelope-completed"}');

      expect(verifyDocuSignWebhook(payload, {}, secret)).toBe(false);
    });

    it('should return false for a tampered body', () => {
      const original = Buffer.from('{"event":"envelope-completed","amount":100}');
      const signature = generateDocuSignSignature(original, secret);
      const tampered = Buffer.from('{"event":"envelope-completed","amount":999}');

      expect(
        verifyDocuSignWebhook(tampered, { 'x-docusign-signature-1': signature }, secret)
      ).toBe(false);
    });
  });

  describe('POST /webhooks/docusign', () => {
    it('should return 400 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/docusign')
        .set('Content-Type', 'application/json')
        .send('{"event":"envelope-completed"}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({ event: 'envelope-completed' });

      const response = await request(app)
        .post('/webhooks/docusign')
        .set('Content-Type', 'application/json')
        .set('X-DocuSign-Signature-1', 'invalid_signature')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({
        event: 'envelope-completed',
        data: { envelopeId: 'abc-123' },
      });
      const signature = generateDocuSignSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/docusign')
        .set('Content-Type', 'application/json')
        .set('X-DocuSign-Signature-1', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle different DocuSign events', async () => {
      const events = [
        'envelope-sent',
        'envelope-delivered',
        'envelope-completed',
        'envelope-declined',
        'envelope-voided',
        'recipient-sent',
        'recipient-delivered',
        'recipient-completed',
        'recipient-declined',
        'recipient-authenticationfailed',
      ];

      for (const event of events) {
        const payload = JSON.stringify({ event, data: { envelopeId: 'abc-123' } });
        const signature = generateDocuSignSignature(payload, secret);

        const response = await request(app)
          .post('/webhooks/docusign')
          .set('Content-Type', 'application/json')
          .set('X-DocuSign-Signature-1', signature)
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
