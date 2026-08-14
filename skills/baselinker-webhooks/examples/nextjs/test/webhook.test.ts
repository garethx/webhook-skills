import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { HEAD, verifyUrlToken, parseDelivery } from '../app/webhooks/baselinker/route';

// The OPTIONAL url token — a value YOU append to the registered endpoint URL.
// It is NOT a BaseLinker signature; BaseLinker signs nothing.
const TOKEN = 'test_url_token_abc123';

beforeAll(() => {
  process.env.BASELINKER_URL_TOKEN = TOKEN;
  // Keep the API fetch-back inert so tests make no network calls.
  delete process.env.BASELINKER_API_TOKEN;
});

// A BaseLinker delivery is an HTTP HEAD request with NO body — the payload is
// entirely in the query string.
function makeRequest(query: Record<string, string> = {}, withToken = true): NextRequest {
  const params = new URLSearchParams(query);
  if (withToken) params.set('token', TOKEN);
  return new NextRequest(`http://localhost:3000/webhooks/baselinker?${params}`, {
    method: 'HEAD',
  });
}

function params(query: Record<string, string>): URLSearchParams {
  return new URLSearchParams(query);
}

describe('parseDelivery', () => {
  it('coerces the string order_id to a number', () => {
    const { orderId } = parseDelivery(params({ order_id: '42' }));
    expect(orderId).toBe(42);
    expect(typeof orderId).toBe('number');
  });

  it('reads state as an opaque string', () => {
    expect(parseDelivery(params({ order_id: '42', state: 'packed' })).state).toBe('packed');
  });

  it('returns null state when the param is absent', () => {
    expect(parseDelivery(params({ order_id: '42' })).state).toBeNull();
  });

  it('returns null orderId when order_id is absent', () => {
    expect(parseDelivery(params({})).orderId).toBeNull();
  });

  it('returns null orderId when order_id is not numeric', () => {
    expect(parseDelivery(params({ order_id: 'not-a-number' })).orderId).toBeNull();
  });

  it('returns null orderId for a non-integer or non-positive value', () => {
    expect(parseDelivery(params({ order_id: '4.2' })).orderId).toBeNull();
    expect(parseDelivery(params({ order_id: '0' })).orderId).toBeNull();
    expect(parseDelivery(params({ order_id: '-1' })).orderId).toBeNull();
  });
});

describe('verifyUrlToken', () => {
  it('accepts a matching token', () => {
    expect(verifyUrlToken(params({ token: TOKEN }), TOKEN)).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(verifyUrlToken(params({ token: 'nope' }), TOKEN)).toBe(false);
  });

  it('rejects a missing token', () => {
    expect(verifyUrlToken(params({}), TOKEN)).toBe(false);
  });

  it('rejects a length mismatch without throwing', () => {
    expect(verifyUrlToken(params({ token: `${TOKEN}x` }), TOKEN)).toBe(false);
  });

  it('skips the check when no token is configured', () => {
    expect(verifyUrlToken(params({}), undefined)).toBe(true);
  });
});

describe('HEAD /webhooks/baselinker', () => {
  it('accepts a HEAD delivery carrying order_id and state', async () => {
    const res = await HEAD(makeRequest({ order_id: '42', state: 'packed' }));
    expect(res.status).toBe(200);
  });

  it('responds with NO body (RFC 9110 forbids a body on a HEAD response)', async () => {
    const res = await HEAD(makeRequest({ order_id: '42', state: 'packed' }));
    expect(res.body).toBeNull();
    expect(await res.text()).toBe('');
  });

  it('accepts a delivery with order_id only (state is not guaranteed)', async () => {
    const res = await HEAD(makeRequest({ order_id: '42' }));
    expect(res.status).toBe(200);
  });

  it('accepts an unrecognised state without special-casing it', async () => {
    const res = await HEAD(makeRequest({ order_id: '42', state: 'some_future_state' }));
    expect(res.status).toBe(200);
  });

  it('returns a bodyless 400 when order_id is missing', async () => {
    const res = await HEAD(makeRequest({ state: 'packed' }));
    expect(res.status).toBe(400);
    expect(res.body).toBeNull();
  });

  it('returns 400 when order_id is not numeric', async () => {
    const res = await HEAD(makeRequest({ order_id: 'abc', state: 'packed' }));
    expect(res.status).toBe(400);
  });

  it('returns a bodyless 401 when the url token is missing', async () => {
    const res = await HEAD(makeRequest({ order_id: '42' }, false));
    expect(res.status).toBe(401);
    expect(res.body).toBeNull();
  });

  it('returns 401 when the url token is wrong', async () => {
    const req = new NextRequest(
      'http://localhost:3000/webhooks/baselinker?order_id=42&token=wrong',
      { method: 'HEAD' }
    );
    const res = await HEAD(req);
    expect(res.status).toBe(401);
  });
});
