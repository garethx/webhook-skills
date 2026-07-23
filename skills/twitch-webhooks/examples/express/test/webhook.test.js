const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.TWITCH_WEBHOOK_SECRET = 'test_twitch_secret';

const { app, verifyTwitchSignature } = require('../src/index');

/**
 * Generate a valid Twitch EventSub signature for testing.
 * Signs HMAC-SHA256 over messageId + timestamp + body.
 */
function generateTwitchSignature(messageId, timestamp, payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(messageId);
  hmac.update(timestamp);
  hmac.update(payload);
  return 'sha256=' + hmac.digest('hex');
}

/**
 * Build the standard Twitch headers for a request.
 */
function twitchHeaders(messageId, timestamp, signature, messageType, subscriptionType) {
  const headers = {
    'Content-Type': 'application/json',
    'Twitch-Eventsub-Message-Id': messageId,
    'Twitch-Eventsub-Message-Timestamp': timestamp,
    'Twitch-Eventsub-Message-Signature': signature,
    'Twitch-Eventsub-Message-Type': messageType,
  };
  if (subscriptionType) {
    headers['Twitch-Eventsub-Subscription-Type'] = subscriptionType;
  }
  return headers;
}

describe('Twitch Webhook Endpoint', () => {
  const secret = process.env.TWITCH_WEBHOOK_SECRET;

  describe('verifyTwitchSignature', () => {
    it('should return true for a valid signature', () => {
      const messageId = 'msg-1';
      const timestamp = new Date().toISOString();
      const body = Buffer.from('{"challenge":"abc"}');
      const signature = generateTwitchSignature(messageId, timestamp, body, secret);

      expect(verifyTwitchSignature(messageId, timestamp, body, signature, secret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const messageId = 'msg-1';
      const timestamp = new Date().toISOString();
      const body = Buffer.from('{"challenge":"abc"}');

      expect(verifyTwitchSignature(messageId, timestamp, body, 'sha256=invalid', secret)).toBe(false);
    });

    it('should return false when the message id is missing', () => {
      const timestamp = new Date().toISOString();
      const body = Buffer.from('{"challenge":"abc"}');
      const signature = generateTwitchSignature('msg-1', timestamp, body, secret);

      expect(verifyTwitchSignature(undefined, timestamp, body, signature, secret)).toBe(false);
    });

    it('should return false when the wrong secret is used', () => {
      const messageId = 'msg-1';
      const timestamp = new Date().toISOString();
      const body = Buffer.from('{"challenge":"abc"}');
      const signature = generateTwitchSignature(messageId, timestamp, body, secret);

      expect(verifyTwitchSignature(messageId, timestamp, body, signature, 'wrong_secret')).toBe(false);
    });

    it('should return false when the body is tampered', () => {
      const messageId = 'msg-1';
      const timestamp = new Date().toISOString();
      const body = Buffer.from('{"challenge":"abc"}');
      const signature = generateTwitchSignature(messageId, timestamp, body, secret);
      const tampered = Buffer.from('{"challenge":"xyz"}');

      expect(verifyTwitchSignature(messageId, timestamp, tampered, signature, secret)).toBe(false);
    });
  });

  describe('POST /webhooks/twitch', () => {
    it('should return 403 for a missing signature', async () => {
      const messageId = 'msg-1';
      const timestamp = new Date().toISOString();
      const payload = JSON.stringify({ challenge: 'abc' });

      const response = await request(app)
        .post('/webhooks/twitch')
        .set(twitchHeaders(messageId, timestamp, '', 'webhook_callback_verification'))
        .send(payload);

      expect(response.status).toBe(403);
    });

    it('should return 403 for an invalid signature', async () => {
      const messageId = 'msg-1';
      const timestamp = new Date().toISOString();
      const payload = JSON.stringify({ challenge: 'abc' });

      const response = await request(app)
        .post('/webhooks/twitch')
        .set(twitchHeaders(messageId, timestamp, 'sha256=invalid', 'webhook_callback_verification'))
        .send(payload);

      expect(response.status).toBe(403);
    });

    it('should echo the challenge as text/plain for verification', async () => {
      const messageId = 'msg-verify';
      const timestamp = new Date().toISOString();
      const payload = JSON.stringify({ challenge: 'pogchamp-challenge-123' });
      const signature = generateTwitchSignature(messageId, timestamp, payload, secret);

      const response = await request(app)
        .post('/webhooks/twitch')
        .set(twitchHeaders(messageId, timestamp, signature, 'webhook_callback_verification'))
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('pogchamp-challenge-123');
      expect(response.headers['content-type']).toMatch(/text\/plain/);
    });

    it('should return 204 for a stream.online notification', async () => {
      const messageId = 'msg-online';
      const timestamp = new Date().toISOString();
      const payload = JSON.stringify({
        subscription: { type: 'stream.online', version: '1' },
        event: { broadcaster_user_name: 'Cool_User', type: 'live' },
      });
      const signature = generateTwitchSignature(messageId, timestamp, payload, secret);

      const response = await request(app)
        .post('/webhooks/twitch')
        .set(twitchHeaders(messageId, timestamp, signature, 'notification', 'stream.online'))
        .send(payload);

      expect(response.status).toBe(204);
    });

    it('should return 204 for a channel.follow notification', async () => {
      const messageId = 'msg-follow';
      const timestamp = new Date().toISOString();
      const payload = JSON.stringify({
        subscription: { type: 'channel.follow', version: '2' },
        event: { user_name: 'Follower', broadcaster_user_name: 'Cool_User' },
      });
      const signature = generateTwitchSignature(messageId, timestamp, payload, secret);

      const response = await request(app)
        .post('/webhooks/twitch')
        .set(twitchHeaders(messageId, timestamp, signature, 'notification', 'channel.follow'))
        .send(payload);

      expect(response.status).toBe(204);
    });

    it('should return 204 for a revocation', async () => {
      const messageId = 'msg-revoke';
      const timestamp = new Date().toISOString();
      const payload = JSON.stringify({
        subscription: { type: 'stream.online', status: 'authorization_revoked' },
      });
      const signature = generateTwitchSignature(messageId, timestamp, payload, secret);

      const response = await request(app)
        .post('/webhooks/twitch')
        .set(twitchHeaders(messageId, timestamp, signature, 'revocation', 'stream.online'))
        .send(payload);

      expect(response.status).toBe(204);
    });

    it('should return 403 for a stale timestamp', async () => {
      const messageId = 'msg-stale';
      const timestamp = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago
      const payload = JSON.stringify({
        subscription: { type: 'stream.online', version: '1' },
        event: { broadcaster_user_name: 'Cool_User', type: 'live' },
      });
      const signature = generateTwitchSignature(messageId, timestamp, payload, secret);

      const response = await request(app)
        .post('/webhooks/twitch')
        .set(twitchHeaders(messageId, timestamp, signature, 'notification', 'stream.online'))
        .send(payload);

      expect(response.status).toBe(403);
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
