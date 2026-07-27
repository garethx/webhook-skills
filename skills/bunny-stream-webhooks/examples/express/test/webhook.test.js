const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.BUNNY_STREAM_WEBHOOK_SECRET = 'test_read_only_api_key';

const { app, verifyBunnyStream } = require('../src/index');

/**
 * Generate a valid Bunny Stream signature for testing.
 * HMAC-SHA256 over the raw body, keyed on the Read-Only API key, lowercase hex.
 */
function generateBunnySignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('Bunny Stream Webhook Endpoint', () => {
  const webhookSecret = process.env.BUNNY_STREAM_WEBHOOK_SECRET;

  describe('verifyBunnyStream', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from(
        '{"VideoLibraryId":12345,"VideoGuid":"abc","Status":3}'
      );
      const signature = generateBunnySignature(payload, webhookSecret);

      expect(verifyBunnyStream(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"Status":3}');

      expect(verifyBunnyStream(payload, 'deadbeef', webhookSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"Status":3}');

      expect(verifyBunnyStream(payload, null, webhookSecret)).toBe(false);
    });

    it('should return false for wrong secret', () => {
      const payload = Buffer.from('{"Status":3}');
      const signature = generateBunnySignature(payload, webhookSecret);

      expect(verifyBunnyStream(payload, signature, 'wrong_secret')).toBe(false);
    });

    it('should return false for a tampered body', () => {
      const original = Buffer.from('{"VideoGuid":"abc","Status":3}');
      const signature = generateBunnySignature(original, webhookSecret);
      const tampered = Buffer.from('{"VideoGuid":"abc","Status":5}');

      expect(verifyBunnyStream(tampered, signature, webhookSecret)).toBe(false);
    });

    it('should return false for a non-hex signature header', () => {
      const payload = Buffer.from('{"Status":3}');

      expect(verifyBunnyStream(payload, 'not-hex!!', webhookSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/bunny-stream', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/bunny-stream')
        .set('Content-Type', 'application/json')
        .send('{"VideoLibraryId":1,"VideoGuid":"abc","Status":3}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({
        VideoLibraryId: 1,
        VideoGuid: 'abc',
        Status: 3,
      });

      const response = await request(app)
        .post('/webhooks/bunny-stream')
        .set('Content-Type', 'application/json')
        .set('X-BunnyStream-Signature', 'deadbeef')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for valid signature (Status 3 Finished)', async () => {
      const payload = JSON.stringify({
        VideoLibraryId: 12345,
        VideoGuid: '0a1b2c3d-4e5f-6789-abcd-ef0123456789',
        Status: 3,
      });
      const signature = generateBunnySignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/bunny-stream')
        .set('Content-Type', 'application/json')
        .set('X-BunnyStream-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle Status 5 (Failed)', async () => {
      const payload = JSON.stringify({
        VideoLibraryId: 12345,
        VideoGuid: 'abc',
        Status: 5,
      });
      const signature = generateBunnySignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/bunny-stream')
        .set('Content-Type', 'application/json')
        .set('X-BunnyStream-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle Status 9 (CaptionsGenerated)', async () => {
      const payload = JSON.stringify({
        VideoLibraryId: 12345,
        VideoGuid: 'abc',
        Status: 9,
      });
      const signature = generateBunnySignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/bunny-stream')
        .set('Content-Type', 'application/json')
        .set('X-BunnyStream-Signature', signature)
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
