import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.NUVEMSHOP_CLIENT_SECRET = 'test_client_secret';
});

/**
 * Generate a valid Nuvemshop HMAC-SHA256 (hex) signature for testing.
 */
function generateNuvemshopSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Verify Nuvemshop webhook signature (same logic as in route.ts).
 */
function verifyNuvemshopWebhook(body: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmacHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

describe('Nuvemshop Signature Verification', () => {
  const clientSecret = 'test_client_secret';

  it('should validate correct signature', () => {
    const payload = JSON.stringify({ store_id: 123, event: 'order/created', id: 999 });
    const signature = generateNuvemshopSignature(payload, clientSecret);

    expect(verifyNuvemshopWebhook(payload, signature, clientSecret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ store_id: 123 });

    expect(verifyNuvemshopWebhook(payload, 'deadbeef', clientSecret)).toBe(false);
  });

  it('should reject missing signature', () => {
    const payload = JSON.stringify({ store_id: 123 });

    expect(verifyNuvemshopWebhook(payload, null, clientSecret)).toBe(false);
  });

  it('should reject tampered payload', () => {
    const original = JSON.stringify({ store_id: 123, event: 'order/paid', id: 1 });
    const signature = generateNuvemshopSignature(original, clientSecret);
    const tampered = JSON.stringify({ store_id: 123, event: 'order/paid', id: 2 });

    expect(verifyNuvemshopWebhook(tampered, signature, clientSecret)).toBe(false);
  });

  it('should reject wrong secret', () => {
    const payload = JSON.stringify({ store_id: 123 });
    const signature = generateNuvemshopSignature(payload, clientSecret);

    expect(verifyNuvemshopWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should handle empty payload', () => {
    const payload = '';
    const signature = generateNuvemshopSignature(payload, clientSecret);

    expect(verifyNuvemshopWebhook(payload, signature, clientSecret)).toBe(true);
  });
});

describe('Nuvemshop Signature Generation', () => {
  it('should generate a hex-encoded signature', () => {
    const payload = '{"test":true}';
    const signature = generateNuvemshopSignature(payload, 'test_secret');

    // Hex characters only, 64 chars for SHA-256
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"store_id":123}';
    const secret = 'test_secret';

    expect(generateNuvemshopSignature(payload, secret))
      .toBe(generateNuvemshopSignature(payload, secret));
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    expect(generateNuvemshopSignature('{"id":1}', secret))
      .not.toBe(generateNuvemshopSignature('{"id":2}', secret));
  });
});
