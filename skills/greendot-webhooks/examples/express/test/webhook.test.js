// Sets env before requiring the app so module-level config picks it up.
process.env.GREENDOT_WEBHOOK_TOKEN_SECRET = 'test_token_secret_at_least_32_bytes_long';
process.env.GREENDOT_WEBHOOK_SCOPE = 'post:webhook';

const jwt = require('jsonwebtoken');
const request = require('supertest');

const REQUEST_ID = 'req-abc-123';

function makeToken(overrides = {}) {
  return jwt.sign(
    { scope: 'post:webhook', ...overrides },
    process.env.GREENDOT_WEBHOOK_TOKEN_SECRET
  );
}

const payload = JSON.stringify({
  eventType: 'transaction',
  programCode: 'MYPROGRAM',
  eventId: 'evt-1',
  data: { accountId: 'acct_123', amount: 42.5 },
});

function loadApp() {
  jest.resetModules();
  return require('../src/index.js');
}

describe('Green Dot webhook receiver (Express)', () => {
  test('accepts a valid token and echoes x-GD-RequestId + responseDetails', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/greendot')
      .set('Authorization', `Bearer ${makeToken()}`)
      .set('x-GD-RequestId', REQUEST_ID)
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.headers['x-gd-requestid']).toBe(REQUEST_ID);
    expect(res.body.responseDetails[0]).toMatchObject({
      code: 0,
      subCode: 0,
      description: REQUEST_ID,
    });
  });

  test('rejects a missing bearer token with 401', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/greendot')
      .set('x-GD-RequestId', REQUEST_ID)
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(401);
  });

  test('rejects a token signed with the wrong secret with 401', async () => {
    const app = loadApp();
    const badToken = jwt.sign({ scope: 'post:webhook' }, 'wrong_secret');
    const res = await request(app)
      .post('/webhooks/greendot')
      .set('Authorization', `Bearer ${badToken}`)
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(401);
  });

  test('rejects a token missing the post:webhook scope with 401', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/greendot')
      .set('Authorization', `Bearer ${makeToken({ scope: 'read:account' })}`)
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(401);
  });

  test('ignores an x-gd-signature header (undocumented, not verified)', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/greendot')
      .set('Authorization', `Bearer ${makeToken()}`)
      .set('x-GD-RequestId', REQUEST_ID)
      .set('x-gd-signature', 'anything-here-is-not-checked')
      .set('Content-Type', 'application/json')
      .send(payload);

    // The token is the gate; the signature header does not affect the outcome.
    expect(res.status).toBe(200);
  });

  test('returns 400 for invalid JSON after auth passes', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/greendot')
      .set('Authorization', `Bearer ${makeToken()}`)
      .set('Content-Type', 'application/json')
      .send('{not json');

    expect(res.status).toBe(400);
  });
});
