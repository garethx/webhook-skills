import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.ATTENTIVE_WEBHOOK_SECRET = 'test_attentive_signing_key';
});

/**
 * Generate a valid Attentive signature for testing:
 * HMAC-SHA256 over the raw body, hex-encoded.
 */
function generateAttentiveSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Verify Attentive webhook signature (same logic as in route.ts).
 */
function verifyAttentiveWebhook(body: string, signatureHeader: string | null, secret: string): boolean {
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

describe('Attentive Signature Verification', () => {
  const webhookSecret = 'test_attentive_signing_key';

  it('should validate a correct signature', () => {
    const payload = JSON.stringify({
      type: 'sms.subscribed',
      subscriber: { phone: '+15555550123' }
    });
    const signature = generateAttentiveSignature(payload, webhookSecret);

    expect(verifyAttentiveWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ type: 'sms.subscribed' });

    expect(verifyAttentiveWebhook(payload, 'deadbeef', webhookSecret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = JSON.stringify({ type: 'sms.subscribed' });

    expect(verifyAttentiveWebhook(payload, null, webhookSecret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ type: 'sms.subscribed', id: 1 });
    const signature = generateAttentiveSignature(original, webhookSecret);
    const tampered = JSON.stringify({ type: 'sms.subscribed', id: 999 });

    expect(verifyAttentiveWebhook(tampered, signature, webhookSecret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = JSON.stringify({ type: 'sms.subscribed' });
    const signature = generateAttentiveSignature(payload, webhookSecret);

    expect(verifyAttentiveWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should reject a non-hex signature header', () => {
    const payload = JSON.stringify({ type: 'sms.subscribed' });

    expect(verifyAttentiveWebhook(payload, 'not-a-valid-hex-string', webhookSecret)).toBe(false);
  });
});

describe('Attentive Signature Generation', () => {
  it('should generate a 64-char hex signature', () => {
    const payload = '{"type":"sms.subscribed"}';
    const signature = generateAttentiveSignature(payload, 'test_secret');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"type":"email.opened"}';
    const secret = 'test_secret';

    const sig1 = generateAttentiveSignature(payload, secret);
    const sig2 = generateAttentiveSignature(payload, secret);

    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    const sig1 = generateAttentiveSignature('{"id":1}', secret);
    const sig2 = generateAttentiveSignature('{"id":2}', secret);

    expect(sig1).not.toBe(sig2);
  });
});
