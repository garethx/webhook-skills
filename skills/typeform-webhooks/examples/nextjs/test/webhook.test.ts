import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.TYPEFORM_WEBHOOK_SECRET = 'test_typeform_secret';
});

/**
 * Generate a valid Typeform signature for testing.
 * Format: "sha256=" + base64(HMAC-SHA256(rawBody, secret))
 */
function generateTypeformSignature(payload: string, secret: string): string {
  const hash = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64');
  return `sha256=${hash}`;
}

/**
 * Verify Typeform webhook signature (same logic as in route.ts).
 */
function verifyTypeformSignature(
  body: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;
  const hash = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
  const expected = `sha256=${hash}`;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

describe('Typeform Signature Verification', () => {
  const secret = 'test_typeform_secret';

  it('should validate a correct signature', () => {
    const payload = JSON.stringify({ event_type: 'form_response' });
    const signature = generateTypeformSignature(payload, secret);

    expect(verifyTypeformSignature(payload, signature, secret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ event_type: 'form_response' });

    expect(verifyTypeformSignature(payload, 'sha256=invalid', secret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = JSON.stringify({ event_type: 'form_response' });

    expect(verifyTypeformSignature(payload, null, secret)).toBe(false);
  });

  it('should reject a signature without the sha256= prefix', () => {
    const payload = JSON.stringify({ event_type: 'form_response' });
    const bare = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64');

    expect(verifyTypeformSignature(payload, bare, secret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ email: 'jane@example.com' });
    const signature = generateTypeformSignature(original, secret);
    const tampered = JSON.stringify({ email: 'evil@example.com' });

    expect(verifyTypeformSignature(tampered, signature, secret)).toBe(false);
  });

  it('should reject a wrong secret', () => {
    const payload = JSON.stringify({ event_type: 'form_response' });
    const signature = generateTypeformSignature(payload, secret);

    expect(verifyTypeformSignature(payload, signature, 'wrong_secret')).toBe(false);
  });
});

describe('Typeform Signature Generation', () => {
  it('should generate a sha256= prefixed base64 signature', () => {
    const signature = generateTypeformSignature('{"test":true}', 'test_secret');

    expect(signature).toMatch(/^sha256=[A-Za-z0-9+/]+=*$/);
  });

  it('should generate consistent signatures', () => {
    const payload = JSON.stringify({ event_id: '123' });
    const secret = 'test_secret';

    expect(generateTypeformSignature(payload, secret)).toBe(
      generateTypeformSignature(payload, secret)
    );
  });
});
