import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.CLIO_WEBHOOK_SECRET = 'test_clio_shared_secret';
});

/**
 * Generate a valid Clio signature for testing.
 * Clio: hex-encoded HMAC-SHA256 of the raw body, keyed with the shared secret.
 */
function generateClioSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify Clio webhook signature (same logic as route.ts).
 */
function verifyClioWebhook(
  body: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

describe('Clio Signature Verification', () => {
  const webhookSecret = 'test_clio_shared_secret';

  it('should validate a correct signature', () => {
    const payload = JSON.stringify({
      data: { id: 152 },
      meta: { event: 'created', webhook_id: 1234 },
    });
    const signature = generateClioSignature(payload, webhookSecret);

    expect(verifyClioWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ meta: { event: 'created' } });

    expect(verifyClioWebhook(payload, 'deadbeef', webhookSecret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = JSON.stringify({ meta: { event: 'created' } });

    expect(verifyClioWebhook(payload, null, webhookSecret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const originalPayload = JSON.stringify({ data: { id: 1 } });
    const signature = generateClioSignature(originalPayload, webhookSecret);
    const tamperedPayload = JSON.stringify({ data: { id: 999 } });

    expect(verifyClioWebhook(tamperedPayload, signature, webhookSecret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = JSON.stringify({ meta: { event: 'created' } });
    const signature = generateClioSignature(payload, webhookSecret);

    expect(verifyClioWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should handle a malformed (non-hex) signature header', () => {
    const payload = JSON.stringify({ meta: { event: 'created' } });

    expect(verifyClioWebhook(payload, 'not_hex_!!', webhookSecret)).toBe(false);
  });
});

describe('Clio Signature Generation', () => {
  it('should generate a 64-char lowercase hex digest (no prefix)', () => {
    const signature = generateClioSignature('{"test":true}', 'test_secret');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"meta":{"event":"created"}}';
    const secret = 'test_secret';

    expect(generateClioSignature(payload, secret)).toBe(
      generateClioSignature(payload, secret)
    );
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    expect(generateClioSignature('{"id":1}', secret)).not.toBe(
      generateClioSignature('{"id":2}', secret)
    );
  });
});
