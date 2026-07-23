const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.ASANA_WEBHOOK_SECRET = 'test_asana_secret';

const { app, verifyAsanaSignature } = require('../src/index');

/**
 * Generate a valid Asana signature for testing:
 * hex HMAC-SHA256 of the raw body keyed with the secret.
 */
function generateAsanaSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('Asana Webhook Endpoint', () => {
  const secret = process.env.ASANA_WEBHOOK_SECRET;

  describe('verifyAsanaSignature', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"events":[]}');
      const signature = generateAsanaSignature(payload, secret);

      expect(verifyAsanaSignature(payload, signature, secret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"events":[]}');

      expect(verifyAsanaSignature(payload, 'deadbeef', secret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"events":[]}');

      expect(verifyAsanaSignature(payload, undefined, secret)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = Buffer.from('{"events":[{"action":"added"}]}');
      const signature = generateAsanaSignature(original, secret);
      const tampered = Buffer.from('{"events":[{"action":"deleted"}]}');

      expect(verifyAsanaSignature(tampered, signature, secret)).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from('{"events":[]}');
      const signature = generateAsanaSignature(payload, secret);

      expect(verifyAsanaSignature(payload, signature, 'wrong_secret')).toBe(false);
    });
  });

  describe('POST /webhooks/asana - handshake', () => {
    it('should echo X-Hook-Secret and return 200', async () => {
      const response = await request(app)
        .post('/webhooks/asana')
        .set('Content-Type', 'application/json')
        .set('X-Hook-Secret', 'handshake_secret_value')
        .send('');

      expect(response.status).toBe(200);
      expect(response.headers['x-hook-secret']).toBe('handshake_secret_value');
    });
  });

  describe('POST /webhooks/asana - delivery', () => {
    it('should return 401 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/asana')
        .set('Content-Type', 'application/json')
        .send('{"events":[]}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for an invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/asana')
        .set('Content-Type', 'application/json')
        .set('X-Hook-Signature', 'deadbeef')
        .send('{"events":[]}');

      expect(response.status).toBe(401);
    });

    it('should return 200 for a valid heartbeat (empty events)', async () => {
      const payload = '{"events":[]}';
      const signature = generateAsanaSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/asana')
        .set('Content-Type', 'application/json')
        .set('X-Hook-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should return 200 for a valid event batch', async () => {
      const payload = JSON.stringify({
        events: [
          {
            action: 'changed',
            resource: { gid: '12345', resource_type: 'task' },
            parent: { gid: '67890', resource_type: 'project' },
            user: { gid: '11111', resource_type: 'user' },
            created_at: '2026-07-22T10:00:00.000Z',
            change: { field: 'completed', action: 'changed' },
          },
        ],
      });
      const signature = generateAsanaSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/asana')
        .set('Content-Type', 'application/json')
        .set('X-Hook-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should reject a tampered body', async () => {
      const original = JSON.stringify({ events: [{ action: 'added' }] });
      const signature = generateAsanaSignature(original, secret);
      const tampered = JSON.stringify({ events: [{ action: 'deleted' }] });

      const response = await request(app)
        .post('/webhooks/asana')
        .set('Content-Type', 'application/json')
        .set('X-Hook-Signature', signature)
        .send(tampered);

      expect(response.status).toBe(401);
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
