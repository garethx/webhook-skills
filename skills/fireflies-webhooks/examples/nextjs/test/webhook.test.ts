import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.FIREFLIES_WEBHOOK_SECRET = 'test_fireflies_secret_1234';
});

/**
 * Generate a valid Fireflies signature for testing.
 * HMAC-SHA256 over the raw body, hex-encoded, no prefix.
 */
function generateFirefliesSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Verify Fireflies webhook signature (same logic as in route.ts).
 */
function verifyFirefliesWebhook(body: string, signatureHeader: string | null, secret: string): boolean {
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

describe('Fireflies Signature Verification', () => {
  const webhookSecret = 'test_fireflies_secret_1234';

  it('should validate correct signature', () => {
    const payload = JSON.stringify({
      meetingId: '01HXXXXXXXXXXXXXXXXXXXXXXX',
      eventType: 'Transcription completed'
    });
    const signature = generateFirefliesSignature(payload, webhookSecret);

    expect(verifyFirefliesWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ meetingId: 'abc' });

    expect(verifyFirefliesWebhook(payload, 'deadbeef', webhookSecret)).toBe(false);
  });

  it('should reject missing signature', () => {
    const payload = JSON.stringify({ meetingId: 'abc' });

    expect(verifyFirefliesWebhook(payload, null, webhookSecret)).toBe(false);
  });

  it('should reject tampered payload', () => {
    const originalPayload = JSON.stringify({ meetingId: 'abc' });
    const signature = generateFirefliesSignature(originalPayload, webhookSecret);
    const tamperedPayload = JSON.stringify({ meetingId: 'xyz' });

    expect(verifyFirefliesWebhook(tamperedPayload, signature, webhookSecret)).toBe(false);
  });

  it('should reject wrong secret', () => {
    const payload = JSON.stringify({ meetingId: 'abc' });
    const signature = generateFirefliesSignature(payload, webhookSecret);

    expect(verifyFirefliesWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should reject a signature with a sha256= prefix (Fireflies sends none)', () => {
    const payload = JSON.stringify({ meetingId: 'abc' });
    const signature = generateFirefliesSignature(payload, webhookSecret);

    expect(verifyFirefliesWebhook(payload, `sha256=${signature}`, webhookSecret)).toBe(false);
  });
});

describe('Fireflies Signature Generation', () => {
  it('should generate a bare hex signature (no prefix)', () => {
    const payload = '{"test":true}';
    const signature = generateFirefliesSignature(payload, 'test_secret');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"meetingId":"abc"}';
    const secret = 'test_secret';

    const sig1 = generateFirefliesSignature(payload, secret);
    const sig2 = generateFirefliesSignature(payload, secret);

    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    const sig1 = generateFirefliesSignature('{"meetingId":"a"}', secret);
    const sig2 = generateFirefliesSignature('{"meetingId":"b"}', secret);

    expect(sig1).not.toBe(sig2);
  });
});
