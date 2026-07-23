import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.CUSTOMERIO_WEBHOOK_SIGNING_KEY = 'test_signing_key';
});

/**
 * Generate a valid Customer.io signature for testing.
 * Signed string: "v0:<timestamp>:<raw body>", HMAC-SHA256, hex.
 */
function generateCustomerIoSignature(payload: string, timestamp: string, signingKey: string): string {
  return crypto
    .createHmac('sha256', signingKey)
    .update(`v0:${timestamp}:${payload}`)
    .digest('hex');
}

/**
 * Verify a Customer.io webhook signature (same logic as in route.ts).
 */
function verifyCustomerIoWebhook(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  signingKey: string
): boolean {
  if (!timestamp || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', signingKey)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

describe('Customer.io Signature Verification', () => {
  const signingKey = 'test_signing_key';
  const timestamp = '1613063089';

  it('should validate a correct signature', () => {
    const payload = JSON.stringify({ object_type: 'email', metric: 'opened' });
    const signature = generateCustomerIoSignature(payload, timestamp, signingKey);

    expect(verifyCustomerIoWebhook(payload, timestamp, signature, signingKey)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ object_type: 'email', metric: 'opened' });

    expect(verifyCustomerIoWebhook(payload, timestamp, 'deadbeef', signingKey)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = JSON.stringify({ object_type: 'email', metric: 'opened' });

    expect(verifyCustomerIoWebhook(payload, timestamp, null, signingKey)).toBe(false);
  });

  it('should reject a missing timestamp', () => {
    const payload = JSON.stringify({ object_type: 'email', metric: 'opened' });
    const signature = generateCustomerIoSignature(payload, timestamp, signingKey);

    expect(verifyCustomerIoWebhook(payload, null, signature, signingKey)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ object_type: 'email', metric: 'delivered' });
    const signature = generateCustomerIoSignature(original, timestamp, signingKey);
    const tampered = JSON.stringify({ object_type: 'email', metric: 'bounced' });

    expect(verifyCustomerIoWebhook(tampered, timestamp, signature, signingKey)).toBe(false);
  });

  it('should reject a tampered timestamp', () => {
    const payload = JSON.stringify({ object_type: 'email', metric: 'delivered' });
    const signature = generateCustomerIoSignature(payload, timestamp, signingKey);

    expect(verifyCustomerIoWebhook(payload, '9999999999', signature, signingKey)).toBe(false);
  });

  it('should reject the wrong signing key', () => {
    const payload = JSON.stringify({ object_type: 'email', metric: 'opened' });
    const signature = generateCustomerIoSignature(payload, timestamp, signingKey);

    expect(verifyCustomerIoWebhook(payload, timestamp, signature, 'wrong_key')).toBe(false);
  });

  it('should handle a malformed signature header', () => {
    const payload = JSON.stringify({ object_type: 'email', metric: 'opened' });

    expect(verifyCustomerIoWebhook(payload, timestamp, 'not_hex_!!', signingKey)).toBe(false);
  });
});

describe('Customer.io Signature Generation', () => {
  it('should generate a 64-char hex signature', () => {
    const signature = generateCustomerIoSignature('{"test":true}', '1613063089', 'test_secret');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = JSON.stringify({ object_type: 'email', metric: 'opened' });

    const sig1 = generateCustomerIoSignature(payload, '1613063089', 'test_secret');
    const sig2 = generateCustomerIoSignature(payload, '1613063089', 'test_secret');

    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different timestamps', () => {
    const payload = JSON.stringify({ object_type: 'email', metric: 'opened' });

    const sig1 = generateCustomerIoSignature(payload, '1613063089', 'test_secret');
    const sig2 = generateCustomerIoSignature(payload, '1613063090', 'test_secret');

    expect(sig1).not.toBe(sig2);
  });
});
