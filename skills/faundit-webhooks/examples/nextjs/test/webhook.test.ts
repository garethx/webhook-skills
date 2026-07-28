import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.FAUNDIT_WEBHOOK_SECRET = 'test_faundit_secret';
});

/**
 * Generate a valid Faundit v1 signature for testing.
 * Signs "v1:<timestamp>:<body>" with HMAC-SHA256 (hex).
 */
function generateFaunditSignature(payload: string, timestamp: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`v1:${timestamp}:${payload}`)
    .digest('hex');
}

/**
 * Verify a Faundit webhook signature (same logic as in route.ts).
 */
function verifyFaunditWebhook(
  rawBody: string,
  timestamp: string | null,
  signatureNext: string | null,
  secret: string
): boolean {
  if (!signatureNext || !timestamp) {
    return false;
  }

  const signedContent = `v1:${timestamp}:${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureNext, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

describe('Faundit Signature Verification', () => {
  const secret = 'test_faundit_secret';
  const timestamp = '1737021000';

  it('should validate a correct signature', () => {
    const payload = JSON.stringify({
      'event-type': 'item-status',
      data: { id: 1, status: 'delivered' },
    });
    const signature = generateFaunditSignature(payload, timestamp, secret);

    expect(verifyFaunditWebhook(payload, timestamp, signature, secret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ 'event-type': 'item-status' });

    expect(verifyFaunditWebhook(payload, timestamp, 'deadbeef', secret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = JSON.stringify({ 'event-type': 'item-status' });

    expect(verifyFaunditWebhook(payload, timestamp, null, secret)).toBe(false);
  });

  it('should reject a missing timestamp', () => {
    const payload = JSON.stringify({ 'event-type': 'item-status' });
    const signature = generateFaunditSignature(payload, timestamp, secret);

    expect(verifyFaunditWebhook(payload, null, signature, secret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ 'event-type': 'item-status', data: { id: 1 } });
    const signature = generateFaunditSignature(original, timestamp, secret);
    const tampered = JSON.stringify({ 'event-type': 'item-status', data: { id: 999 } });

    expect(verifyFaunditWebhook(tampered, timestamp, signature, secret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = JSON.stringify({ 'event-type': 'item-status' });
    const signature = generateFaunditSignature(payload, timestamp, secret);

    expect(verifyFaunditWebhook(payload, timestamp, signature, 'wrong_secret')).toBe(false);
  });

  it('should reject a tampered timestamp', () => {
    const payload = JSON.stringify({ 'event-type': 'item-status', data: { id: 1 } });
    const signature = generateFaunditSignature(payload, timestamp, secret);

    expect(verifyFaunditWebhook(payload, '9999999999', signature, secret)).toBe(false);
  });
});

describe('Faundit Signature Generation', () => {
  it('should generate a 64-char hex signature', () => {
    const signature = generateFaunditSignature('{"test":true}', '1737021000', 'test_secret');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = JSON.stringify({ 'event-type': 'request-status' });
    const sig1 = generateFaunditSignature(payload, '1737021000', 'test_secret');
    const sig2 = generateFaunditSignature(payload, '1737021000', 'test_secret');

    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different timestamps', () => {
    const payload = JSON.stringify({ 'event-type': 'item-status' });
    const sig1 = generateFaunditSignature(payload, '1737021000', 'test_secret');
    const sig2 = generateFaunditSignature(payload, '1737021999', 'test_secret');

    expect(sig1).not.toBe(sig2);
  });
});
