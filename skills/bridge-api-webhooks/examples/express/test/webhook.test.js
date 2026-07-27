const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.BRIDGE_WEBHOOK_SECRET = 'test_bridge_secret';

const { app, verifyBridgeWebhook } = require('../src/index');

/**
 * Generate a valid Bridge API signature header for testing.
 * Bridge sends UPPERCASE hex, prefixed with the `v1=` scheme.
 */
function generateBridgeSignature(payload, secret) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
    .toUpperCase();
  return `v1=${signature}`;
}

describe('Bridge API Webhook Endpoint', () => {
  const webhookSecret = process.env.BRIDGE_WEBHOOK_SECRET;

  describe('verifyBridgeWebhook', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"type":"item.refreshed"}');
      const signature = generateBridgeSignature(payload, webhookSecret);

      expect(verifyBridgeWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should accept multiple v1 signatures (secret rotation)', () => {
      const payload = Buffer.from('{"type":"item.refreshed"}');
      const validSig = generateBridgeSignature(payload, webhookSecret);
      const staleSig = 'v1=DEADBEEF';
      // Old (stale) signature first, valid one second — any match accepts
      const header = `${staleSig},${validSig}`;

      expect(verifyBridgeWebhook(payload, header, webhookSecret)).toBe(true);
    });

    it('should ignore non-v1 schemes (no downgrade)', () => {
      const payload = Buffer.from('{"type":"item.refreshed"}');
      const hex = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
      // Same digest but presented under a v0 scheme → must be rejected
      const header = `v0=${hex.toUpperCase()}`;

      expect(verifyBridgeWebhook(payload, header, webhookSecret)).toBe(false);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"type":"item.refreshed"}');

      expect(verifyBridgeWebhook(payload, 'v1=INVALID', webhookSecret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"type":"item.refreshed"}');

      expect(verifyBridgeWebhook(payload, null, webhookSecret)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = Buffer.from('{"type":"item.refreshed","content":{"item_id":1}}');
      const signature = generateBridgeSignature(original, webhookSecret);
      const tampered = Buffer.from('{"type":"item.refreshed","content":{"item_id":999}}');

      expect(verifyBridgeWebhook(tampered, signature, webhookSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/bridge-api', () => {
    it('should return 401 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/bridge-api')
        .set('Content-Type', 'application/json')
        .send('{"type":"item.refreshed"}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for an invalid signature', async () => {
      const payload = JSON.stringify({ type: 'item.refreshed' });

      const response = await request(app)
        .post('/webhooks/bridge-api')
        .set('Content-Type', 'application/json')
        .set('BridgeApi-Signature', 'v1=INVALID')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        type: 'item.refreshed',
        timestamp: 1699999999,
        content: { item_id: 12345, status: 0 },
      });
      const signature = generateBridgeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/bridge-api')
        .set('Content-Type', 'application/json')
        .set('BridgeApi-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle the TEST_EVENT event', async () => {
      const payload = JSON.stringify({
        type: 'TEST_EVENT',
        timestamp: 1699999999,
        content: { item_id: 0, status: 0, user_uuid: 'test-uuid' },
      });
      const signature = generateBridgeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/bridge-api')
        .set('Content-Type', 'application/json')
        .set('BridgeApi-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle the payment.transaction.updated event', async () => {
      const payload = JSON.stringify({
        type: 'payment.transaction.updated',
        timestamp: 1699999999,
        content: { transaction_id: 'txn_1' },
      });
      const signature = generateBridgeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/bridge-api')
        .set('Content-Type', 'application/json')
        .set('BridgeApi-Signature', signature)
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
