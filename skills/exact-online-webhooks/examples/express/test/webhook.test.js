process.env.EXACT_WEBHOOK_SECRET = 'test_exact_webhook_secret';

const crypto = require('crypto');
const request = require('supertest');
const { app, verifyExactWebhook } = require('../src/index');

const SECRET = process.env.EXACT_WEBHOOK_SECRET;

/**
 * Build a valid Exact Online webhook body for a given Content object.
 *
 * The HashCode is HMAC-SHA256 over the *exact raw JSON substring* of Content,
 * so we serialize Content once and reuse that exact string in both the HMAC
 * input and the body — mirroring what Exact does.
 */
function buildWebhook(content, secret = SECRET) {
  const contentJson = JSON.stringify(content);
  const hashCode = crypto
    .createHmac('sha256', secret)
    .update(contentJson, 'utf8')
    .digest('hex')
    .toUpperCase();
  return `{"Content":${contentJson},"HashCode":"${hashCode}"}`;
}

const sampleContent = {
  Topic: 'Accounts',
  Action: 'Update',
  Key: 'd4d4c8b6-1a2b-4c3d-9e8f-1234567890ab',
  Division: 123456,
  ClientId: '0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d',
};

describe('verifyExactWebhook', () => {
  test('returns true for a valid HashCode', () => {
    const body = buildWebhook(sampleContent);
    expect(verifyExactWebhook(body, SECRET)).toBe(true);
  });

  test('accepts a Buffer body', () => {
    const body = Buffer.from(buildWebhook(sampleContent), 'utf8');
    expect(verifyExactWebhook(body, SECRET)).toBe(true);
  });

  test('returns false for a tampered Content node', () => {
    const body = buildWebhook(sampleContent).replace('Update', 'Delete');
    expect(verifyExactWebhook(body, SECRET)).toBe(false);
  });

  test('returns false for the wrong secret', () => {
    const body = buildWebhook(sampleContent);
    expect(verifyExactWebhook(body, 'wrong_secret')).toBe(false);
  });

  test('returns false when HashCode is missing', () => {
    const contentJson = JSON.stringify(sampleContent);
    expect(verifyExactWebhook(`{"Content":${contentJson}}`, SECRET)).toBe(false);
  });

  test('accepts lowercase hex HashCode (case-insensitive)', () => {
    const contentJson = JSON.stringify(sampleContent);
    const hashCode = crypto
      .createHmac('sha256', SECRET)
      .update(contentJson, 'utf8')
      .digest('hex'); // lowercase
    const body = `{"Content":${contentJson},"HashCode":"${hashCode}"}`;
    expect(verifyExactWebhook(body, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/exact-online', () => {
  function post(body) {
    return request(app)
      .post('/webhooks/exact-online')
      .set('Content-Type', 'application/json')
      .send(body);
  }

  test('returns 200 for a valid signature', async () => {
    const res = await post(buildWebhook(sampleContent));
    expect(res.status).toBe(200);
  });

  test('returns 401 for an invalid signature', async () => {
    const body = `{"Content":${JSON.stringify(sampleContent)},"HashCode":"DEADBEEF"}`;
    const res = await post(body);
    expect(res.status).toBe(401);
  });

  test('returns 401 for a tampered payload', async () => {
    const body = buildWebhook(sampleContent).replace('Accounts', 'Items');
    const res = await post(body);
    expect(res.status).toBe(401);
  });

  test('handles each common topic with 200', async () => {
    const topics = [
      'Accounts',
      'Items',
      'StockPositions',
      'FinancialTransactions',
      'GoodsDeliveries',
      'Contacts',
    ];
    for (const Topic of topics) {
      const res = await post(buildWebhook({ ...sampleContent, Topic }));
      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
