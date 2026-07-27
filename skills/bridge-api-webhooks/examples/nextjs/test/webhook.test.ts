import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { verifyBridgeWebhook, POST } from '../app/webhooks/bridge-api/route';

beforeAll(() => {
  process.env.BRIDGE_WEBHOOK_SECRET = 'test_bridge_secret';
});

const webhookSecret = 'test_bridge_secret';

/**
 * Generate a valid Bridge API signature header for testing.
 * Bridge sends UPPERCASE hex, prefixed with the `v1=` scheme.
 */
function generateBridgeSignature(payload: string, secret: string): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
    .toUpperCase();
  return `v1=${signature}`;
}

/** Build a request the POST handler can read (.text() + .headers.get()). */
function buildRequest(payload: string, signature: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== null) {
    headers['bridgeapi-signature'] = signature;
  }
  return new Request('http://localhost/webhooks/bridge-api', {
    method: 'POST',
    headers,
    body: payload,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

describe('Bridge API Signature Verification', () => {
  it('should validate a correct signature', () => {
    const payload = JSON.stringify({ type: 'item.refreshed', content: { item_id: 1 } });
    const signature = generateBridgeSignature(payload, webhookSecret);

    expect(verifyBridgeWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('should accept multiple v1 signatures (secret rotation)', () => {
    const payload = JSON.stringify({ type: 'item.refreshed' });
    const validSig = generateBridgeSignature(payload, webhookSecret);
    const header = `v1=DEADBEEF,${validSig}`;

    expect(verifyBridgeWebhook(payload, header, webhookSecret)).toBe(true);
  });

  it('should ignore non-v1 schemes (no downgrade)', () => {
    const payload = JSON.stringify({ type: 'item.refreshed' });
    const hex = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    expect(verifyBridgeWebhook(payload, `v0=${hex.toUpperCase()}`, webhookSecret)).toBe(false);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ type: 'item.refreshed' });

    expect(verifyBridgeWebhook(payload, 'v1=INVALID', webhookSecret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = JSON.stringify({ type: 'item.refreshed' });

    expect(verifyBridgeWebhook(payload, null, webhookSecret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ type: 'item.refreshed', content: { item_id: 1 } });
    const signature = generateBridgeSignature(original, webhookSecret);
    const tampered = JSON.stringify({ type: 'item.refreshed', content: { item_id: 999 } });

    expect(verifyBridgeWebhook(tampered, signature, webhookSecret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = JSON.stringify({ type: 'item.refreshed' });
    const signature = generateBridgeSignature(payload, webhookSecret);

    expect(verifyBridgeWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });
});

describe('POST /webhooks/bridge-api', () => {
  it('should return 401 for a missing signature', async () => {
    const response = await POST(buildRequest('{"type":"item.refreshed"}', null));

    expect(response.status).toBe(401);
  });

  it('should return 401 for an invalid signature', async () => {
    const response = await POST(buildRequest('{"type":"item.refreshed"}', 'v1=INVALID'));

    expect(response.status).toBe(401);
  });

  it('should return 200 for a valid signature', async () => {
    const payload = JSON.stringify({
      type: 'item.refreshed',
      timestamp: 1699999999,
      content: { item_id: 12345, status: 0 },
    });
    const signature = generateBridgeSignature(payload, webhookSecret);

    const response = await POST(buildRequest(payload, signature));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true });
  });

  it('should handle the TEST_EVENT event', async () => {
    const payload = JSON.stringify({
      type: 'TEST_EVENT',
      timestamp: 1699999999,
      content: { item_id: 0, status: 0, user_uuid: 'test-uuid' },
    });
    const signature = generateBridgeSignature(payload, webhookSecret);

    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
  });
});
