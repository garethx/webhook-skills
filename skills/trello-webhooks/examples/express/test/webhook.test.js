const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.TRELLO_SECRET = 'test_trello_secret';
process.env.TRELLO_CALLBACK_URL = 'https://example.com/webhooks/trello';

const { app, verifyTrelloWebhook } = require('../src/index');

const CALLBACK_URL = process.env.TRELLO_CALLBACK_URL;
const SECRET = process.env.TRELLO_SECRET;

/**
 * Generate a valid Trello signature for testing:
 * base64(HMAC-SHA1(rawBody + callbackURL, secret))
 */
function generateTrelloSignature(payload, secret, callbackURL) {
  return crypto
    .createHmac('sha1', secret)
    .update(Buffer.concat([Buffer.from(payload), Buffer.from(callbackURL)]))
    .digest('base64');
}

describe('Trello Webhook Endpoint', () => {
  describe('verifyTrelloWebhook', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"action":{"type":"createCard"}}');
      const signature = generateTrelloSignature(payload, SECRET, CALLBACK_URL);

      expect(verifyTrelloWebhook(payload, signature, SECRET, CALLBACK_URL)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"action":{"type":"createCard"}}');

      expect(verifyTrelloWebhook(payload, 'invalid_signature', SECRET, CALLBACK_URL)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"action":{"type":"createCard"}}');

      expect(verifyTrelloWebhook(payload, undefined, SECRET, CALLBACK_URL)).toBe(false);
    });

    it('should return false when the callback URL differs', () => {
      const payload = Buffer.from('{"action":{"type":"createCard"}}');
      const signature = generateTrelloSignature(payload, SECRET, CALLBACK_URL);

      expect(
        verifyTrelloWebhook(payload, signature, SECRET, 'https://evil.example.com/webhooks/trello')
      ).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = Buffer.from('{"action":{"type":"createCard","data":{"amount":1}}}');
      const signature = generateTrelloSignature(original, SECRET, CALLBACK_URL);
      const tampered = Buffer.from('{"action":{"type":"createCard","data":{"amount":999}}}');

      expect(verifyTrelloWebhook(tampered, signature, SECRET, CALLBACK_URL)).toBe(false);
    });
  });

  describe('HEAD /webhooks/trello', () => {
    it('should return 200 for the creation HEAD check', async () => {
      const response = await request(app).head('/webhooks/trello');
      expect(response.status).toBe(200);
    });
  });

  describe('POST /webhooks/trello', () => {
    it('should return 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/trello')
        .set('Content-Type', 'application/json')
        .send('{"action":{"type":"createCard"}}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for an invalid signature', async () => {
      const payload = JSON.stringify({ action: { type: 'createCard' } });

      const response = await request(app)
        .post('/webhooks/trello')
        .set('Content-Type', 'application/json')
        .set('x-trello-webhook', 'invalid_signature')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        action: { type: 'createCard', data: { card: { name: 'New card' } } },
        model: { id: 'abc', name: 'My Board' },
      });
      const signature = generateTrelloSignature(payload, SECRET, CALLBACK_URL);

      const response = await request(app)
        .post('/webhooks/trello')
        .set('Content-Type', 'application/json')
        .set('x-trello-webhook', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle different action types', async () => {
      const types = [
        'createCard',
        'updateCard',
        'deleteCard',
        'commentCard',
        'addAttachmentToCard',
        'addMemberToCard',
        'createList',
        'updateList',
        'addMemberToBoard',
        'removeMemberFromBoard',
        'updateBoard',
      ];

      for (const type of types) {
        const payload = JSON.stringify({ action: { type, data: {} } });
        const signature = generateTrelloSignature(payload, SECRET, CALLBACK_URL);

        const response = await request(app)
          .post('/webhooks/trello')
          .set('Content-Type', 'application/json')
          .set('x-trello-webhook', signature)
          .send(payload);

        expect(response.status).toBe(200);
      }
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
