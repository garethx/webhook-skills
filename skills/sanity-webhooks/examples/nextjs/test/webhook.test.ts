import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Set test environment variables before importing the route handler
beforeAll(() => {
  process.env.SANITY_WEBHOOK_SECRET = 'test_webhook_secret';
});

const webhookSecret = 'test_webhook_secret';

/**
 * Generate a valid Sanity webhook signature for testing.
 *
 * Matches @sanity/webhook: HMAC-SHA256 over `${timestamp}.${payload}` where the
 * timestamp is in MILLISECONDS, base64url-encoded with no padding, formatted as
 * `t=<timestamp>,v1=<signature>`.
 */
function generateSanitySignature(payload: string, secret: string): string {
  const timestamp = Date.now(); // milliseconds
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('base64url'); // base64url, no padding
  return `t=${timestamp},v1=${signature}`;
}

function buildRequest(payload: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) headers['sanity-webhook-signature'] = signature;
  return new NextRequest('http://localhost/webhooks/sanity', {
    method: 'POST',
    headers,
    body: payload,
  });
}

describe('Sanity Webhook Route', () => {
  it('should return 400 for missing signature', async () => {
    const { POST } = await import('../app/webhooks/sanity/route');
    const res = await POST(buildRequest('{"_type":"post","_id":"abc"}'));
    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid signature', async () => {
    const { POST } = await import('../app/webhooks/sanity/route');
    const payload = JSON.stringify({ _type: 'post', _id: 'abc' });
    const res = await POST(buildRequest(payload, 't=1609459200000,v1=invalid_signature'));
    expect(res.status).toBe(400);
  });

  it('should return 400 for tampered payload', async () => {
    const { POST } = await import('../app/webhooks/sanity/route');
    const originalPayload = JSON.stringify({ _type: 'post', _id: 'abc' });
    const signature = generateSanitySignature(originalPayload, webhookSecret);
    const tamperedPayload = JSON.stringify({ _type: 'post', _id: 'hacked' });
    const res = await POST(buildRequest(tamperedPayload, signature));
    expect(res.status).toBe(400);
  });

  it('should return 200 for valid signature', async () => {
    const { POST } = await import('../app/webhooks/sanity/route');
    const payload = JSON.stringify({ _type: 'post', _id: 'abc', _rev: 'r1' });
    const signature = generateSanitySignature(payload, webhookSecret);
    const res = await POST(buildRequest(payload, signature));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('should handle different document types', async () => {
    const { POST } = await import('../app/webhooks/sanity/route');
    const types = ['post', 'author', 'product', 'category', 'page', 'unknownType'];

    for (const type of types) {
      const payload = JSON.stringify({ _type: type, _id: `${type}_1` });
      const signature = generateSanitySignature(payload, webhookSecret);
      const res = await POST(buildRequest(payload, signature));
      expect(res.status).toBe(200);
    }
  });
});
