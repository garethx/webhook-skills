// Sets env before requiring the app so module-level config picks it up.
process.env.SMILE_WEBHOOK_SECRET = 'test_webhook_secret';

const crypto = require('crypto');
const request = require('supertest');

const SECRET = process.env.SMILE_WEBHOOK_SECRET;

const payload = JSON.stringify({
  id: 'et-123abc456def789abc123def456abc78',
  version: 1,
  type: 'ACCOUNT_CONNECTED',
  createdAt: '2021-04-14T09:30:24Z',
  data: {
    userId: 'tenantId-123abc456def789abc123def456abc78',
    accountId: 'a-123abc456def789abc123def456abc78',
    loginName: 'userLoginName',
    providers: ['abccorp'],
  },
});

// Generate a real Smile signature: HMAC-SHA512 hex over the raw body.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

function loadApp() {
  jest.resetModules();
  return require('../src/index.js');
}

describe('Smile webhook receiver (Express)', () => {
  test('accepts a valid signature and returns 200', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/smile')
      .set('Smile-Signature', sign(payload))
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('rejects a missing signature header with 400', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/smile')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature with 400', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/smile')
      .set('Smile-Signature', 'deadbeef')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(400);
  });

  test('rejects a signature made with the wrong secret with 400', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/smile')
      .set('Smile-Signature', sign(payload, 'wrong_secret'))
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(400);
  });

  test('rejects a tampered body with 400', async () => {
    const app = loadApp();
    const signature = sign(payload); // signature for the original body
    const tampered = payload.replace('ACCOUNT_CONNECTED', 'RECORD_COMPLETED');
    const res = await request(app)
      .post('/webhooks/smile')
      .set('Smile-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(tampered);

    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid JSON even with a valid signature', async () => {
    const app = loadApp();
    const body = '{not json';
    const res = await request(app)
      .post('/webhooks/smile')
      .set('Smile-Signature', sign(body))
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(400);
  });
});
