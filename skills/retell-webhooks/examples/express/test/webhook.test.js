const request = require('supertest');
const crypto = require('crypto');

// Set test environment BEFORE importing the app
process.env.NODE_ENV = 'test';
process.env.RETELL_API_KEY = 'test_retell_api_key';

const app = require('../src/index.js');

/**
 * Generate a Retell-format signature header: "v={ms_timestamp},d={hex_digest}"
 * over (raw body + timestamp), HMAC-SHA256 with the API key as the secret.
 */
function signBody(body, apiKey, timestamp = Date.now()) {
  const digest = crypto
    .createHmac('sha256', apiKey)
    .update(body + timestamp)
    .digest('hex');
  return `v=${timestamp},d=${digest}`;
}

describe('Retell Webhook Handler', () => {
  const apiKey = process.env.RETELL_API_KEY;

  describe('POST /webhooks/retell', () => {
    it('accepts a valid webhook with a correct signature', async () => {
      const payload = JSON.stringify({
        event: 'call_ended',
        call: { call_id: 'call_abc123', agent_id: 'agent_1' },
      });
      const signature = signBody(payload, apiKey);

      const response = await request(app)
        .post('/webhooks/retell')
        .set('X-Retell-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('rejects an invalid signature', async () => {
      const payload = JSON.stringify({
        event: 'call_ended',
        call: { call_id: 'call_abc123' },
      });

      const response = await request(app)
        .post('/webhooks/retell')
        .set('X-Retell-Signature', `v=${Date.now()},d=deadbeef`)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('rejects a request with no signature header', async () => {
      const payload = JSON.stringify({
        event: 'call_ended',
        call: { call_id: 'call_abc123' },
      });

      const response = await request(app)
        .post('/webhooks/retell')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('rejects a signature signed with the wrong key', async () => {
      const payload = JSON.stringify({
        event: 'call_ended',
        call: { call_id: 'call_abc123' },
      });
      const signature = signBody(payload, 'wrong_key');

      const response = await request(app)
        .post('/webhooks/retell')
        .set('X-Retell-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('rejects an expired timestamp (older than 5 minutes)', async () => {
      const payload = JSON.stringify({
        event: 'call_ended',
        call: { call_id: 'call_abc123' },
      });
      const oldTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
      const signature = signBody(payload, apiKey, oldTimestamp);

      const response = await request(app)
        .post('/webhooks/retell')
        .set('X-Retell-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('handles a lowercase signature header', async () => {
      const payload = JSON.stringify({
        event: 'call_started',
        call: { call_id: 'call_lower' },
      });
      const signature = signBody(payload, apiKey);

      const response = await request(app)
        .post('/webhooks/retell')
        .set('x-retell-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('handles all documented event types', async () => {
      const events = [
        ['call_started', 'call'],
        ['call_ended', 'call'],
        ['call_analyzed', 'call'],
        ['transcript_updated', 'call'],
        ['transfer_started', 'call'],
        ['transfer_bridged', 'call'],
        ['transfer_cancelled', 'call'],
        ['transfer_ended', 'call'],
        ['chat_started', 'chat'],
        ['chat_ended', 'chat'],
        ['chat_analyzed', 'chat'],
      ];

      for (const [event, objectKey] of events) {
        const body = { event };
        body[objectKey] = { [`${objectKey}_id`]: `${objectKey}_${event}` };
        const payload = JSON.stringify(body);
        const signature = signBody(payload, apiKey);

        const response = await request(app)
          .post('/webhooks/retell')
          .set('X-Retell-Signature', signature)
          .set('Content-Type', 'application/json')
          .send(payload);

        expect(response.status).toBe(200);
      }
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
