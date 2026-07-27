const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.UPOLLO_WEBHOOK_SECRET = 'test_upollo_webhook_secret';

const { app, verifyUpolloWebhook, normalizeEnum } = require('../src/index');

/**
 * Build an Upollo-Signature header for testing.
 * Upollo: HMAC-SHA512 of the raw body, keyed with the webhook secret, sent as
 * the `s0` part alongside a `t` timestamp. Docs don't specify hex vs base64, so
 * the handler accepts either.
 */
function buildUpolloSignature(payload, secret, { encoding = 'hex', t = 1706352000 } = {}) {
  const s0 = crypto.createHmac('sha512', secret).update(payload).digest(encoding);
  return `t:${t},s0:${s0}`;
}

describe('Upollo Webhook Endpoint', () => {
  const webhookSecret = process.env.UPOLLO_WEBHOOK_SECRET;

  const flaggedPayload = JSON.stringify({
    action: 'CHALLENGE',
    eventType: 'LOGIN',
    flags: [
      {
        type: 'ACCOUNT_SHARING',
        firstFlagged: '2026-07-01T12:00:00Z',
        mostRecentlyFlagged: '2026-07-27T09:00:00Z',
      },
    ],
    userInfo: { userId: 'user_123', userEmail: 'user@example.com' },
    deviceInfo: { deviceId: 'dev_abc', deviceClass: 'DEVICE_CLASS_DESKTOP' },
  });

  describe('verifyUpolloWebhook', () => {
    it('should return true for a valid hex signature', () => {
      const payload = Buffer.from(flaggedPayload);
      const signature = buildUpolloSignature(payload, webhookSecret, { encoding: 'hex' });

      expect(verifyUpolloWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return true for a valid base64 signature', () => {
      const payload = Buffer.from(flaggedPayload);
      const signature = buildUpolloSignature(payload, webhookSecret, { encoding: 'base64' });

      expect(verifyUpolloWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from(flaggedPayload);

      expect(verifyUpolloWebhook(payload, 't:1706352000,s0:deadbeef', webhookSecret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from(flaggedPayload);

      expect(verifyUpolloWebhook(payload, null, webhookSecret)).toBe(false);
    });

    it('should return false when the s0 part is absent', () => {
      const payload = Buffer.from(flaggedPayload);

      expect(verifyUpolloWebhook(payload, 't:1706352000', webhookSecret)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const signature = buildUpolloSignature(
        Buffer.from('{"userInfo":{"userId":"user_123"}}'),
        webhookSecret
      );

      expect(
        verifyUpolloWebhook(Buffer.from('{"userInfo":{"userId":"attacker"}}'), signature, webhookSecret)
      ).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from(flaggedPayload);
      const signature = buildUpolloSignature(payload, webhookSecret);

      expect(verifyUpolloWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });

    it('should reject a SHA-256 digest (wrong algorithm)', () => {
      const payload = Buffer.from(flaggedPayload);
      const sha256 = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

      expect(verifyUpolloWebhook(payload, `t:1706352000,s0:${sha256}`, webhookSecret)).toBe(false);
    });
  });

  describe('normalizeEnum', () => {
    it('should strip Upollo enum prefixes', () => {
      expect(normalizeEnum('OUTCOME_CHALLENGE')).toBe('CHALLENGE');
      expect(normalizeEnum('EVENT_TYPE_LOGIN')).toBe('LOGIN');
      expect(normalizeEnum('FLAG_TYPE_UNSPECIFIED')).toBe('UNSPECIFIED');
    });

    it('should leave short-form values unchanged', () => {
      expect(normalizeEnum('CHALLENGE')).toBe('CHALLENGE');
      expect(normalizeEnum('ACCOUNT_SHARING')).toBe('ACCOUNT_SHARING');
    });
  });

  describe('POST /webhooks/upollo', () => {
    it('should return 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/upollo')
        .set('Content-Type', 'application/json')
        .send(flaggedPayload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for an invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/upollo')
        .set('Content-Type', 'application/json')
        .set('Upollo-Signature', 't:1706352000,s0:deadbeef')
        .send(flaggedPayload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid ACCOUNT_SHARING + CHALLENGE delivery', async () => {
      const signature = buildUpolloSignature(flaggedPayload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/upollo')
        .set('Content-Type', 'application/json')
        .set('Upollo-Signature', signature)
        .send(flaggedPayload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should return 200 for a base64-signed delivery', async () => {
      const signature = buildUpolloSignature(flaggedPayload, webhookSecret, { encoding: 'base64' });

      const response = await request(app)
        .post('/webhooks/upollo')
        .set('Content-Type', 'application/json')
        .set('Upollo-Signature', signature)
        .send(flaggedPayload);

      expect(response.status).toBe(200);
    });

    it('should handle a MULTIPLE_ACCOUNTS + DENY delivery with prefixed enums', async () => {
      const payload = JSON.stringify({
        action: 'OUTCOME_DENY',
        eventType: 'EVENT_TYPE_REGISTER',
        flags: [{ type: 'MULTIPLE_ACCOUNTS' }],
        userInfo: { userId: 'user_777' },
      });
      const signature = buildUpolloSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/upollo')
        .set('Content-Type', 'application/json')
        .set('Upollo-Signature', signature)
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
