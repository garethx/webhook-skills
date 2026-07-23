const request = require('supertest');
const crypto = require('crypto');

// Zendesk's static secret for test webhooks (before the webhook is created).
// Documented as always this value: base64 of "this_secret_is_for_testing_only".
process.env.ZENDESK_WEBHOOK_SECRET = 'dGhpc19zZWNyZXRfaXNfZm9yX3Rlc3Rpbmdfb25seQ==';

const { app, verifyZendeskWebhook } = require('../src/index');

/**
 * Generate a valid Zendesk signature for testing.
 * Signs base64(HMAC_SHA256(secret, timestamp + body)) — timestamp prepended, no separator.
 */
function generateZendeskSignature(payload, timestamp, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(timestamp);
  hmac.update(Buffer.from(payload));
  return hmac.digest('base64');
}

describe('Zendesk Webhook Endpoint', () => {
  const secret = process.env.ZENDESK_WEBHOOK_SECRET;
  const timestamp = '2026-07-22T10:00:00Z';

  describe('verifyZendeskWebhook', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"type":"zen:event-type:ticket.created"}');
      const signature = generateZendeskSignature(payload, timestamp, secret);

      expect(verifyZendeskWebhook(payload, signature, timestamp, secret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"type":"zen:event-type:ticket.created"}');

      expect(verifyZendeskWebhook(payload, 'invalid_signature', timestamp, secret)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const payload = Buffer.from('{"amount":100}');
      const signature = generateZendeskSignature(payload, timestamp, secret);
      const tampered = Buffer.from('{"amount":999}');

      expect(verifyZendeskWebhook(tampered, signature, timestamp, secret)).toBe(false);
    });

    it('should return false when the timestamp differs', () => {
      const payload = Buffer.from('{"type":"zen:event-type:ticket.created"}');
      const signature = generateZendeskSignature(payload, timestamp, secret);

      expect(verifyZendeskWebhook(payload, signature, '2020-01-01T00:00:00Z', secret)).toBe(false);
    });

    it('should validate an empty body (GET/DELETE requests)', () => {
      const payload = Buffer.alloc(0);
      const signature = generateZendeskSignature(payload, timestamp, secret);

      expect(verifyZendeskWebhook(payload, signature, timestamp, secret)).toBe(true);
    });
  });

  describe('POST /webhooks/zendesk', () => {
    it('should return 400 when the signature header is missing', async () => {
      const response = await request(app)
        .post('/webhooks/zendesk')
        .set('Content-Type', 'application/json')
        .set('X-Zendesk-Webhook-Signature-Timestamp', timestamp)
        .send('{"type":"zen:event-type:ticket.created"}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Missing signature headers');
    });

    it('should return 400 when the timestamp header is missing', async () => {
      const payload = '{"type":"zen:event-type:ticket.created"}';
      const signature = generateZendeskSignature(payload, timestamp, secret);

      const response = await request(app)
        .post('/webhooks/zendesk')
        .set('Content-Type', 'application/json')
        .set('X-Zendesk-Webhook-Signature', signature)
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Missing signature headers');
    });

    it('should return 400 for an invalid signature', async () => {
      const payload = '{"type":"zen:event-type:ticket.created"}';

      const response = await request(app)
        .post('/webhooks/zendesk')
        .set('Content-Type', 'application/json')
        .set('X-Zendesk-Webhook-Signature', 'invalid_signature')
        .set('X-Zendesk-Webhook-Signature-Timestamp', timestamp)
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        type: 'zen:event-type:ticket.created',
        detail: { id: '35436' },
      });
      const signature = generateZendeskSignature(payload, timestamp, secret);

      const response = await request(app)
        .post('/webhooks/zendesk')
        .set('Content-Type', 'application/json')
        .set('X-Zendesk-Webhook-Signature', signature)
        .set('X-Zendesk-Webhook-Signature-Timestamp', timestamp)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle the supported event types', async () => {
      const eventTypes = [
        'zen:event-type:ticket.created',
        'zen:event-type:ticket.status_changed',
        'zen:event-type:ticket.comment_added',
        'zen:event-type:ticket.priority_changed',
        'zen:event-type:ticket.agent_assignment_changed',
        'zen:event-type:user.created',
        'zen:event-type:organization.created',
      ];

      for (const type of eventTypes) {
        const payload = JSON.stringify({ type, detail: { id: '123' } });
        const signature = generateZendeskSignature(payload, timestamp, secret);

        const response = await request(app)
          .post('/webhooks/zendesk')
          .set('Content-Type', 'application/json')
          .set('X-Zendesk-Webhook-Signature', signature)
          .set('X-Zendesk-Webhook-Signature-Timestamp', timestamp)
          .send(payload);

        expect(response.status).toBe(200);
      }
    });

    it('should accept a custom trigger/automation payload (no type field)', async () => {
      const payload = JSON.stringify({ ticket_id: '35436', custom: true });
      const signature = generateZendeskSignature(payload, timestamp, secret);

      const response = await request(app)
        .post('/webhooks/zendesk')
        .set('Content-Type', 'application/json')
        .set('X-Zendesk-Webhook-Signature', signature)
        .set('X-Zendesk-Webhook-Signature-Timestamp', timestamp)
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
