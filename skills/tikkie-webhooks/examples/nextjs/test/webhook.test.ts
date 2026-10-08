import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  POST,
  parseNotification,
  checkSubscriptionId,
  recordPath,
} from '../app/webhooks/tikkie/route';

const PAYMENT_SUB = '6289db02-d422-4e93-b65c-30fa973bd341';
const BUNDLE_SUB = '5505d055-89e9-48b7-913d-8414d9f8d3cd';

// Verbatim examples from the Tikkie API v2.3 OpenAPI spec.
const PAYMENT = {
  subscriptionId: PAYMENT_SUB,
  notificationType: 'PAYMENT',
  paymentRequestToken: 'qzdnzr8hnVWTgXXcFRLUMc',
  paymentToken: '21ef7413-cc3c-4c80-9272-6710fada28e4',
};
const REFUND = { ...PAYMENT, notificationType: 'REFUND', refundToken: 'abcdzr8hnVWTgXXcFRLUMc' };
const BUNDLE = {
  subscriptionId: BUNDLE_SUB,
  notificationType: 'BUNDLE',
  bundleId: 'af8fa035-3275-44fc-9a9b-a38c02efa114',
};

beforeAll(() => {
  process.env.TIKKIE_SUBSCRIPTION_ID = `${PAYMENT_SUB},${BUNDLE_SUB}`;
  // Re-fetch stays off unless a test turns it on (no network in tests).
  delete process.env.TIKKIE_API_KEY;
  delete process.env.TIKKIE_APP_TOKEN;
});

function makeRequest(body: unknown | string): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/tikkie', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('parseNotification', () => {
  it.each([PAYMENT, REFUND, BUNDLE])('accepts a $notificationType notification', (n) => {
    expect(parseNotification(n)).toEqual({ ok: true, notification: n, known: true });
  });

  it('rejects a BUNDLE without bundleId', () => {
    expect(parseNotification({ subscriptionId: BUNDLE_SUB, notificationType: 'BUNDLE' }).ok).toBe(false);
  });

  it('marks unknown notificationType as known=false', () => {
    const result = parseNotification({ subscriptionId: PAYMENT_SUB, notificationType: 'NEW_THING' });
    expect(result.ok && result.known).toBe(false);
  });
});

describe('checkSubscriptionId', () => {
  it('matches a configured id', () => {
    expect(checkSubscriptionId(PAYMENT_SUB, [PAYMENT_SUB])).toBe(true);
  });
  it('rejects an unknown id', () => {
    expect(checkSubscriptionId('00000000-0000-0000-0000-000000000000', [PAYMENT_SUB])).toBe(false);
  });
  it('skips the check when nothing is configured', () => {
    expect(checkSubscriptionId('anything', [])).toBe(true);
  });
});

describe('recordPath', () => {
  it('maps REFUND to the refund GET path', () => {
    expect(recordPath(REFUND)).toBe(
      '/paymentrequests/qzdnzr8hnVWTgXXcFRLUMc/payments/21ef7413-cc3c-4c80-9272-6710fada28e4/refunds/abcdzr8hnVWTgXXcFRLUMc'
    );
  });
  it('maps BUNDLE to the transaction bundle GET path', () => {
    expect(recordPath(BUNDLE)).toBe('/transactionbundles/af8fa035-3275-44fc-9a9b-a38c02efa114');
  });
});

describe('POST /webhooks/tikkie', () => {
  it.each([PAYMENT, REFUND, BUNDLE])('returns 200 for $notificationType', async (n) => {
    const res = await POST(makeRequest(n));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 403 for an unknown subscriptionId', async () => {
    const res = await POST(makeRequest({ ...PAYMENT, subscriptionId: '00000000-0000-0000-0000-000000000000' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(makeRequest('{not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest({ subscriptionId: PAYMENT_SUB, notificationType: 'REFUND' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 and ignores an unknown notificationType', async () => {
    const res = await POST(makeRequest({ subscriptionId: PAYMENT_SUB, notificationType: 'SOMETHING_NEW' }));
    expect(res.status).toBe(200);
  });
});

describe('re-fetch from the Tikkie API (mocked fetch)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.TIKKIE_API_KEY = 'test_api_key';
    process.env.TIKKIE_APP_TOKEN = 'test_app_token';
    process.env.TIKKIE_API_BASE_URL = 'https://api-sandbox.abnamro.com/v2/tikkie';
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.TIKKIE_API_KEY;
    delete process.env.TIKKIE_APP_TOKEN;
    delete process.env.TIKKIE_API_BASE_URL;
  });

  it('fetches the payment with API-Key and X-App-Token and returns 200', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ paymentToken: PAYMENT.paymentToken, amountInCents: 1250 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const res = await POST(makeRequest(PAYMENT));
    expect(res.status).toBe(200);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api-sandbox.abnamro.com/v2/tikkie/paymentrequests/qzdnzr8hnVWTgXXcFRLUMc/payments/21ef7413-cc3c-4c80-9272-6710fada28e4'
    );
    const headers = init.headers as Record<string, string>;
    expect(headers['API-Key']).toBe('test_api_key');
    expect(headers['X-App-Token']).toBe('test_app_token');
  });

  it('returns 403 when Tikkie 404s (forged tokens)', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 404 }));
    const res = await POST(makeRequest(PAYMENT));
    expect(res.status).toBe(403);
  });

  it('returns 502 when the Tikkie API fails, so Tikkie retries', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 500 }));
    const res = await POST(makeRequest(BUNDLE));
    expect(res.status).toBe(502);
  });
});
