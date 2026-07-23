import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.STATSIG_WEBHOOK_SECRET = 'test_statsig_signing_secret';
});

const SIGNING_SECRET = 'test_statsig_signing_secret';

/**
 * Generate a valid Statsig signature for testing.
 * Matches Statsig's algorithm: HMAC-SHA256("v0:{ts}:{body}", secret) hex-encoded.
 */
function generateStatsigSignature(body: string, timestamp: string, secret: string): string {
  const basestring = `v0:${timestamp}:${body}`;
  const hex = crypto.createHmac('sha256', secret).update(basestring, 'utf8').digest('hex');
  return `v0=${hex}`;
}

// Statsig timestamps are in MILLISECONDS
function currentTimestamp(): string {
  return Date.now().toString();
}

/**
 * Verify Statsig webhook signature (same logic as in route.ts).
 */
function verifyStatsigRequest(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  signingSecret: string
): boolean {
  if (!signatureHeader || !timestampHeader || !signingSecret) return false;

  const timestamp = parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;

  const basestring = `v0:${timestampHeader}:${rawBody}`;
  const expected =
    'v0=' +
    crypto.createHmac('sha256', signingSecret).update(basestring, 'utf8').digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

describe('Statsig signature verification', () => {
  it('validates a correct signature', () => {
    const body = JSON.stringify({ data: [] });
    const ts = currentTimestamp();
    const sig = generateStatsigSignature(body, ts, SIGNING_SECRET);

    expect(verifyStatsigRequest(body, sig, ts, SIGNING_SECRET)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const body = JSON.stringify({ data: [] });
    const ts = currentTimestamp();

    expect(verifyStatsigRequest(body, 'v0=deadbeef', ts, SIGNING_SECRET)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyStatsigRequest('{}', null, currentTimestamp(), SIGNING_SECRET)).toBe(false);
  });

  it('rejects a missing timestamp header', () => {
    const body = '{}';
    const sig = generateStatsigSignature(body, currentTimestamp(), SIGNING_SECRET);
    expect(verifyStatsigRequest(body, sig, null, SIGNING_SECRET)).toBe(false);
  });

  it('rejects timestamps older than 5 minutes (replay protection)', () => {
    const body = '{}';
    const stale = (Date.now() - 6 * 60 * 1000).toString();
    const sig = generateStatsigSignature(body, stale, SIGNING_SECRET);

    expect(verifyStatsigRequest(body, sig, stale, SIGNING_SECRET)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = JSON.stringify({ data: [{ metadata: { action: 'created' } }] });
    const tampered = JSON.stringify({ data: [{ metadata: { action: 'updated' } }] });
    const ts = currentTimestamp();
    const sig = generateStatsigSignature(original, ts, SIGNING_SECRET);

    expect(verifyStatsigRequest(tampered, sig, ts, SIGNING_SECRET)).toBe(false);
  });

  it('rejects a wrong signing secret', () => {
    const body = '{}';
    const ts = currentTimestamp();
    const sig = generateStatsigSignature(body, ts, SIGNING_SECRET);

    expect(verifyStatsigRequest(body, sig, ts, 'wrong_secret')).toBe(false);
  });

  it('rejects a non-numeric timestamp', () => {
    const body = '{}';
    const sig = generateStatsigSignature(body, '1671672194836', SIGNING_SECRET);
    expect(verifyStatsigRequest(body, sig, 'not-a-number', SIGNING_SECRET)).toBe(false);
  });
});

describe('Statsig signature generation', () => {
  it('produces a v0= prefixed hex signature', () => {
    const sig = generateStatsigSignature('{"test":true}', '1671672194836', 'test_secret');
    expect(sig).toMatch(/^v0=[a-f0-9]{64}$/);
  });

  it('produces a consistent signature for the same input', () => {
    const body = '{"action":"updated"}';
    const ts = '1671672194836';
    expect(generateStatsigSignature(body, ts, 'test_secret')).toBe(
      generateStatsigSignature(body, ts, 'test_secret')
    );
  });

  it('produces different signatures for different bodies', () => {
    const ts = '1671672194836';
    expect(generateStatsigSignature('{"id":1}', ts, 'test_secret')).not.toBe(
      generateStatsigSignature('{"id":2}', ts, 'test_secret')
    );
  });

  it('produces different signatures for different timestamps', () => {
    const body = '{"id":1}';
    expect(generateStatsigSignature(body, '1', 'test_secret')).not.toBe(
      generateStatsigSignature(body, '2', 'test_secret')
    );
  });
});
