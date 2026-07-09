import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.STATSIG_WEBHOOK_SECRET = 'test_statsig_secret';
});

/**
 * Generate a valid Statsig signature for testing
 */
function generateStatsigSignature(rawBody: string, timestamp: string, secret: string): string {
  const basestring = `v0:${timestamp}:${rawBody}`;
  return 'v0=' + crypto.createHmac('sha256', secret).update(basestring).digest('hex');
}

/**
 * Verify Statsig signature (same logic as in route.ts)
 */
function verifyStatsigWebhook(
  rawBody: string,
  timestamp: string | null,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!timestamp || !signatureHeader) return false;

  const basestring = `v0:${timestamp}:${rawBody}`;
  const expected =
    'v0=' + crypto.createHmac('sha256', secret).update(basestring).digest('hex');

  const sigBuf = Buffer.from(signatureHeader, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}

describe('Statsig Signature Verification', () => {
  const webhookSecret = 'test_statsig_secret';
  const timestamp = '1655231253265';

  it('should validate correct signature', () => {
    const payload = JSON.stringify({ data: [{ eventName: 'statsig::gate_exposure' }] });
    const signature = generateStatsigSignature(payload, timestamp, webhookSecret);

    expect(verifyStatsigWebhook(payload, timestamp, signature, webhookSecret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ data: [] });

    expect(verifyStatsigWebhook(payload, timestamp, 'v0=invalid', webhookSecret)).toBe(false);
  });

  it('should reject missing signature', () => {
    const payload = JSON.stringify({ data: [] });

    expect(verifyStatsigWebhook(payload, timestamp, null, webhookSecret)).toBe(false);
  });

  it('should reject missing timestamp', () => {
    const payload = JSON.stringify({ data: [] });
    const signature = generateStatsigSignature(payload, timestamp, webhookSecret);

    expect(verifyStatsigWebhook(payload, null, signature, webhookSecret)).toBe(false);
  });

  it('should reject tampered payload', () => {
    const original = JSON.stringify({ data: [{ eventName: 'statsig::gate_exposure' }] });
    const signature = generateStatsigSignature(original, timestamp, webhookSecret);
    const tampered = JSON.stringify({ data: [{ eventName: 'statsig::config_change' }] });

    expect(verifyStatsigWebhook(tampered, timestamp, signature, webhookSecret)).toBe(false);
  });

  it('should reject when timestamp changes (basestring binding)', () => {
    const payload = JSON.stringify({ data: [] });
    const signature = generateStatsigSignature(payload, timestamp, webhookSecret);

    expect(verifyStatsigWebhook(payload, '1655231250000', signature, webhookSecret)).toBe(false);
  });
});

describe('Statsig Signature Generation', () => {
  it('should generate valid format', () => {
    const signature = generateStatsigSignature('{"data":[]}', '1655231253265', 'secret');

    expect(signature).toMatch(/^v0=[a-f0-9]{64}$/);
  });
});
