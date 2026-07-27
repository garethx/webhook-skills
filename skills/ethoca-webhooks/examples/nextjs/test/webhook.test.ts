import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyEthocaAuth, alertCategory, POST } from '../app/webhooks/ethoca/route';

const USER = 'test_user';
const PASS = 'test_pass:with:colons';

beforeAll(() => {
  process.env.ETHOCA_WEBHOOK_USERNAME = USER;
  process.env.ETHOCA_WEBHOOK_PASSWORD = PASS;
});

/**
 * Build a valid Basic Auth header for testing.
 */
function basicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;
  return new NextRequest('http://localhost:3000/webhooks/ethoca', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('verifyEthocaAuth', () => {
  it('returns true for valid credentials', () => {
    expect(verifyEthocaAuth(basicAuth(USER, PASS), USER, PASS)).toBe(true);
  });

  it('returns false for a wrong password', () => {
    expect(verifyEthocaAuth(basicAuth(USER, 'nope'), USER, PASS)).toBe(false);
  });

  it('returns false for a missing header', () => {
    expect(verifyEthocaAuth(null, USER, PASS)).toBe(false);
  });

  it('returns false for a non-Basic scheme', () => {
    expect(verifyEthocaAuth('Bearer token', USER, PASS)).toBe(false);
  });

  it('handles passwords containing colons', () => {
    expect(verifyEthocaAuth(basicAuth(USER, PASS), USER, PASS)).toBe(true);
  });
});

describe('alertCategory', () => {
  it('maps string and numeric alert types', () => {
    expect(alertCategory('fraud')).toBe('fraud');
    expect(alertCategory('dispute')).toBe('dispute');
    expect(alertCategory(1)).toBe('fraud');
    expect(alertCategory(2)).toBe('dispute');
    expect(alertCategory('other')).toBe('unknown');
  });
});

describe('POST /webhooks/ethoca', () => {
  const alert = {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    alertType: 'fraud',
    transaction: { arn: '74987654321098765432109', amount: '125.00', currency: 'USD' },
  };

  it('returns 401 when credentials are configured but the header is missing', async () => {
    const res = await POST(makeRequest(alert));
    expect(res.status).toBe(401);
  });

  it('accepts a delivery without Basic Auth when no credentials are configured (mTLS-only)', async () => {
    const savedUser = process.env.ETHOCA_WEBHOOK_USERNAME;
    const savedPass = process.env.ETHOCA_WEBHOOK_PASSWORD;
    delete process.env.ETHOCA_WEBHOOK_USERNAME;
    delete process.env.ETHOCA_WEBHOOK_PASSWORD;
    try {
      const res = await POST(makeRequest(alert));
      expect(res.status).toBe(200);
    } finally {
      process.env.ETHOCA_WEBHOOK_USERNAME = savedUser;
      process.env.ETHOCA_WEBHOOK_PASSWORD = savedPass;
    }
  });

  it('returns 401 for invalid credentials', async () => {
    const res = await POST(makeRequest(alert, basicAuth(USER, 'wrong')));
    expect(res.status).toBe(401);
  });

  it('returns 200 for valid credentials', async () => {
    const res = await POST(makeRequest(alert, basicAuth(USER, PASS)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles fraud and dispute alerts', async () => {
    for (const alertType of ['fraud', 'dispute']) {
      const res = await POST(makeRequest({ ...alert, alertType }, basicAuth(USER, PASS)));
      expect(res.status).toBe(200);
    }
  });
});
