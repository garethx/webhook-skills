import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.FASTSPRING_WEBHOOK_SECRET = 'test_fastspring_secret';
});

/**
 * Generate a valid FastSpring X-FS-Signature for testing.
 * base64( HMAC-SHA256( raw_body, secret ) )
 */
function generateFastSpringSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

/**
 * Verify FastSpring webhook signature (same logic as in route.ts).
 */
function verifyFastSpringWebhook(
  body: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

function batch(events: unknown[]): string {
  return JSON.stringify({ events });
}

describe('FastSpring Signature Verification', () => {
  const secret = 'test_fastspring_secret';

  it('should validate correct signature', () => {
    const payload = batch([{ id: 'a', type: 'order.completed' }]);
    const signature = generateFastSpringSignature(payload, secret);

    expect(verifyFastSpringWebhook(payload, signature, secret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = batch([{ id: 'a', type: 'order.completed' }]);

    expect(verifyFastSpringWebhook(payload, 'invalid_signature', secret)).toBe(false);
  });

  it('should reject missing signature', () => {
    const payload = batch([{ id: 'a', type: 'order.completed' }]);

    expect(verifyFastSpringWebhook(payload, null, secret)).toBe(false);
  });

  it('should reject tampered payload', () => {
    const original = batch([{ id: 'a', type: 'order.completed' }]);
    const signature = generateFastSpringSignature(original, secret);
    const tampered = batch([{ id: 'a', type: 'order.failed' }]);

    expect(verifyFastSpringWebhook(tampered, signature, secret)).toBe(false);
  });

  it('should reject wrong secret', () => {
    const payload = batch([{ id: 'a', type: 'order.completed' }]);
    const signature = generateFastSpringSignature(payload, secret);

    expect(verifyFastSpringWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should validate a batch of multiple events', () => {
    const payload = batch([
      { id: 'evt_1', type: 'order.completed' },
      { id: 'evt_2', type: 'subscription.activated' },
    ]);
    const signature = generateFastSpringSignature(payload, secret);

    expect(verifyFastSpringWebhook(payload, signature, secret)).toBe(true);
  });
});

describe('FastSpring Signature Generation', () => {
  it('should generate a base64-encoded signature', () => {
    const payload = batch([{ id: 'a', type: 'order.completed' }]);
    const signature = generateFastSpringSignature(payload, 'test_secret');

    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('should generate consistent signatures', () => {
    const payload = batch([{ id: 'a', type: 'order.completed' }]);
    const secret = 'test_secret';

    const sig1 = generateFastSpringSignature(payload, secret);
    const sig2 = generateFastSpringSignature(payload, secret);

    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    const sig1 = generateFastSpringSignature(batch([{ id: '1' }]), secret);
    const sig2 = generateFastSpringSignature(batch([{ id: '2' }]), secret);

    expect(sig1).not.toBe(sig2);
  });
});
