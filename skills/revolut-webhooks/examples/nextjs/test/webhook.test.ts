import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, verifyRevolutSignature } from '../app/webhooks/revolut/route';

const SECRET = 'wsk_test_secret';

beforeAll(() => {
  process.env.REVOLUT_SIGNING_SECRET = SECRET;
});

/**
 * Generate a valid Revolut signature header for testing.
 * Signed payload is `v1.{timestamp}.{raw body}`, HMAC-SHA256, hex.
 */
function generateRevolutSignature(
  payload: string,
  secret: string,
  timestamp: string = String(Date.now())
): { signature: string; timestamp: string } {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`v1.${timestamp}.${payload}`)
    .digest('hex');
  return { signature: `v1=${signature}`, timestamp };
}

function makeRequest(payload: string, signature: string | null, timestamp: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['revolut-signature'] = signature;
  if (timestamp) headers['revolut-request-timestamp'] = timestamp;
  return new NextRequest('http://localhost/webhooks/revolut', {
    method: 'POST',
    headers,
    body: payload,
  });
}

describe('verifyRevolutSignature', () => {
  it('accepts a valid signature', () => {
    const payload = JSON.stringify({ event: 'ORDER_COMPLETED', order_id: 'ord_1' });
    const { signature, timestamp } = generateRevolutSignature(payload, SECRET);
    expect(verifyRevolutSignature(payload, timestamp, signature, SECRET)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const payload = JSON.stringify({ event: 'ORDER_COMPLETED' });
    expect(verifyRevolutSignature(payload, String(Date.now()), 'v1=bad', SECRET)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = JSON.stringify({ event: 'ORDER_COMPLETED', order_id: 'ord_1' });
    const { signature, timestamp } = generateRevolutSignature(original, SECRET);
    const tampered = JSON.stringify({ event: 'ORDER_COMPLETED', order_id: 'ord_x' });
    expect(verifyRevolutSignature(tampered, timestamp, signature, SECRET)).toBe(false);
  });

  it('rejects a stale timestamp', () => {
    const payload = JSON.stringify({ event: 'ORDER_COMPLETED' });
    const staleTs = String(Date.now() - 10 * 60 * 1000);
    const { signature } = generateRevolutSignature(payload, SECRET, staleTs);
    expect(verifyRevolutSignature(payload, staleTs, signature, SECRET)).toBe(false);
  });

  it('accepts any of multiple comma-separated signatures (rotation)', () => {
    const payload = JSON.stringify({ event: 'ORDER_AUTHORISED' });
    const { signature, timestamp } = generateRevolutSignature(payload, SECRET);
    expect(verifyRevolutSignature(payload, timestamp, `v1=deadbeef,${signature}`, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/revolut', () => {
  it('returns 400 for missing signature headers', async () => {
    const res = await POST(makeRequest('{}', null, null));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = JSON.stringify({ event: 'ORDER_COMPLETED', order_id: 'ord_1' });
    const res = await POST(makeRequest(payload, 'v1=invalid', String(Date.now())));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({
      event: 'ORDER_COMPLETED',
      order_id: 'ord_valid',
      merchant_order_ext_ref: 'Order #1',
    });
    const { signature, timestamp } = generateRevolutSignature(payload, SECRET);
    const res = await POST(makeRequest(payload, signature, timestamp));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles different event types', async () => {
    const eventTypes = [
      'ORDER_COMPLETED',
      'ORDER_AUTHORISED',
      'ORDER_CANCELLED',
      'ORDER_PAYMENT_AUTHENTICATED',
      'ORDER_PAYMENT_DECLINED',
      'ORDER_PAYMENT_FAILED',
      'UNKNOWN_EVENT',
    ];

    for (const eventType of eventTypes) {
      const payload = JSON.stringify({ event: eventType, order_id: 'ord_1' });
      const { signature, timestamp } = generateRevolutSignature(payload, SECRET);
      const res = await POST(makeRequest(payload, signature, timestamp));
      expect(res.status).toBe(200);
    }
  });
});
