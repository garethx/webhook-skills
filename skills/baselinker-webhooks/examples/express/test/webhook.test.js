const request = require('supertest');

// Configure the OPTIONAL url token before importing the app (it is read at
// module load). This is NOT a BaseLinker signature — BaseLinker signs nothing.
process.env.BASELINKER_URL_TOKEN = 'test_url_token_abc123';
// Keep the API fetch-back inert so tests make no network calls.
delete process.env.BASELINKER_API_TOKEN;

const { app, verifyUrlToken, parseDelivery } = require('../src/index');

const TOKEN = process.env.BASELINKER_URL_TOKEN;

// A BaseLinker delivery is an HTTP HEAD request with the payload in the query
// string. Observed params: order_id (e.g. 42) and state (e.g. "packed").
function head(query = {}) {
  return request(app).head('/webhooks/baselinker').query({ token: TOKEN, ...query });
}

describe('parseDelivery', () => {
  it('coerces the string order_id to a number', () => {
    const { orderId } = parseDelivery({ order_id: '42' });
    expect(orderId).toBe(42);
    expect(typeof orderId).toBe('number');
  });

  it('reads state as an opaque string', () => {
    expect(parseDelivery({ order_id: '42', state: 'packed' }).state).toBe('packed');
  });

  it('returns null state when the param is absent', () => {
    expect(parseDelivery({ order_id: '42' }).state).toBeNull();
  });

  it('returns null orderId when order_id is absent', () => {
    expect(parseDelivery({}).orderId).toBeNull();
  });

  it('returns null orderId when order_id is not numeric', () => {
    expect(parseDelivery({ order_id: 'not-a-number' }).orderId).toBeNull();
  });

  it('returns null orderId for a non-integer or non-positive value', () => {
    expect(parseDelivery({ order_id: '4.2' }).orderId).toBeNull();
    expect(parseDelivery({ order_id: '0' }).orderId).toBeNull();
    expect(parseDelivery({ order_id: '-1' }).orderId).toBeNull();
  });

  it('returns null orderId when the param is repeated (array value)', () => {
    expect(parseDelivery({ order_id: ['1', '2'] }).orderId).toBeNull();
  });
});

describe('verifyUrlToken', () => {
  it('accepts a matching token', () => {
    expect(verifyUrlToken({ token: TOKEN }, TOKEN)).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(verifyUrlToken({ token: 'nope' }, TOKEN)).toBe(false);
  });

  it('rejects a missing token', () => {
    expect(verifyUrlToken({}, TOKEN)).toBe(false);
  });

  it('rejects a length mismatch without throwing', () => {
    expect(verifyUrlToken({ token: `${TOKEN}x` }, TOKEN)).toBe(false);
  });

  it('skips the check when no token is configured', () => {
    expect(verifyUrlToken({}, '')).toBe(true);
  });
});

describe('HEAD /webhooks/baselinker', () => {
  it('accepts a HEAD delivery carrying order_id and state', async () => {
    const res = await head({ order_id: '42', state: 'packed' });
    expect(res.status).toBe(200);
  });

  it('responds with NO body (RFC 9110 forbids a body on a HEAD response)', async () => {
    const res = await head({ order_id: '42', state: 'packed' });
    expect(res.text).toBeFalsy();
    expect(res.body).toEqual({});
  });

  it('accepts a delivery with order_id only (state is not guaranteed)', async () => {
    const res = await head({ order_id: '42' });
    expect(res.status).toBe(200);
  });

  it('accepts an unrecognised state without special-casing it', async () => {
    const res = await head({ order_id: '42', state: 'some_future_state' });
    expect(res.status).toBe(200);
  });

  it('returns 400 when order_id is missing', async () => {
    const res = await head({ state: 'packed' });
    expect(res.status).toBe(400);
    expect(res.text).toBeFalsy();
  });

  it('returns 400 when order_id is not numeric', async () => {
    const res = await head({ order_id: 'abc', state: 'packed' });
    expect(res.status).toBe(400);
  });

  it('returns 401 when the url token is wrong', async () => {
    const res = await request(app)
      .head('/webhooks/baselinker')
      .query({ token: 'wrong', order_id: '42' });
    expect(res.status).toBe(401);
    expect(res.text).toBeFalsy();
  });

  it('returns 401 when the url token is missing', async () => {
    const res = await request(app).head('/webhooks/baselinker').query({ order_id: '42' });
    expect(res.status).toBe(401);
  });

  it('does not expose a POST route (BaseLinker only ever sends HEAD)', async () => {
    const res = await request(app)
      .post('/webhooks/baselinker')
      .query({ token: TOKEN, order_id: '42' });
    expect(res.status).toBe(404);
  });

  it('does not expose a GET route (app.head is registered explicitly)', async () => {
    const res = await request(app)
      .get('/webhooks/baselinker')
      .query({ token: TOKEN, order_id: '42' });
    expect(res.status).toBe(404);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
