import { describe, test, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Generate a real Ed25519 key pair and expose the public key (base64url `x`)
// via the env var the route reads. Set it before importing the route.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PUBLIC_KEY_B64URL = (publicKey.export({ format: 'jwk' }) as { x: string }).x;
process.env.TOKEN_WEBHOOK_PUBLIC_KEY = PUBLIC_KEY_B64URL;

let POST: typeof import('../app/webhooks/tokenio/route').POST;
let verifyTokenWebhook: typeof import('../app/webhooks/tokenio/route').verifyTokenWebhook;

beforeAll(async () => {
  const mod = await import('../app/webhooks/tokenio/route');
  POST = mod.POST;
  verifyTokenWebhook = mod.verifyTokenWebhook;
});

/** Sign a raw body exactly as Token.io would: Ed25519 over the raw bytes, base64url. */
function sign(rawBody: string, key = privateKey): string {
  return crypto.sign(null, Buffer.from(rawBody, 'utf8'), key).toString('base64url');
}

const samplePayment = {
  payment: {
    id: 'a4hV9mQ2Zx7',
    memberId: 'm:3xamp1e:5tuv',
    status: 'INITIATION_COMPLETED',
    bankPaymentStatus: 'ACSC',
    bankPaymentId: 'bank-ref-0001',
    createdDateTime: '2026-07-27T10:00:00Z',
    updatedDateTime: '2026-07-27T10:01:12Z',
  },
};

function makeRequest(
  rawBody: string,
  { signature, event }: { signature?: string | null; event?: string } = {}
): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature !== null) {
    headers.set('token-signature', signature ?? sign(rawBody));
  }
  if (event) {
    headers.set('token-event', event);
  }
  return new Request('http://localhost/webhooks/tokenio', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

describe('verifyTokenWebhook', () => {
  test('returns true for a valid Ed25519 signature', () => {
    const body = JSON.stringify(samplePayment);
    expect(verifyTokenWebhook(body, sign(body), PUBLIC_KEY_B64URL)).toBe(true);
  });

  test('returns false for a tampered body', () => {
    const body = JSON.stringify(samplePayment);
    const signature = sign(body);
    const tampered = body.replace('INITIATION_COMPLETED', 'INITIATION_REJECTED');
    expect(verifyTokenWebhook(tampered, signature, PUBLIC_KEY_B64URL)).toBe(false);
  });

  test('returns false for a signature from a different key', () => {
    const { privateKey: otherKey } = crypto.generateKeyPairSync('ed25519');
    const body = JSON.stringify(samplePayment);
    expect(verifyTokenWebhook(body, sign(body, otherKey), PUBLIC_KEY_B64URL)).toBe(false);
  });

  test('returns false when the signature header is missing', () => {
    const body = JSON.stringify(samplePayment);
    expect(verifyTokenWebhook(body, null, PUBLIC_KEY_B64URL)).toBe(false);
  });

  test('returns false when the public key is missing', () => {
    const body = JSON.stringify(samplePayment);
    expect(verifyTokenWebhook(body, sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/tokenio', () => {
  test('returns 200 for a valid signature', async () => {
    const body = JSON.stringify(samplePayment);
    const res = await POST(
      makeRequest(body, { event: 'PAYMENT_STATUS_CHANGED' }) as never
    );
    expect(res.status).toBe(200);
  });

  test('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify(samplePayment);
    const res = await POST(
      makeRequest(body, {
        signature: sign(JSON.stringify({ payment: { id: 'other' } })),
        event: 'PAYMENT_STATUS_CHANGED',
      }) as never
    );
    expect(res.status).toBe(400);
  });

  test('returns 400 when the signature header is missing', async () => {
    const body = JSON.stringify(samplePayment);
    const res = await POST(
      makeRequest(body, { signature: null, event: 'PAYMENT_STATUS_CHANGED' }) as never
    );
    expect(res.status).toBe(400);
  });

  test('handles each common event with 200', async () => {
    const events = [
      'PAYMENT_STATUS_CHANGED',
      'TRANSFER_STATUS_CHANGED',
      'REFUND_STATUS_CHANGED',
      'VRP_STATUS_CHANGED',
      'VRP_CONSENT_STATUS_CHANGED',
      'VIRTUAL_ACCOUNT_CREDIT_RECEIVED',
      'PAYOUT_STATUS_CHANGED',
    ];
    const body = JSON.stringify(samplePayment);
    for (const event of events) {
      const res = await POST(makeRequest(body, { event }) as never);
      expect(res.status).toBe(200);
    }
  });
});
