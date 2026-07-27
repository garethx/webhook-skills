import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.BUNNY_STREAM_WEBHOOK_SECRET = 'test_read_only_api_key';
});

/**
 * Generate a valid Bunny Stream signature for testing.
 * HMAC-SHA256 over the raw body, keyed on the Read-Only API key, lowercase hex.
 */
function generateBunnySignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify a Bunny Stream webhook signature (same logic as in route.ts).
 */
function verifyBunnyStream(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
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

describe('Bunny Stream Signature Verification', () => {
  const webhookSecret = 'test_read_only_api_key';

  it('should validate a correct signature', () => {
    const payload = JSON.stringify({
      VideoLibraryId: 12345,
      VideoGuid: '0a1b2c3d-4e5f-6789-abcd-ef0123456789',
      Status: 3,
    });
    const signature = generateBunnySignature(payload, webhookSecret);

    expect(verifyBunnyStream(payload, signature, webhookSecret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ Status: 3 });

    expect(verifyBunnyStream(payload, 'deadbeef', webhookSecret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = JSON.stringify({ Status: 3 });

    expect(verifyBunnyStream(payload, null, webhookSecret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ VideoGuid: 'abc', Status: 3 });
    const signature = generateBunnySignature(original, webhookSecret);
    const tampered = JSON.stringify({ VideoGuid: 'abc', Status: 5 });

    expect(verifyBunnyStream(tampered, signature, webhookSecret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = JSON.stringify({ Status: 3 });
    const signature = generateBunnySignature(payload, webhookSecret);

    expect(verifyBunnyStream(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should reject a non-hex signature header', () => {
    const payload = JSON.stringify({ Status: 3 });

    expect(verifyBunnyStream(payload, 'not-hex!!', webhookSecret)).toBe(false);
  });
});

describe('Bunny Stream Signature Generation', () => {
  it('should generate a 64-character lowercase hex digest', () => {
    const signature = generateBunnySignature('{"Status":3}', 'test_secret');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"VideoGuid":"abc","Status":3}';
    const secret = 'test_secret';

    expect(generateBunnySignature(payload, secret)).toBe(
      generateBunnySignature(payload, secret)
    );
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    expect(generateBunnySignature('{"Status":3}', secret)).not.toBe(
      generateBunnySignature('{"Status":5}', secret)
    );
  });
});
