import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.UBER_CLIENT_SECRET = 'test_client_secret';
});

/**
 * Generate a valid Uber signature for testing.
 * Lowercased hex HMAC-SHA256 of the raw body, keyed with the client secret.
 */
function generateUberSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Verify Uber webhook signature (same logic as in route.ts)
 */
function verifyUberWebhook(rawBody: string, signatureHeader: string | null, clientSecret: string): boolean {
  if (!signatureHeader) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', clientSecret)
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

describe('Uber Signature Verification', () => {
  const clientSecret = 'test_client_secret';

  it('should validate a correct signature', () => {
    const payload = JSON.stringify({
      event_type: 'orders.notification',
      event_id: 'evt_1',
    });
    const signature = generateUberSignature(payload, clientSecret);

    expect(verifyUberWebhook(payload, signature, clientSecret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ event_type: 'orders.notification' });

    expect(verifyUberWebhook(payload, 'deadbeef', clientSecret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = JSON.stringify({ event_type: 'orders.notification' });

    expect(verifyUberWebhook(payload, null, clientSecret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ event_type: 'orders.notification', event_id: '1' });
    const signature = generateUberSignature(original, clientSecret);
    const tampered = JSON.stringify({ event_type: 'orders.cancel', event_id: '1' });

    expect(verifyUberWebhook(tampered, signature, clientSecret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = JSON.stringify({ event_type: 'orders.notification' });
    const signature = generateUberSignature(payload, clientSecret);

    expect(verifyUberWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should reject a malformed signature header', () => {
    const payload = JSON.stringify({ event_type: 'orders.notification' });

    expect(verifyUberWebhook(payload, 'not-hex-zz', clientSecret)).toBe(false);
  });
});

describe('Uber Signature Generation', () => {
  it('should generate a lowercase hex signature', () => {
    const payload = '{"test":true}';
    const signature = generateUberSignature(payload, 'test_secret');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"event_type":"orders.notification"}';
    const secret = 'test_secret';

    expect(generateUberSignature(payload, secret)).toBe(generateUberSignature(payload, secret));
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    const sig1 = generateUberSignature('{"id":1}', secret);
    const sig2 = generateUberSignature('{"id":2}', secret);

    expect(sig1).not.toBe(sig2);
  });
});
