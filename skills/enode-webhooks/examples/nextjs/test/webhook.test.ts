import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.ENODE_WEBHOOK_SECRET = 'test_enode_secret';
});

/**
 * Generate a valid Enode signature for testing (HMAC-SHA1, hex, sha1= prefix)
 */
function generateEnodeSignature(payload: string, secret: string): string {
  const signature = crypto
    .createHmac('sha1', secret)
    .update(payload)
    .digest('hex');
  return `sha1=${signature}`;
}

/**
 * Verify Enode webhook signature (same logic as in route.ts)
 */
function verifyEnodeWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha1' || !sig) {
    return false;
  }

  const expected = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

describe('Enode Signature Verification', () => {
  const webhookSecret = 'test_enode_secret';

  it('should validate correct signature', () => {
    const payload = JSON.stringify([
      { event: 'user:vehicle:updated', vehicle: { id: 'v1' } }
    ]);
    const signature = generateEnodeSignature(payload, webhookSecret);

    expect(verifyEnodeWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify([{ event: 'user:vehicle:updated' }]);

    expect(verifyEnodeWebhook(payload, 'sha1=invalid', webhookSecret)).toBe(false);
  });

  it('should reject missing signature', () => {
    const payload = JSON.stringify([{ event: 'user:vehicle:updated' }]);

    expect(verifyEnodeWebhook(payload, null, webhookSecret)).toBe(false);
  });

  it('should reject a sha256-prefixed signature', () => {
    const payload = JSON.stringify([{ event: 'user:vehicle:updated' }]);
    const wrong = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    expect(verifyEnodeWebhook(payload, wrong, webhookSecret)).toBe(false);
  });

  it('should reject tampered payload', () => {
    const original = JSON.stringify([{ event: 'user:vehicle:updated', vehicle: { id: '1' } }]);
    const signature = generateEnodeSignature(original, webhookSecret);
    const tampered = JSON.stringify([{ event: 'user:vehicle:updated', vehicle: { id: '999' } }]);

    expect(verifyEnodeWebhook(tampered, signature, webhookSecret)).toBe(false);
  });

  it('should reject wrong secret', () => {
    const payload = JSON.stringify([{ event: 'user:vehicle:updated' }]);
    const signature = generateEnodeSignature(payload, webhookSecret);

    expect(verifyEnodeWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should handle malformed signature header', () => {
    const payload = JSON.stringify([{ event: 'user:vehicle:updated' }]);

    expect(verifyEnodeWebhook(payload, 'not_a_valid_format', webhookSecret)).toBe(false);
  });
});

describe('Enode Signature Generation', () => {
  it('should generate a sha1 prefixed signature', () => {
    const payload = '[{"event":"enode:webhook:test"}]';
    const signature = generateEnodeSignature(payload, 'test_secret');

    expect(signature).toMatch(/^sha1=[a-f0-9]{40}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '[{"event":"user:vehicle:updated"}]';
    const secret = 'test_secret';

    const sig1 = generateEnodeSignature(payload, secret);
    const sig2 = generateEnodeSignature(payload, secret);

    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    const sig1 = generateEnodeSignature('[{"id":1}]', secret);
    const sig2 = generateEnodeSignature('[{"id":2}]', secret);

    expect(sig1).not.toBe(sig2);
  });
});
