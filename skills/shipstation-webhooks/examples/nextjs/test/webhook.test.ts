import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  verifyToken,
  fetchResource,
} from '../app/webhooks/shipstation/verify';

const RESOURCE_URL = 'https://ssapi.shipstation.com/orders?importBatch=abc-123';

describe('verifyToken', () => {
  const secret = 'test_secret_token';

  it('accepts a matching token', () => {
    expect(verifyToken('test_secret_token', secret)).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(verifyToken('nope', secret)).toBe(false);
  });

  it('rejects a missing token', () => {
    expect(verifyToken(null, secret)).toBe(false);
    expect(verifyToken(undefined, secret)).toBe(false);
    expect(verifyToken('', secret)).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifyToken('anything', undefined)).toBe(false);
  });
});

describe('fetchResource', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when credentials are not configured', async () => {
    const result = await fetchResource(RESOURCE_URL, undefined, undefined);
    expect(result).toBeNull();
  });

  it('refuses to fetch a non-ShipStation host (SSRF guard)', async () => {
    await expect(
      fetchResource('https://evil.example.com/steal', 'key', 'secret')
    ).rejects.toThrow(/non-ShipStation host/);
  });

  it('fetches with HTTP Basic auth', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ orders: [{ orderId: 123 }] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchResource(RESOURCE_URL, 'test_api_key', 'test_api_secret');

    expect(result).toEqual({ orders: [{ orderId: 123 }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, opts] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).toBe(RESOURCE_URL);
    const expectedAuth =
      'Basic ' + Buffer.from('test_api_key:test_api_secret').toString('base64');
    expect(opts.headers.Authorization).toBe(expectedAuth);
  });

  it('fetches a numbered ShipStation host (ssapi<N>.shipstation.com)', async () => {
    const numberedUrl = 'https://ssapi2.shipstation.com/orders?importBatch=abc-123';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ orders: [{ orderId: 123 }] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchResource(numberedUrl, 'test_api_key', 'test_api_secret');

    expect(result).toEqual({ orders: [{ orderId: 123 }] });
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(numberedUrl);
  });

  it('throws on a 429 rate-limit response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 429,
      headers: { get: (name: string) => (name === 'X-Rate-Limit-Reset' ? '30' : null) },
      json: async () => ({}),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchResource(RESOURCE_URL, 'key', 'secret')
    ).rejects.toThrow(/Rate limited/);
  });
});
