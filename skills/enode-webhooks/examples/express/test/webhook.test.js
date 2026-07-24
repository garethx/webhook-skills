const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.ENODE_WEBHOOK_SECRET = 'test_enode_secret';

const { app, verifyEnodeWebhook } = require('../src/index');

/**
 * Generate a valid Enode signature for testing (HMAC-SHA1, hex, sha1= prefix)
 */
function generateEnodeSignature(payload, secret) {
  const signature = crypto
    .createHmac('sha1', secret)
    .update(payload)
    .digest('hex');
  return `sha1=${signature}`;
}

describe('Enode Webhook Endpoint', () => {
  const webhookSecret = process.env.ENODE_WEBHOOK_SECRET;

  describe('verifyEnodeWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('[{"event":"user:vehicle:updated"}]');
      const signature = generateEnodeSignature(payload, webhookSecret);

      expect(verifyEnodeWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('[{"event":"user:vehicle:updated"}]');

      expect(verifyEnodeWebhook(payload, 'sha1=invalid', webhookSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('[{"event":"user:vehicle:updated"}]');

      expect(verifyEnodeWebhook(payload, null, webhookSecret)).toBe(false);
    });

    it('should return false for a sha256-prefixed signature', () => {
      const payload = Buffer.from('[{"event":"user:vehicle:updated"}]');
      const wrong = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

      expect(verifyEnodeWebhook(payload, wrong, webhookSecret)).toBe(false);
    });

    it('should return false for tampered payload', () => {
      const original = Buffer.from('[{"event":"user:vehicle:updated","vehicle":{"id":"1"}}]');
      const signature = generateEnodeSignature(original, webhookSecret);
      const tampered = Buffer.from('[{"event":"user:vehicle:updated","vehicle":{"id":"999"}}]');

      expect(verifyEnodeWebhook(tampered, signature, webhookSecret)).toBe(false);
    });

    it('should return false for wrong secret', () => {
      const payload = Buffer.from('[{"event":"user:vehicle:updated"}]');
      const signature = generateEnodeSignature(payload, webhookSecret);

      expect(verifyEnodeWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });
  });

  describe('POST /webhooks/enode', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/enode')
        .set('Content-Type', 'application/json')
        .set('X-Enode-Delivery', 'test-delivery-id')
        .send('[{"event":"user:vehicle:updated"}]');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify([{ event: 'user:vehicle:updated' }]);

      const response = await request(app)
        .post('/webhooks/enode')
        .set('Content-Type', 'application/json')
        .set('X-Enode-Signature', 'sha1=invalid')
        .set('X-Enode-Delivery', 'test-delivery-id')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify([
        {
          event: 'user:vehicle:updated',
          createdAt: '2020-04-07T17:04:26Z',
          user: { id: 'user-1' },
          vehicle: { id: 'vehicle-1' }
        }
      ]);
      const signature = generateEnodeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/enode')
        .set('Content-Type', 'application/json')
        .set('X-Enode-Signature', signature)
        .set('X-Enode-Delivery', 'test-delivery-id')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle the enode:webhook:test event', async () => {
      const payload = JSON.stringify([
        { event: 'enode:webhook:test', createdAt: '2020-04-07T17:04:26Z' }
      ]);
      const signature = generateEnodeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/enode')
        .set('Content-Type', 'application/json')
        .set('X-Enode-Signature', signature)
        .set('X-Enode-Delivery', 'test-delivery-id')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle multiple events in one delivery', async () => {
      const payload = JSON.stringify([
        { event: 'user:vehicle:updated', vehicle: { id: 'v1' } },
        { event: 'user:charger:updated', charger: { id: 'c1' } },
        { event: 'system:heartbeat', createdAt: '2020-04-07T17:04:26Z' }
      ]);
      const signature = generateEnodeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/enode')
        .set('Content-Type', 'application/json')
        .set('X-Enode-Signature', signature)
        .set('X-Enode-Delivery', 'test-delivery-id')
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
