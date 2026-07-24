import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

process.env.EXACT_WEBHOOK_SECRET = 'test_exact_webhook_secret';

// Import after env is set up.
const routeModulePromise = import('../app/webhooks/exact-online/route');

const SECRET = process.env.EXACT_WEBHOOK_SECRET as string;

/**
 * Build a valid Exact Online webhook body for a given Content object.
 * The HashCode is HMAC-SHA256 over the exact raw JSON substring of Content.
 */
function buildWebhook(content: Record<string, unknown>, secret = SECRET): string {
  const contentJson = JSON.stringify(content);
  const hashCode = crypto
    .createHmac('sha256', secret)
    .update(contentJson, 'utf8')
    .digest('hex')
    .toUpperCase();
  return `{"Content":${contentJson},"HashCode":"${hashCode}"}`;
}

const sampleContent = {
  Topic: 'Accounts',
  Action: 'Update',
  Key: 'd4d4c8b6-1a2b-4c3d-9e8f-1234567890ab',
  Division: 123456,
  ClientId: '0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d',
};

function makeRequest(body: string): Request {
  return new Request('http://localhost/webhooks/exact-online', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('verifyExactWebhook', () => {
  it('returns true for a valid HashCode', async () => {
    const { verifyExactWebhook } = await routeModulePromise;
    expect(verifyExactWebhook(buildWebhook(sampleContent), SECRET)).toBe(true);
  });

  it('returns false for a tampered Content node', async () => {
    const { verifyExactWebhook } = await routeModulePromise;
    const body = buildWebhook(sampleContent).replace('Update', 'Delete');
    expect(verifyExactWebhook(body, SECRET)).toBe(false);
  });

  it('returns false for the wrong secret', async () => {
    const { verifyExactWebhook } = await routeModulePromise;
    expect(verifyExactWebhook(buildWebhook(sampleContent), 'wrong_secret')).toBe(false);
  });

  it('returns false when HashCode is missing', async () => {
    const { verifyExactWebhook } = await routeModulePromise;
    const contentJson = JSON.stringify(sampleContent);
    expect(verifyExactWebhook(`{"Content":${contentJson}}`, SECRET)).toBe(false);
  });

  it('accepts lowercase hex HashCode (case-insensitive)', async () => {
    const { verifyExactWebhook } = await routeModulePromise;
    const contentJson = JSON.stringify(sampleContent);
    const hashCode = crypto
      .createHmac('sha256', SECRET)
      .update(contentJson, 'utf8')
      .digest('hex'); // lowercase
    const body = `{"Content":${contentJson},"HashCode":"${hashCode}"}`;
    expect(verifyExactWebhook(body, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/exact-online', () => {
  it('returns 200 for a valid signature', async () => {
    const { POST } = await routeModulePromise;
    const res = await POST(makeRequest(buildWebhook(sampleContent)) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 401 for an invalid signature', async () => {
    const { POST } = await routeModulePromise;
    const body = `{"Content":${JSON.stringify(sampleContent)},"HashCode":"DEADBEEF"}`;
    const res = await POST(makeRequest(body) as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered payload', async () => {
    const { POST } = await routeModulePromise;
    const body = buildWebhook(sampleContent).replace('Accounts', 'Items');
    const res = await POST(makeRequest(body) as never);
    expect(res.status).toBe(401);
  });

  it.each([
    'Accounts',
    'Items',
    'StockPositions',
    'FinancialTransactions',
    'GoodsDeliveries',
    'Contacts',
  ])('handles topic %s with 200', async (Topic) => {
    const { POST } = await routeModulePromise;
    const res = await POST(makeRequest(buildWebhook({ ...sampleContent, Topic })) as never);
    expect(res.status).toBe(200);
  });
});

describe('Exact callback validation (empty POST)', () => {
  it('acknowledges an empty body with 200 instead of 401', async () => {
    // Exact validates the callback URL on subscription creation by POSTing an
    // empty body. Rejecting it can leave the subscription unvalidated.
    const { POST } = await routeModulePromise;
    const res = await POST(makeRequest('') as never);
    expect(res.status).toBe(200);
  });
});

