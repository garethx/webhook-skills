import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.ALCHEMY_SIGNING_KEY = 'whsec_test_signing_key';
});

/**
 * Generate a valid Alchemy signature for testing.
 * Mirrors Alchemy: HMAC-SHA256 of the raw body, hex-encoded, no prefix.
 */
function generateAlchemySignature(payload: string, signingKey: string): string {
  return crypto.createHmac('sha256', signingKey).update(payload, 'utf8').digest('hex');
}

/**
 * Verify Alchemy webhook signature (same logic as in route.ts).
 */
function verifyAlchemySignature(
  rawBody: string,
  signature: string | null,
  signingKey: string
): boolean {
  if (!signature) {
    return false;
  }

  const digest = crypto
    .createHmac('sha256', signingKey)
    .update(rawBody, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
}

const signingKey = 'whsec_test_signing_key';

describe('Alchemy Signature Verification', () => {
  it('validates a correct signature', () => {
    const payload = JSON.stringify({
      type: 'ADDRESS_ACTIVITY',
      event: { network: 'ETH_MAINNET', activity: [] },
    });
    const signature = generateAlchemySignature(payload, signingKey);

    expect(verifyAlchemySignature(payload, signature, signingKey)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const payload = JSON.stringify({ type: 'ADDRESS_ACTIVITY' });

    expect(verifyAlchemySignature(payload, 'deadbeef', signingKey)).toBe(false);
  });

  it('rejects a missing signature', () => {
    const payload = JSON.stringify({ type: 'ADDRESS_ACTIVITY' });

    expect(verifyAlchemySignature(payload, null, signingKey)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = JSON.stringify({ type: 'ADDRESS_ACTIVITY', value: 1 });
    const signature = generateAlchemySignature(original, signingKey);
    const tampered = JSON.stringify({ type: 'ADDRESS_ACTIVITY', value: 999 });

    expect(verifyAlchemySignature(tampered, signature, signingKey)).toBe(false);
  });

  it('rejects the wrong signing key', () => {
    const payload = JSON.stringify({ type: 'ADDRESS_ACTIVITY' });
    const signature = generateAlchemySignature(payload, signingKey);

    expect(verifyAlchemySignature(payload, signature, 'wrong_key')).toBe(false);
  });

  it('does not strip a sha256= prefix (Alchemy sends a bare hex digest)', () => {
    const payload = JSON.stringify({ type: 'MINED_TRANSACTION' });
    const bareHex = generateAlchemySignature(payload, signingKey);

    // A prefixed value must NOT verify - Alchemy uses no prefix
    expect(verifyAlchemySignature(payload, `sha256=${bareHex}`, signingKey)).toBe(false);
    expect(verifyAlchemySignature(payload, bareHex, signingKey)).toBe(true);
  });
});

describe('Alchemy Signature Generation', () => {
  it('generates a 64-char hex digest with no prefix', () => {
    const signature = generateAlchemySignature('{"type":"NFT_ACTIVITY"}', 'test_key');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates consistent signatures', () => {
    const payload = '{"type":"ADDRESS_ACTIVITY"}';

    const sig1 = generateAlchemySignature(payload, 'test_key');
    const sig2 = generateAlchemySignature(payload, 'test_key');

    expect(sig1).toBe(sig2);
  });
});
