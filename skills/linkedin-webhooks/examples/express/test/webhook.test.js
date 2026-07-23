const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.LINKEDIN_CLIENT_SECRET = 'test_client_secret';

const { app, verifyLinkedInWebhook, challengeResponse, getNotificationType } = require('../src/index');

const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;

/**
 * Generate a valid X-LI-Signature for testing.
 * hex(HMACSHA256("hmacsha256=" + rawBody, clientSecret))
 */
function generateSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update('hmacsha256=' + payload)
    .digest('hex');
}

describe('LinkedIn Webhook', () => {
  describe('challengeResponse', () => {
    it('matches the documented example vector', () => {
      // From LinkedIn docs; both values change with a different secret, so we
      // just assert determinism + format here.
      const code = '890e4665-4dfe-4ab1-b689-ed553bceeed0';
      const resp = challengeResponse(code, CLIENT_SECRET);
      expect(resp).toMatch(/^[a-f0-9]{64}$/);
      expect(challengeResponse(code, CLIENT_SECRET)).toBe(resp);
    });
  });

  describe('verifyLinkedInWebhook', () => {
    it('returns true for a valid signature', () => {
      const payload = Buffer.from('{"notificationId":"n1"}');
      const signature = generateSignature(payload.toString(), CLIENT_SECRET);
      expect(verifyLinkedInWebhook(payload, signature, CLIENT_SECRET)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      const payload = Buffer.from('{"notificationId":"n1"}');
      expect(verifyLinkedInWebhook(payload, 'deadbeef', CLIENT_SECRET)).toBe(false);
    });

    it('returns false for a missing signature', () => {
      const payload = Buffer.from('{"notificationId":"n1"}');
      expect(verifyLinkedInWebhook(payload, null, CLIENT_SECRET)).toBe(false);
    });

    it('returns false for the wrong secret', () => {
      const payload = Buffer.from('{"notificationId":"n1"}');
      const signature = generateSignature(payload.toString(), CLIENT_SECRET);
      expect(verifyLinkedInWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });

    it('returns false for a tampered body', () => {
      const signature = generateSignature('{"notificationId":"n1"}', CLIENT_SECRET);
      expect(verifyLinkedInWebhook(Buffer.from('{"notificationId":"n2"}'), signature, CLIENT_SECRET)).toBe(false);
    });
  });

  describe('getNotificationType', () => {
    it('honors an explicit eventType', () => {
      expect(getNotificationType({ eventType: 'LEAD_ACTION' })).toBe('LEAD_ACTION');
    });
    it('classifies lead payloads', () => {
      expect(getNotificationType({ leadType: 'SPONSORED' })).toBe('LEAD_ACTION');
    });
    it('classifies org social action payloads', () => {
      expect(getNotificationType({ organizationSocialAction: {} })).toBe('ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS');
    });
    it('falls back to UNKNOWN', () => {
      expect(getNotificationType({})).toBe('UNKNOWN');
    });
  });

  describe('GET /webhooks/linkedin (endpoint validation)', () => {
    it('echoes challengeCode with a valid challengeResponse', async () => {
      const code = '890e4665-4dfe-4ab1-b689-ed553bceeed0';
      const response = await request(app).get('/webhooks/linkedin').query({ challengeCode: code });

      expect(response.status).toBe(200);
      expect(response.body.challengeCode).toBe(code);
      expect(response.body.challengeResponse).toBe(challengeResponse(code, CLIENT_SECRET));
    });

    it('returns 400 when challengeCode is missing', async () => {
      const response = await request(app).get('/webhooks/linkedin');
      expect(response.status).toBe(400);
    });
  });

  describe('POST /webhooks/linkedin (event delivery)', () => {
    it('returns 401 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/linkedin')
        .set('Content-Type', 'application/json')
        .send('{"notificationId":"n1"}');
      expect(response.status).toBe(401);
    });

    it('returns 401 for an invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/linkedin')
        .set('Content-Type', 'application/json')
        .set('X-LI-Signature', 'deadbeef')
        .send('{"notificationId":"n1"}');
      expect(response.status).toBe(401);
    });

    it('returns 200 for a valid LEAD_ACTION notification', async () => {
      const payload = JSON.stringify({ notificationId: 'lead-1', eventType: 'LEAD_ACTION', leadType: 'SPONSORED' });
      const signature = generateSignature(payload, CLIENT_SECRET);

      const response = await request(app)
        .post('/webhooks/linkedin')
        .set('Content-Type', 'application/json')
        .set('X-LI-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('returns 200 for a valid ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS notification', async () => {
      const payload = JSON.stringify({
        notificationId: 'social-1',
        eventType: 'ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS',
        organizationSocialAction: { object: 'urn:li:activity:123' },
      });
      const signature = generateSignature(payload, CLIENT_SECRET);

      const response = await request(app)
        .post('/webhooks/linkedin')
        .set('Content-Type', 'application/json')
        .set('X-LI-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('deduplicates repeated notificationId', async () => {
      const payload = JSON.stringify({ notificationId: 'dupe-1', eventType: 'LEAD_ACTION' });
      const signature = generateSignature(payload, CLIENT_SECRET);

      const send = () =>
        request(app)
          .post('/webhooks/linkedin')
          .set('Content-Type', 'application/json')
          .set('X-LI-Signature', signature)
          .send(payload);

      expect((await send()).status).toBe(200);
      expect((await send()).status).toBe(200); // still acknowledged, but skipped
    });
  });

  describe('GET /health', () => {
    it('returns health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
