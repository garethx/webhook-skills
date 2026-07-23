import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.ASANA_WEBHOOK_SECRET = 'test_asana_secret';
});

/**
 * Generate a valid Asana signature for testing:
 * hex HMAC-SHA256 of the raw body keyed with the secret.
 */
function generateAsanaSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify an Asana webhook signature (same logic as in route.ts).
 */
function verifyAsanaSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

describe('Asana Signature Verification', () => {
  const secret = 'test_asana_secret';

  it('should validate a correct signature', () => {
    const payload = JSON.stringify({ events: [{ action: 'changed' }] });
    const signature = generateAsanaSignature(payload, secret);

    expect(verifyAsanaSignature(payload, signature, secret)).toBe(true);
  });

  it('should validate an empty heartbeat body', () => {
    const payload = '{"events":[]}';
    const signature = generateAsanaSignature(payload, secret);

    expect(verifyAsanaSignature(payload, signature, secret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ events: [] });

    expect(verifyAsanaSignature(payload, 'deadbeef', secret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = JSON.stringify({ events: [] });

    expect(verifyAsanaSignature(payload, null, secret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ events: [{ action: 'added' }] });
    const signature = generateAsanaSignature(original, secret);
    const tampered = JSON.stringify({ events: [{ action: 'deleted' }] });

    expect(verifyAsanaSignature(tampered, signature, secret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = JSON.stringify({ events: [] });
    const signature = generateAsanaSignature(payload, secret);

    expect(verifyAsanaSignature(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should handle a malformed signature header safely', () => {
    const payload = JSON.stringify({ events: [] });

    expect(verifyAsanaSignature(payload, 'not-hex-zzz', secret)).toBe(false);
  });
});

describe('Asana Signature Generation', () => {
  it('should generate a hex signature', () => {
    const signature = generateAsanaSignature('{"events":[]}', 'test_secret');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"events":[]}';
    const secret = 'test_secret';

    expect(generateAsanaSignature(payload, secret)).toBe(
      generateAsanaSignature(payload, secret)
    );
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    expect(generateAsanaSignature('{"events":[{"action":"added"}]}', secret)).not.toBe(
      generateAsanaSignature('{"events":[{"action":"deleted"}]}', secret)
    );
  });
});
