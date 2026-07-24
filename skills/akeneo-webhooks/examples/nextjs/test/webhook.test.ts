import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.AKENEO_WEBHOOK_SECRET = 'test_akeneo_secret';
});

const webhookSecret = 'test_akeneo_secret';

/**
 * Generate a valid Akeneo signature for testing.
 * Signs `timestamp + "." + payload` with HMAC-SHA256 (hex).
 */
function generateAkeneoSignature(payload: string, secret: string, timestamp: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(payload)
    .digest('hex');
}

/**
 * Verify an Akeneo webhook signature (same logic as route.ts).
 */
function verifyAkeneoWebhook(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string
): boolean {
  if (!signature || !timestamp) {
    return false;
  }

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > 300) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

function now(): string {
  return Math.floor(Date.now() / 1000).toString();
}

function samplePayload(action = 'product.updated'): string {
  return JSON.stringify({
    events: [
      {
        action,
        event_id: 'evt_test_123',
        event_datetime: '2024-06-01T12:34:56+00:00',
        author: 'julia',
        author_type: 'ui',
        pim_source: 'https://demo.akeneo.com',
        data: { resource: { identifier: 'top-sku-001', code: 'model-001' } }
      }
    ]
  });
}

describe('Akeneo Signature Verification', () => {
  it('validates a correct signature', () => {
    const ts = now();
    const payload = samplePayload();
    const sig = generateAkeneoSignature(payload, webhookSecret, ts);

    expect(verifyAkeneoWebhook(payload, sig, ts, webhookSecret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const ts = now();
    expect(verifyAkeneoWebhook(samplePayload(), 'deadbeef', ts, webhookSecret)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyAkeneoWebhook(samplePayload(), null, now(), webhookSecret)).toBe(false);
  });

  it('rejects a missing timestamp', () => {
    const payload = samplePayload();
    const sig = generateAkeneoSignature(payload, webhookSecret, now());
    expect(verifyAkeneoWebhook(payload, sig, null, webhookSecret)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const ts = now();
    const sig = generateAkeneoSignature(samplePayload('product.created'), webhookSecret, ts);
    expect(verifyAkeneoWebhook(samplePayload('product.removed'), sig, ts, webhookSecret)).toBe(false);
  });

  it('rejects a stale timestamp (replay)', () => {
    const staleTs = (Math.floor(Date.now() / 1000) - 3600).toString();
    const payload = samplePayload();
    const sig = generateAkeneoSignature(payload, webhookSecret, staleTs);
    expect(verifyAkeneoWebhook(payload, sig, staleTs, webhookSecret)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const ts = now();
    const payload = samplePayload();
    const sig = generateAkeneoSignature(payload, webhookSecret, ts);
    expect(verifyAkeneoWebhook(payload, sig, ts, 'wrong_secret')).toBe(false);
  });

  it('handles a malformed signature header', () => {
    const ts = now();
    expect(verifyAkeneoWebhook(samplePayload(), 'not-hex-!!', ts, webhookSecret)).toBe(false);
  });
});

describe('Akeneo Signature Generation', () => {
  it('generates a 64-char hex signature', () => {
    const sig = generateAkeneoSignature(samplePayload(), webhookSecret, now());
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates different signatures for different payloads', () => {
    const ts = now();
    const a = generateAkeneoSignature(samplePayload('product.created'), webhookSecret, ts);
    const b = generateAkeneoSignature(samplePayload('product.removed'), webhookSecret, ts);
    expect(a).not.toBe(b);
  });
});
