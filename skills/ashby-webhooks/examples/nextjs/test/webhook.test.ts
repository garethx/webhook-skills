import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.ASHBY_WEBHOOK_SECRET = 'test_ashby_secret';
});

/**
 * Generate a valid Ashby signature for testing (HMAC-SHA256 hex, "sha256=" prefix)
 */
function generateAshbySignature(payload: string, secret: string): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

/**
 * Verify Ashby webhook signature (same logic as in route.ts)
 */
function verifyAshbyWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha256' || !sig) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

describe('Ashby Signature Verification', () => {
  const webhookSecret = 'test_ashby_secret';

  it('should validate correct signature', () => {
    const payload = JSON.stringify({
      action: 'applicationSubmit',
      data: { application: { id: 'app_123' } }
    });
    const signature = generateAshbySignature(payload, webhookSecret);

    expect(verifyAshbyWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ action: 'ping', data: {} });

    expect(verifyAshbyWebhook(payload, 'sha256=invalid', webhookSecret)).toBe(false);
  });

  it('should reject missing signature', () => {
    const payload = JSON.stringify({ action: 'ping', data: {} });

    expect(verifyAshbyWebhook(payload, null, webhookSecret)).toBe(false);
  });

  it('should reject tampered payload', () => {
    const original = JSON.stringify({ action: 'candidateHire', data: { id: 1 } });
    const signature = generateAshbySignature(original, webhookSecret);
    const tampered = JSON.stringify({ action: 'candidateHire', data: { id: 999 } });

    expect(verifyAshbyWebhook(tampered, signature, webhookSecret)).toBe(false);
  });

  it('should reject wrong secret', () => {
    const payload = JSON.stringify({ action: 'ping', data: {} });
    const signature = generateAshbySignature(payload, webhookSecret);

    expect(verifyAshbyWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should handle malformed signature header', () => {
    const payload = JSON.stringify({ action: 'ping', data: {} });

    expect(verifyAshbyWebhook(payload, 'not_a_valid_format', webhookSecret)).toBe(false);
  });
});

describe('Ashby Signature Generation', () => {
  it('should generate sha256 prefixed signature', () => {
    const payload = '{"action":"ping","data":{}}';
    const signature = generateAshbySignature(payload, 'test_secret');

    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"action":"ping","data":{}}';
    const secret = 'test_secret';

    const sig1 = generateAshbySignature(payload, secret);
    const sig2 = generateAshbySignature(payload, secret);

    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    const sig1 = generateAshbySignature('{"action":"jobCreate"}', secret);
    const sig2 = generateAshbySignature('{"action":"jobUpdate"}', secret);

    expect(sig1).not.toBe(sig2);
  });
});
