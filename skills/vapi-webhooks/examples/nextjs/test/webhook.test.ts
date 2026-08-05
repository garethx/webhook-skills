import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import {
  POST,
  verifyVapiSecret,
  extractToken,
} from '../app/webhooks/vapi/route';

const SECRET = 'test_vapi_shared_secret_abc123';

beforeAll(() => {
  process.env.VAPI_WEBHOOK_SECRET = SECRET;
});

// Build a Vapi delivery body. The event type is NESTED at message.type.
function message(type: string, extra: Record<string, unknown> = {}) {
  return { message: { type, call: { id: 'call_123' }, timestamp: 1712345678000, ...extra } };
}

function makeRequest(
  body: unknown,
  secret: string | null = SECRET,
  header: 'bearer' | 'x-vapi-secret' = 'bearer'
): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret !== null) {
    if (header === 'bearer') headers['Authorization'] = `Bearer ${secret}`;
    else headers['X-Vapi-Secret'] = secret;
  }
  return new NextRequest('http://localhost:3000/webhooks/vapi', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('verifyVapiSecret / extractToken', () => {
  it('extracts a Bearer token', () => {
    expect(extractToken(new Headers({ authorization: `Bearer ${SECRET}` }))).toBe(SECRET);
  });

  it('falls back to X-Vapi-Secret', () => {
    expect(extractToken(new Headers({ 'x-vapi-secret': SECRET }))).toBe(SECRET);
  });

  it('returns true for a matching Bearer secret', () => {
    expect(verifyVapiSecret(new Headers({ authorization: `Bearer ${SECRET}` }), SECRET)).toBe(true);
  });

  it('returns false for a wrong secret', () => {
    expect(verifyVapiSecret(new Headers({ authorization: 'Bearer nope' }), SECRET)).toBe(false);
  });

  it('returns false when no secret header is present', () => {
    expect(verifyVapiSecret(new Headers(), SECRET)).toBe(false);
  });
});

describe('POST /webhooks/vapi — auth', () => {
  it('returns 401 with no secret', async () => {
    const res = await POST(makeRequest(message('status-update'), null));
    expect(res.status).toBe(401);
  });

  it('returns 401 with a wrong secret', async () => {
    const res = await POST(makeRequest(message('status-update'), 'wrong_secret'));
    expect(res.status).toBe(401);
  });

  it('accepts the legacy X-Vapi-Secret header', async () => {
    const res = await POST(makeRequest(message('status-update'), SECRET, 'x-vapi-secret'));
    expect(res.status).toBe(200);
  });
});

describe('POST /webhooks/vapi — informational types', () => {
  it('acknowledges status-update with 200', async () => {
    const res = await POST(makeRequest(message('status-update', { status: 'in-progress' })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('acknowledges an unknown type with 200 (no retry storm)', async () => {
    const res = await POST(makeRequest(message('some-future-message')));
    expect(res.status).toBe(200);
  });
});

describe('POST /webhooks/vapi — request/response types', () => {
  it('answers assistant-request with an assistantId body', async () => {
    const res = await POST(makeRequest(message('assistant-request')));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('assistantId');
  });

  it('answers tool-calls with one result per toolCall', async () => {
    const body = message('tool-calls', {
      toolCallList: [
        { id: 'tc_1', function: { name: 'get_weather', arguments: '{}' } },
        { id: 'tc_2', function: { name: 'get_time', arguments: '{}' } },
      ],
    });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toHaveLength(2);
    expect(json.results[0]).toMatchObject({ name: 'get_weather', toolCallId: 'tc_1' });
  });

  it('answers transfer-destination-request with a destination', async () => {
    const res = await POST(makeRequest(message('transfer-destination-request')));
    expect(res.status).toBe(200);
    expect((await res.json()).destination).toBeDefined();
  });

  it('answers knowledge-base-request with a documents array', async () => {
    const res = await POST(makeRequest(message('knowledge-base-request')));
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json()).documents)).toBe(true);
  });
});
