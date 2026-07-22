import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.RECHARGE_API_CLIENT_SECRET = 'test_client_secret';
});

/**
 * Generate a valid Recharge signature for testing.
 * Recharge uses a plain SHA-256 of (clientSecret + rawBody), hex-encoded - NOT HMAC.
 */
function generateRechargeSignature(payload: string, secret: string): string {
  return crypto
    .createHash('sha256')
    .update(secret)
    .update(payload)
    .digest('hex');
}

/**
 * Verify a Recharge webhook signature (same logic as in route.ts).
 */
function verifyRechargeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  clientSecret: string
): boolean {
  if (!signatureHeader) return false;

  const digest = crypto
    .createHash('sha256')
    .update(clientSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signatureHeader)
    );
  } catch {
    return false;
  }
}

describe('Recharge Signature Verification', () => {
  const clientSecret = 'test_client_secret';

  it('should validate a correct signature', () => {
    const payload = JSON.stringify({ charge: { id: 123, status: 'success' } });
    const signature = generateRechargeSignature(payload, clientSecret);

    expect(verifyRechargeWebhook(payload, signature, clientSecret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ charge: { id: 123 } });

    expect(verifyRechargeWebhook(payload, 'invalid_signature', clientSecret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = JSON.stringify({ charge: { id: 123 } });

    expect(verifyRechargeWebhook(payload, null, clientSecret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ charge: { id: 123, total_price: '10.00' } });
    const signature = generateRechargeSignature(original, clientSecret);
    const tampered = JSON.stringify({ charge: { id: 123, total_price: '999.00' } });

    expect(verifyRechargeWebhook(tampered, signature, clientSecret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = JSON.stringify({ charge: { id: 123 } });
    const signature = generateRechargeSignature(payload, clientSecret);

    expect(verifyRechargeWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should NOT match an HMAC signature (Recharge is a plain hash)', () => {
    const payload = JSON.stringify({ charge: { id: 123 } });
    const hmacSig = crypto
      .createHmac('sha256', clientSecret)
      .update(payload)
      .digest('hex');

    expect(verifyRechargeWebhook(payload, hmacSig, clientSecret)).toBe(false);
  });

  it('should handle an empty payload', () => {
    const payload = '';
    const signature = generateRechargeSignature(payload, clientSecret);

    expect(verifyRechargeWebhook(payload, signature, clientSecret)).toBe(true);
  });
});

describe('Recharge Signature Generation', () => {
  it('should generate a 64-character hex signature', () => {
    const payload = '{"test":true}';
    const signature = generateRechargeSignature(payload, 'test_secret');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should prepend the secret (order matters)', () => {
    const secret = 'test_secret';
    const payload = '{"id":123}';

    const correct = generateRechargeSignature(payload, secret);
    const reversed = crypto
      .createHash('sha256')
      .update(payload)
      .update(secret)
      .digest('hex');

    // secret+body and body+secret must differ
    expect(correct).not.toBe(reversed);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    const sig1 = generateRechargeSignature('{"id":1}', secret);
    const sig2 = generateRechargeSignature('{"id":2}', secret);

    expect(sig1).not.toBe(sig2);
  });
});
