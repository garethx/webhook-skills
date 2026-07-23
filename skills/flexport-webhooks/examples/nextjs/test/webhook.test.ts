import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.FLEXPORT_WEBHOOK_SECRET = 'test_flexport_secret';
});

/**
 * Generate a valid Flexport signature for testing.
 * Mirrors Flexport: HMAC-SHA256 over the raw body, hex, prefixed "sha256=".
 */
function generateFlexportSignature(payload: string, secret: string): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

/**
 * Verify Flexport webhook signature (same logic as in route.ts).
 */
function verifyFlexportWebhook(body: string, signatureHeader: string | null, secret: string): boolean {
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha256' || !sig) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
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

describe('Flexport Signature Verification', () => {
  const webhookSecret = 'test_flexport_secret';

  it('should validate a correct signature', () => {
    const payload = JSON.stringify({
      type: '/shipment#created',
      id: 123,
      data: { resource: { id: 42 } }
    });
    const signature = generateFlexportSignature(payload, webhookSecret);

    expect(verifyFlexportWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ type: '/shipment#created' });

    expect(verifyFlexportWebhook(payload, 'sha256=deadbeef', webhookSecret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = JSON.stringify({ type: '/shipment#created' });

    expect(verifyFlexportWebhook(payload, null, webhookSecret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ type: '/shipment#created', id: 1 });
    const signature = generateFlexportSignature(original, webhookSecret);
    const tampered = JSON.stringify({ type: '/shipment#created', id: 999 });

    expect(verifyFlexportWebhook(tampered, signature, webhookSecret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = JSON.stringify({ type: '/shipment#created' });
    const signature = generateFlexportSignature(payload, webhookSecret);

    expect(verifyFlexportWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should reject a header without the sha256 prefix', () => {
    const payload = JSON.stringify({ type: '/shipment#created' });
    const bare = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    expect(verifyFlexportWebhook(payload, bare, webhookSecret)).toBe(false);
  });
});

describe('Flexport Signature Generation', () => {
  it('should generate a sha256-prefixed hex signature', () => {
    const payload = '{"type":"/shipment#created"}';
    const signature = generateFlexportSignature(payload, 'test_secret');

    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"type":"/shipment_leg#departed"}';
    const secret = 'test_secret';

    expect(generateFlexportSignature(payload, secret)).toBe(
      generateFlexportSignature(payload, secret)
    );
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    expect(generateFlexportSignature('{"id":1}', secret)).not.toBe(
      generateFlexportSignature('{"id":2}', secret)
    );
  });
});
