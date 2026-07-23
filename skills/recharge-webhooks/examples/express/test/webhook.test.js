const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.RECHARGE_API_CLIENT_SECRET = 'test_client_secret';

const {
  app,
  verifyRechargeWebhookTimestamped,
  verifyRechargeWebhookLegacy,
} = require('../src/index');

/**
 * Generate a valid timestamp-bound signature header for testing.
 * HMAC-SHA-256 over "<timestamp>.<payload>", keyed by the client secret,
 * delivered as `t=<epoch>,v1=<hex>`.
 */
function generateTimestampedSignature(payload, secret, timestamp) {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(payload)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

/**
 * Generate a valid legacy Recharge signature for testing.
 * The legacy scheme is a plain SHA-256 of (clientSecret + rawBody), hex-encoded - NOT HMAC.
 */
function generateLegacySignature(payload, secret) {
  return crypto
    .createHash('sha256')
    .update(secret)
    .update(payload)
    .digest('hex');
}

describe('Recharge Webhook Endpoint', () => {
  const clientSecret = process.env.RECHARGE_API_CLIENT_SECRET;
  const now = () => Math.floor(Date.now() / 1000);

  describe('verifyRechargeWebhookTimestamped', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');
      const header = generateTimestampedSignature(payload, clientSecret, now());

      expect(verifyRechargeWebhookTimestamped(payload, header, clientSecret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');
      const header = `t=${now()},v1=${'0'.repeat(64)}`;

      expect(verifyRechargeWebhookTimestamped(payload, header, clientSecret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');

      expect(verifyRechargeWebhookTimestamped(payload, undefined, clientSecret)).toBe(false);
    });

    it('should return false for a malformed header', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');

      expect(verifyRechargeWebhookTimestamped(payload, 'not-a-signature', clientSecret)).toBe(false);
    });

    it('should return false for an expired timestamp (older than 48 hours)', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');
      const expired = now() - 172801; // just past the 48-hour window
      const header = generateTimestampedSignature(payload, clientSecret, expired);

      expect(verifyRechargeWebhookTimestamped(payload, header, clientSecret)).toBe(false);
    });

    it('should return true just inside the 48-hour window', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');
      const recent = now() - 172000; // inside the window
      const header = generateTimestampedSignature(payload, clientSecret, recent);

      expect(verifyRechargeWebhookTimestamped(payload, header, clientSecret)).toBe(true);
    });

    it('should return false for a tampered body', () => {
      const original = Buffer.from('{"charge":{"id":123,"total_price":"10.00"}}');
      const header = generateTimestampedSignature(original, clientSecret, now());
      const tampered = Buffer.from('{"charge":{"id":123,"total_price":"999.00"}}');

      expect(verifyRechargeWebhookTimestamped(tampered, header, clientSecret)).toBe(false);
    });

    it('should return false for a tampered timestamp', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');
      const header = generateTimestampedSignature(payload, clientSecret, now());
      const tampered = header.replace(/^t=\d+/, `t=${now() - 60}`);

      expect(verifyRechargeWebhookTimestamped(payload, tampered, clientSecret)).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');
      const header = generateTimestampedSignature(payload, clientSecret, now());

      expect(verifyRechargeWebhookTimestamped(payload, header, 'wrong_secret')).toBe(false);
    });
  });

  describe('verifyRechargeWebhookLegacy', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');
      const signature = generateLegacySignature(payload, clientSecret);

      expect(verifyRechargeWebhookLegacy(payload, signature, clientSecret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');

      expect(verifyRechargeWebhookLegacy(payload, 'invalid_signature', clientSecret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');

      expect(verifyRechargeWebhookLegacy(payload, undefined, clientSecret)).toBe(false);
    });

    it('should return false for a tampered body', () => {
      const original = Buffer.from('{"charge":{"id":123,"total_price":"10.00"}}');
      const signature = generateLegacySignature(original, clientSecret);
      const tampered = Buffer.from('{"charge":{"id":123,"total_price":"999.00"}}');

      expect(verifyRechargeWebhookLegacy(tampered, signature, clientSecret)).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');
      const signature = generateLegacySignature(payload, clientSecret);

      expect(verifyRechargeWebhookLegacy(payload, signature, 'wrong_secret')).toBe(false);
    });

    it('should NOT match an HMAC signature (legacy Recharge is a plain hash)', () => {
      const payload = Buffer.from('{"charge":{"id":123}}');
      const hmacSig = crypto
        .createHmac('sha256', clientSecret)
        .update(payload)
        .digest('hex');

      expect(verifyRechargeWebhookLegacy(payload, hmacSig, clientSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/recharge', () => {
    it('should return 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/recharge')
        .set('Content-Type', 'application/json')
        .send('{"charge":{"id":123}}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 200 for a valid timestamp-bound signature', async () => {
      const payload = JSON.stringify({ charge: { id: 123, status: 'success' } });
      const header = generateTimestampedSignature(payload, clientSecret, now());

      const response = await request(app)
        .post('/webhooks/recharge')
        .set('Content-Type', 'application/json')
        .set('X-Recharge-Webhook-Signature', header)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should return 400 for an invalid timestamp-bound signature', async () => {
      const response = await request(app)
        .post('/webhooks/recharge')
        .set('Content-Type', 'application/json')
        .set('X-Recharge-Webhook-Signature', `t=${now()},v1=${'0'.repeat(64)}`)
        .send('{"charge":{"id":123}}');

      expect(response.status).toBe(400);
    });

    it('should return 400 for an expired timestamp', async () => {
      const payload = '{"charge":{"id":123}}';
      const header = generateTimestampedSignature(payload, clientSecret, now() - 172801);

      const response = await request(app)
        .post('/webhooks/recharge')
        .set('Content-Type', 'application/json')
        .set('X-Recharge-Webhook-Signature', header)
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should NOT fall back to legacy when the new header is present but invalid', async () => {
      const payload = '{"charge":{"id":123}}';
      const legacySignature = generateLegacySignature(payload, clientSecret);

      const response = await request(app)
        .post('/webhooks/recharge')
        .set('Content-Type', 'application/json')
        .set('X-Recharge-Webhook-Signature', `t=${now()},v1=${'0'.repeat(64)}`)
        .set('X-Recharge-Hmac-Sha256', legacySignature)
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid legacy signature when the new header is absent', async () => {
      const payload = JSON.stringify({ charge: { id: 123, status: 'success' } });
      const signature = generateLegacySignature(payload, clientSecret);

      const response = await request(app)
        .post('/webhooks/recharge')
        .set('Content-Type', 'application/json')
        .set('X-Recharge-Hmac-Sha256', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should return 400 for an invalid legacy signature', async () => {
      const response = await request(app)
        .post('/webhooks/recharge')
        .set('Content-Type', 'application/json')
        .set('X-Recharge-Hmac-Sha256', 'invalid_signature')
        .send('{"charge":{"id":123}}');

      expect(response.status).toBe(400);
    });

    it('should dispatch on the top-level payload resource key', async () => {
      const payloads = [
        { charge: { id: 456 } },
        { subscription: { id: 456 } },
        { order: { id: 456 } },
        { customer: { id: 456 } },
        { address: { id: 456 } },
      ];

      for (const body of payloads) {
        const payload = JSON.stringify(body);
        const header = generateTimestampedSignature(payload, clientSecret, now());

        const response = await request(app)
          .post('/webhooks/recharge')
          .set('Content-Type', 'application/json')
          .set('X-Recharge-Webhook-Signature', header)
          .send(payload);

        expect(response.status).toBe(200);
      }
    });

    it('should still return 200 for an unrecognized resource key', async () => {
      const payload = JSON.stringify({ something_new: { id: 789 } });
      const header = generateTimestampedSignature(payload, clientSecret, now());

      const response = await request(app)
        .post('/webhooks/recharge')
        .set('Content-Type', 'application/json')
        .set('X-Recharge-Webhook-Signature', header)
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
