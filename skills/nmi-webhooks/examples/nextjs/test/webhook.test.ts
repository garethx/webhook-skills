import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

process.env.NMI_SIGNING_KEY = 'test_nmi_signing_key';

// Import after env is set up.
const routeModulePromise = import('../app/webhooks/nmi/route');

const SIGNING_KEY = process.env.NMI_SIGNING_KEY as string;

/**
 * Build a valid NMI Webhook-Signature header for a raw body.
 * signature = HMAC-SHA256(signing_key, "<nonce>.<raw_body>"), hex. `t` is a
 * nonce (any random-ish string), NOT a timestamp.
 */
function signBody(rawBody: string, nonce = 'f3c1e9a2b7d84c15', signingKey = SIGNING_KEY): string {
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(`${nonce}.${rawBody}`)
    .digest('hex');
  return `t=${nonce},s=${signature}`;
}

const sampleEvent = {
  event_id: 'b7f1c0d2-3e4a-4b5c-8d6e-7f8091a2b3c4',
  event_type: 'transaction.sale.success',
  event_body: {
    merchant: { merchant_id: '900000', gateway_id: '12345' },
    transaction: {
      transaction_id: '9876543210',
      transaction_type: 'sale',
      condition: 'complete',
      amount: '49.99',
      order_id: 'ORDER-1001',
    },
  },
};

const sampleBody = JSON.stringify(sampleEvent);

function makeRequest(body: string, header?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (header !== undefined) {
    headers['Webhook-Signature'] = header;
  }
  return new Request('http://localhost/webhooks/nmi', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyNmiWebhook', () => {
  it('returns true for a valid signature', async () => {
    const { verifyNmiWebhook } = await routeModulePromise;
    expect(verifyNmiWebhook(sampleBody, signBody(sampleBody), SIGNING_KEY)).toBe(true);
  });

  it('returns false for a tampered body', async () => {
    const { verifyNmiWebhook } = await routeModulePromise;
    const header = signBody(sampleBody);
    const tampered = sampleBody.replace('49.99', '9999.99');
    expect(verifyNmiWebhook(tampered, header, SIGNING_KEY)).toBe(false);
  });

  it('returns false for the wrong signing key', async () => {
    const { verifyNmiWebhook } = await routeModulePromise;
    expect(verifyNmiWebhook(sampleBody, signBody(sampleBody), 'wrong_key')).toBe(false);
  });

  it('returns false when the nonce is altered', async () => {
    const { verifyNmiWebhook } = await routeModulePromise;
    const header = signBody(sampleBody, 'aaaa1111');
    const swapped = header.replace('t=aaaa1111', 't=bbbb2222');
    expect(verifyNmiWebhook(sampleBody, swapped, SIGNING_KEY)).toBe(false);
  });

  it('returns false when the header is missing t or s', async () => {
    const { verifyNmiWebhook } = await routeModulePromise;
    expect(verifyNmiWebhook(sampleBody, 's=abc123', SIGNING_KEY)).toBe(false);
    expect(verifyNmiWebhook(sampleBody, 't=nonce', SIGNING_KEY)).toBe(false);
    expect(verifyNmiWebhook(sampleBody, null, SIGNING_KEY)).toBe(false);
  });
});

describe('POST /webhooks/nmi', () => {
  it('returns 200 for a valid signature', async () => {
    const { POST } = await routeModulePromise;
    const res = await POST(makeRequest(sampleBody, signBody(sampleBody)) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 400 when the signature header is missing', async () => {
    const { POST } = await routeModulePromise;
    const res = await POST(makeRequest(sampleBody) as never);
    expect(res.status).toBe(400);
  });

  it('returns 401 for an invalid signature', async () => {
    const { POST } = await routeModulePromise;
    const res = await POST(makeRequest(sampleBody, 't=f3c1e9a2b7d84c15,s=deadbeef') as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered payload', async () => {
    const { POST } = await routeModulePromise;
    const header = signBody(sampleBody);
    const tampered = sampleBody.replace('transaction.sale.success', 'transaction.refund.success');
    const res = await POST(makeRequest(tampered, header) as never);
    expect(res.status).toBe(401);
  });

  it.each([
    'sale',
    'auth',
    'capture',
    'void',
    'refund',
    'credit',
    'validate',
  ])('handles transaction.%s.success with 200', async (action) => {
    const { POST } = await routeModulePromise;
    const body = JSON.stringify({ ...sampleEvent, event_type: `transaction.${action}.success` });
    const res = await POST(makeRequest(body, signBody(body)) as never);
    expect(res.status).toBe(200);
  });
});
