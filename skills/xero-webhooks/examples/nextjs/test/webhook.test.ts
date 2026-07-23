import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Set test environment variables before importing the route
beforeAll(() => {
  process.env.XERO_WEBHOOK_KEY = 'test_xero_signing_key';
});

const signingKey = 'test_xero_signing_key';

/**
 * Generate a valid Xero signature for testing:
 * base64( HMAC-SHA256(rawBody, signingKey) )
 */
function generateXeroSignature(payload: string, key: string): string {
  return crypto.createHmac('sha256', key).update(payload, 'utf8').digest('base64');
}

function samplePayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    events: [
      {
        resourceUrl: 'https://api.xero.com/api.xro/2.0/Contacts/abc-123',
        resourceId: 'abc-123',
        eventDateUtc: '2024-05-01T12:00:00.000',
        eventType: 'CREATE',
        eventCategory: 'CONTACT',
        tenantId: 'tenant-1',
        tenantType: 'ORGANISATION',
        ...overrides,
      },
    ],
    firstEventSequence: 1,
    lastEventSequence: 1,
    entropy: 'abc',
  });
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== undefined) headers['x-xero-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/xero', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /webhooks/xero', () => {
  it('returns 401 when the signature header is missing', async () => {
    const { POST } = await import('../app/webhooks/xero/route');
    const res = await POST(makeRequest(samplePayload()));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature (ITR bad-signature probe)', async () => {
    const { POST } = await import('../app/webhooks/xero/route');
    const res = await POST(makeRequest(samplePayload(), 'invalid-signature'));
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid signature (ITR good-signature probe)', async () => {
    const { POST } = await import('../app/webhooks/xero/route');
    const payload = samplePayload();
    const res = await POST(makeRequest(payload, generateXeroSignature(payload, signingKey)));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
  });

  it('returns 401 for a tampered body', async () => {
    const { POST } = await import('../app/webhooks/xero/route');
    const signature = generateXeroSignature(samplePayload(), signingKey);
    const tampered = samplePayload({ resourceId: 'evil-999' });
    const res = await POST(makeRequest(tampered, signature));
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid signature with an empty ITR-style body', async () => {
    const { POST } = await import('../app/webhooks/xero/route');
    const payload = JSON.stringify({ events: [], firstEventSequence: 0, lastEventSequence: 0, entropy: 'x' });
    const res = await POST(makeRequest(payload, generateXeroSignature(payload, signingKey)));
    expect(res.status).toBe(200);
  });

  it('handles all event category/type combinations', async () => {
    const { POST } = await import('../app/webhooks/xero/route');
    const combos: Array<[string, string]> = [
      ['CONTACT', 'CREATE'],
      ['CONTACT', 'UPDATE'],
      ['INVOICE', 'CREATE'],
      ['INVOICE', 'UPDATE'],
      ['CREDITNOTE', 'CREATE'],
      ['CREDITNOTE', 'UPDATE'],
      ['SUBSCRIPTION', 'CREATE'],
      ['SUBSCRIPTION', 'UPDATE'],
    ];

    for (const [eventCategory, eventType] of combos) {
      const payload = samplePayload({ eventCategory, eventType });
      const res = await POST(makeRequest(payload, generateXeroSignature(payload, signingKey)));
      expect(res.status).toBe(200);
    }
  });
});
