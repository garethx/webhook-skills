import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';

const TEST_SECRET = 'test_monday_signing_secret';

beforeAll(() => {
  process.env.MONDAY_SIGNING_SECRET = TEST_SECRET;
});

// Import after env is set so the route reads the test secret.
const { POST, verifyMondayJwt } = await import('../app/webhooks/monday/route');

/**
 * Generate a valid monday.com Authorization JWT for testing.
 * monday.com signs each request with an HS256 JWT using the Signing Secret.
 */
async function generateMondayJwt(
  secret: string,
  claims: Record<string, unknown> = {}
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ accountId: 123, userId: 456, ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

function makeRequest(body: object, authHeader?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;
  return new NextRequest('http://localhost:3000/webhooks/monday', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function eventBody(type: string, extra: Record<string, unknown> = {}) {
  return {
    event: {
      type,
      userId: 456,
      boardId: 1771812698,
      pulseId: 1772099344,
      pulseName: 'Test item',
      triggerUuid: 'b12b4f2b58e83e2b4b6e2f7e6f4b1a2c',
      ...extra,
    },
  };
}

describe('monday.com Webhook Route', () => {
  it('echoes the challenge token with 200 (no JWT required)', async () => {
    const challenge = '3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P';
    const response = await POST(makeRequest({ challenge }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge });
  });

  it('returns 401 for a missing Authorization header', async () => {
    const response = await POST(makeRequest(eventBody('create_item')));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid JWT', async () => {
    const response = await POST(makeRequest(eventBody('create_item'), 'invalid.jwt.token'));
    expect(response.status).toBe(401);
  });

  it('returns 401 for a JWT signed with the wrong secret', async () => {
    const token = await generateMondayJwt('wrong_secret');
    const response = await POST(makeRequest(eventBody('create_item'), token));
    expect(response.status).toBe(401);
  });

  it('returns 200 for a valid JWT', async () => {
    const token = await generateMondayJwt(TEST_SECRET);
    const response = await POST(makeRequest(eventBody('create_item'), token));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('accepts a "Bearer "-prefixed token', async () => {
    const token = await generateMondayJwt(TEST_SECRET);
    const response = await POST(makeRequest(eventBody('create_item'), `Bearer ${token}`));
    expect(response.status).toBe(200);
  });

  it('handles different event types', async () => {
    const token = await generateMondayJwt(TEST_SECRET);
    const eventTypes = [
      'create_item',
      'change_column_value',
      'change_status_column_value',
      'change_name',
      'create_update',
      'create_subitem',
      'item_archived',
      'item_deleted',
      'unknown_event_type',
    ];

    for (const type of eventTypes) {
      const response = await POST(makeRequest(eventBody(type, { parentItemId: 999 }), token));
      expect(response.status).toBe(200);
    }
  });
});

describe('verifyMondayJwt', () => {
  it('throws for a missing Authorization header', async () => {
    await expect(verifyMondayJwt(null, TEST_SECRET)).rejects.toThrow();
  });

  it('returns the decoded payload for a valid token', async () => {
    const token = await generateMondayJwt(TEST_SECRET, { userId: 789 });
    const payload = await verifyMondayJwt(token, TEST_SECRET);
    expect(payload.userId).toBe(789);
  });

  it('throws for a token signed with the wrong secret', async () => {
    const token = await generateMondayJwt('wrong_secret');
    await expect(verifyMondayJwt(token, TEST_SECRET)).rejects.toThrow();
  });
});
