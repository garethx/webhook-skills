import { describe, it, expect, beforeAll } from 'vitest';
import { POST, verifyBasicAuth } from '../app/webhooks/pipedrive/route';

beforeAll(() => {
  process.env.PIPEDRIVE_WEBHOOK_USER = 'test-user';
  process.env.PIPEDRIVE_WEBHOOK_PASSWORD = 'test-password';
});

/**
 * Build an HTTP Basic Auth header, exactly as Pipedrive sends it:
 * "Basic " + base64("user:password").
 */
function basicAuth(user: string, password: string): string {
  return 'Basic ' + Buffer.from(`${user}:${password}`, 'utf8').toString('base64');
}

const validAuth = basicAuth('test-user', 'test-password');

function makeRequest(auth: string | null, body: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = auth;
  return new Request('http://localhost/webhooks/pipedrive', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function payload(action: string, entity: string) {
  return {
    meta: { action, entity, entity_id: '123', correlation_id: 'corr-abc', version: '2.0' },
    data: { id: 123, title: 'Test deal' },
    previous: null,
  };
}

describe('verifyBasicAuth', () => {
  it('accepts matching credentials', () => {
    expect(verifyBasicAuth(validAuth, 'test-user', 'test-password')).toBe(true);
  });

  it('rejects a wrong password', () => {
    expect(verifyBasicAuth(basicAuth('test-user', 'nope'), 'test-user', 'test-password')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyBasicAuth(null, 'test-user', 'test-password')).toBe(false);
  });

  it('rejects a non-Basic scheme', () => {
    expect(verifyBasicAuth('Bearer token', 'test-user', 'test-password')).toBe(false);
  });

  it('handles passwords containing a colon', () => {
    expect(verifyBasicAuth(basicAuth('u', 'a:b:c'), 'u', 'a:b:c')).toBe(true);
  });
});

describe('POST /webhooks/pipedrive', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const res = await POST(makeRequest(null, payload('create', 'deal')) as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong credentials', async () => {
    const res = await POST(makeRequest(basicAuth('test-user', 'wrong'), payload('create', 'deal')) as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 for a valid credential but invalid payload', async () => {
    const res = await POST(makeRequest(validAuth, { not: 'a webhook' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid delivery', async () => {
    const res = await POST(makeRequest(validAuth, payload('create', 'deal')) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles the documented event types', async () => {
    const events: [string, string][] = [
      ['create', 'deal'],
      ['change', 'deal'],
      ['delete', 'deal'],
      ['change', 'person'],
      ['create', 'activity'],
      ['change', 'organization'],
    ];
    for (const [action, entity] of events) {
      const res = await POST(makeRequest(validAuth, payload(action, entity)) as never);
      expect(res.status).toBe(200);
    }
  });
});
