const request = require('supertest');

// Set test environment variables before importing the app
process.env.ETHOCA_WEBHOOK_USERNAME = 'test_user';
process.env.ETHOCA_WEBHOOK_PASSWORD = 'test_pass:with:colons';

const { app, verifyEthocaAuth, alertCategory } = require('../src/index');

/**
 * Build a valid Basic Auth header for testing.
 */
function basicAuth(username, password) {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

const USER = process.env.ETHOCA_WEBHOOK_USERNAME;
const PASS = process.env.ETHOCA_WEBHOOK_PASSWORD;

describe('verifyEthocaAuth', () => {
  it('returns true for valid credentials', () => {
    expect(verifyEthocaAuth(basicAuth(USER, PASS), USER, PASS)).toBe(true);
  });

  it('returns false for a wrong password', () => {
    expect(verifyEthocaAuth(basicAuth(USER, 'nope'), USER, PASS)).toBe(false);
  });

  it('returns false for a wrong username', () => {
    expect(verifyEthocaAuth(basicAuth('someone', PASS), USER, PASS)).toBe(false);
  });

  it('returns false for a missing header', () => {
    expect(verifyEthocaAuth(undefined, USER, PASS)).toBe(false);
  });

  it('returns false for a non-Basic scheme', () => {
    expect(verifyEthocaAuth('Bearer token', USER, PASS)).toBe(false);
  });

  it('handles passwords containing colons', () => {
    // PASS is "test_pass:with:colons" — must split on the FIRST colon only
    expect(verifyEthocaAuth(basicAuth(USER, PASS), USER, PASS)).toBe(true);
  });
});

describe('alertCategory', () => {
  it('maps string alert types', () => {
    expect(alertCategory('fraud')).toBe('fraud');
    expect(alertCategory('dispute')).toBe('dispute');
  });

  it('maps historically-numeric alert types', () => {
    expect(alertCategory(1)).toBe('fraud');
    expect(alertCategory(2)).toBe('dispute');
  });

  it('returns unknown for unrecognized types', () => {
    expect(alertCategory('other')).toBe('unknown');
  });
});

describe('POST /webhooks/ethoca', () => {
  const alert = {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    alertType: 'fraud',
    transaction: { arn: '74987654321098765432109', amount: '125.00', currency: 'USD' },
  };

  it('returns 401 when the Authorization header is missing', async () => {
    const res = await request(app).post('/webhooks/ethoca').send(alert);
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid credentials', async () => {
    const res = await request(app)
      .post('/webhooks/ethoca')
      .set('Authorization', basicAuth(USER, 'wrong'))
      .send(alert);
    expect(res.status).toBe(401);
  });

  it('returns 200 for valid credentials', async () => {
    const res = await request(app)
      .post('/webhooks/ethoca')
      .set('Authorization', basicAuth(USER, PASS))
      .send(alert);
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('handles fraud and dispute alerts', async () => {
    for (const alertType of ['fraud', 'dispute']) {
      const res = await request(app)
        .post('/webhooks/ethoca')
        .set('Authorization', basicAuth(USER, PASS))
        .send({ ...alert, alertType });
      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
