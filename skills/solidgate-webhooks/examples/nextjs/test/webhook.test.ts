import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

const PUBLIC_KEY = 'wh_pk_test_public_key';
const SECRET_KEY = 'wh_sk_test_secret_key';

beforeAll(() => {
  process.env.SOLIDGATE_WEBHOOK_PUBLIC_KEY = PUBLIC_KEY;
  process.env.SOLIDGATE_WEBHOOK_SECRET_KEY = SECRET_KEY;
});

/**
 * Generate a valid Solidgate signature for testing.
 * base64( hex( HMAC-SHA512(secret, pub + body + pub) ) )
 */
function generateSolidgateSignature(body: string, publicKey: string, secretKey: string): string {
  const hex = crypto
    .createHmac('sha512', secretKey)
    .update(publicKey + body + publicKey)
    .digest('hex');
  return Buffer.from(hex).toString('base64');
}

/**
 * Verify (same logic as route.ts) — duplicated so the test is self-contained.
 */
function verifySolidgateSignature(
  rawBody: string,
  signature: string,
  publicKey: string,
  secretKey: string
): boolean {
  const hex = crypto
    .createHmac('sha512', secretKey)
    .update(publicKey + rawBody + publicKey)
    .digest('hex');
  const expected = Buffer.from(hex).toString('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

describe('Solidgate signature verification', () => {
  it('validates a correct signature', () => {
    const body = JSON.stringify({ order: { order_id: 'ord_1', status: 'approved' } });
    const signature = generateSolidgateSignature(body, PUBLIC_KEY, SECRET_KEY);
    expect(verifySolidgateSignature(body, signature, PUBLIC_KEY, SECRET_KEY)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const body = JSON.stringify({ order: { order_id: 'ord_1' } });
    expect(verifySolidgateSignature(body, 'invalid', PUBLIC_KEY, SECRET_KEY)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify({ order: { order_id: 'ord_1', amount: 1000 } });
    const signature = generateSolidgateSignature(body, PUBLIC_KEY, SECRET_KEY);
    const tampered = JSON.stringify({ order: { order_id: 'ord_1', amount: 9999 } });
    expect(verifySolidgateSignature(tampered, signature, PUBLIC_KEY, SECRET_KEY)).toBe(false);
  });

  it('rejects a wrong secret key', () => {
    const body = JSON.stringify({ order: { order_id: 'ord_1' } });
    const signature = generateSolidgateSignature(body, PUBLIC_KEY, SECRET_KEY);
    expect(verifySolidgateSignature(body, signature, PUBLIC_KEY, 'wh_sk_wrong')).toBe(false);
  });

  it('signs the hex string (double-encode): base64 decodes to 128 hex chars', () => {
    const body = '{"test":true}';
    const signature = generateSolidgateSignature(body, PUBLIC_KEY, SECRET_KEY);
    expect(Buffer.from(signature, 'base64').toString('utf8')).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe('Solidgate webhook route', () => {
  it('accepts a valid signed webhook', async () => {
    const { POST } = await import('../app/webhooks/solidgate/route');
    const body = JSON.stringify({ order: { order_id: 'ord_42', status: 'approved' } });
    const signature = generateSolidgateSignature(body, PUBLIC_KEY, SECRET_KEY);

    const req = new Request('http://localhost/webhooks/solidgate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        merchant: PUBLIC_KEY,
        signature,
        'solidgate-event-type': 'card_gate.order.updated',
        'solidgate-event-id': 'evt_123',
      },
      body,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ received: true });
  });

  it('rejects an invalid signature', async () => {
    const { POST } = await import('../app/webhooks/solidgate/route');
    const body = JSON.stringify({ order: { order_id: 'ord_42' } });

    const req = new Request('http://localhost/webhooks/solidgate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        merchant: PUBLIC_KEY,
        signature: 'invalid',
        'solidgate-event-type': 'card_gate.order.updated',
      },
      body,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const { POST } = await import('../app/webhooks/solidgate/route');
    const body = JSON.stringify({ order: { order_id: 'ord_42' } });

    const req = new Request('http://localhost/webhooks/solidgate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', merchant: PUBLIC_KEY },
      body,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('rejects an unexpected merchant', async () => {
    const { POST } = await import('../app/webhooks/solidgate/route');
    const body = JSON.stringify({ order: { order_id: 'ord_42' } });
    const signature = generateSolidgateSignature(body, PUBLIC_KEY, SECRET_KEY);

    const req = new Request('http://localhost/webhooks/solidgate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        merchant: 'wh_pk_someone_else',
        signature,
        'solidgate-event-type': 'card_gate.order.updated',
      },
      body,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});
