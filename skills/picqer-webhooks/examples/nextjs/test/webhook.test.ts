import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.PICQER_WEBHOOK_SECRET = 'test_picqer_secret';
});

/**
 * Generate a valid Picqer HMAC signature for testing.
 * Mirrors Picqer: base64(HMAC-SHA256(rawBody, secret)).
 */
function generatePicqerSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

/**
 * Verify Picqer webhook signature (same logic as in route.ts).
 */
function verifyPicqerWebhook(
  body: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

describe('Picqer Signature Verification', () => {
  const secret = 'test_picqer_secret';

  it('should validate a correct signature', () => {
    const payload = JSON.stringify({ event: 'orders.completed', data: { idorder: 1 } });
    const signature = generatePicqerSignature(payload, secret);

    expect(verifyPicqerWebhook(payload, signature, secret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ event: 'orders.completed' });

    expect(verifyPicqerWebhook(payload, 'invalid_signature', secret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ event: 'orders.completed', data: { idorder: 1 } });
    const signature = generatePicqerSignature(original, secret);
    const tampered = JSON.stringify({ event: 'orders.completed', data: { idorder: 999 } });

    expect(verifyPicqerWebhook(tampered, signature, secret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = JSON.stringify({ event: 'orders.completed' });
    const signature = generatePicqerSignature(payload, secret);

    expect(verifyPicqerWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should reject a missing signature header', () => {
    const payload = JSON.stringify({ event: 'orders.completed' });

    expect(verifyPicqerWebhook(payload, null, secret)).toBe(false);
  });

  it('should reject a missing secret', () => {
    const payload = JSON.stringify({ event: 'orders.completed' });
    const signature = generatePicqerSignature(payload, secret);

    expect(verifyPicqerWebhook(payload, signature, undefined)).toBe(false);
  });

  it('should handle an empty payload', () => {
    const payload = '';
    const signature = generatePicqerSignature(payload, secret);

    expect(verifyPicqerWebhook(payload, signature, secret)).toBe(true);
  });
});

describe('Picqer Signature Generation', () => {
  it('should generate a base64 encoded signature', () => {
    const payload = '{"event":"orders.completed"}';
    const signature = generatePicqerSignature(payload, 'test_secret');

    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"event":"orders.completed"}';
    const secret = 'test_secret';

    const sig1 = generatePicqerSignature(payload, secret);
    const sig2 = generatePicqerSignature(payload, secret);

    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    const sig1 = generatePicqerSignature('{"event":"orders.created"}', secret);
    const sig2 = generatePicqerSignature('{"event":"orders.completed"}', secret);

    expect(sig1).not.toBe(sig2);
  });
});
