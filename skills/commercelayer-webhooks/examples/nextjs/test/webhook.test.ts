import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, verifyCommerceLayerSignature } from '../app/webhooks/commercelayer/route';

const secret = 'test_shared_secret';

beforeAll(() => {
  process.env.COMMERCELAYER_SHARED_SECRET = secret;
});

/** Generate a valid Commerce Layer signature (base64 HMAC-SHA256 of the raw body). */
function generateSignature(payload: string, sharedSecret: string): string {
  return crypto.createHmac('sha256', sharedSecret).update(payload).digest('base64');
}

/** A minimal JSON:API order payload, as Commerce Layer would send it. */
function orderPayload(id = 'yzkWXfWDnu'): string {
  return JSON.stringify({
    data: { id, type: 'orders', attributes: { number: 1234, status: 'placed' } },
  });
}

function buildRequest(body: string, signature: string | null, topic: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== null) headers['x-commercelayer-signature'] = signature;
  headers['x-commercelayer-topic'] = topic;
  return new NextRequest('http://localhost:3000/webhooks/commercelayer', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyCommerceLayerSignature', () => {
  it('validates a correct signature', () => {
    const payload = orderPayload();
    const signature = generateSignature(payload, secret);
    expect(verifyCommerceLayerSignature(payload, signature, secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyCommerceLayerSignature(orderPayload(), 'invalid', secret)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyCommerceLayerSignature(orderPayload(), null, secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const signature = generateSignature(orderPayload('yzkWXfWDnu'), secret);
    expect(verifyCommerceLayerSignature(orderPayload('TAMPERED123'), signature, secret)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const signature = generateSignature(orderPayload(), secret);
    expect(verifyCommerceLayerSignature(orderPayload(), signature, 'wrong_secret')).toBe(false);
  });
});

describe('POST /webhooks/commercelayer', () => {
  it('returns 400 when the signature is missing', async () => {
    const res = await POST(buildRequest(orderPayload(), null, 'orders.place'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(buildRequest(orderPayload(), 'invalid', 'orders.place'));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = orderPayload();
    const res = await POST(buildRequest(payload, generateSignature(payload, secret), 'orders.place'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles the full set of dispatched topics', async () => {
    const topics = [
      'orders.place',
      'orders.approve',
      'orders.cancel',
      'orders.pay',
      'orders.refund',
      'customers.create',
      'shipments.ship',
      'shipments.deliver',
    ];

    for (const topic of topics) {
      const payload = orderPayload('abc123');
      const res = await POST(buildRequest(payload, generateSignature(payload, secret), topic));
      expect(res.status).toBe(200);
    }
  });
});
