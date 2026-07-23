import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Zendesk's static secret for test webhooks (before the webhook is created).
const TEST_SECRET = 'dGhpc19zZWNyZXRfaXNfZm9yX3Rlc3Rpbmdfb25seQ==';

beforeAll(() => {
  process.env.ZENDESK_WEBHOOK_SECRET = TEST_SECRET;
});

/**
 * Generate a valid Zendesk signature for testing.
 * base64(HMAC_SHA256(secret, timestamp + body)) — timestamp prepended, no separator.
 */
function generateZendeskSignature(payload: string, timestamp: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(timestamp);
  hmac.update(payload);
  return hmac.digest('base64');
}

/**
 * Verify a Zendesk webhook signature (same logic as route.ts).
 */
function verifyZendeskWebhook(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(timestamp);
  hmac.update(rawBody);
  const expected = hmac.digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

describe('Zendesk Signature Verification', () => {
  const secret = TEST_SECRET;
  const timestamp = '2026-07-22T10:00:00Z';

  it('should validate a correct signature', () => {
    const payload = JSON.stringify({ type: 'zen:event-type:ticket.created', detail: { id: '1' } });
    const signature = generateZendeskSignature(payload, timestamp, secret);

    expect(verifyZendeskWebhook(payload, signature, timestamp, secret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ type: 'zen:event-type:ticket.created' });

    expect(verifyZendeskWebhook(payload, 'invalid_signature', timestamp, secret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ id: 123, amount: 100 });
    const signature = generateZendeskSignature(original, timestamp, secret);
    const tampered = JSON.stringify({ id: 123, amount: 999 });

    expect(verifyZendeskWebhook(tampered, signature, timestamp, secret)).toBe(false);
  });

  it('should reject a changed timestamp', () => {
    const payload = JSON.stringify({ type: 'zen:event-type:ticket.created' });
    const signature = generateZendeskSignature(payload, timestamp, secret);

    expect(verifyZendeskWebhook(payload, signature, '2020-01-01T00:00:00Z', secret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = JSON.stringify({ type: 'zen:event-type:ticket.created' });
    const signature = generateZendeskSignature(payload, timestamp, secret);

    expect(verifyZendeskWebhook(payload, signature, timestamp, 'wrong_secret')).toBe(false);
  });

  it('should validate an empty body (GET/DELETE requests)', () => {
    const payload = '';
    const signature = generateZendeskSignature(payload, timestamp, secret);

    expect(verifyZendeskWebhook(payload, signature, timestamp, secret)).toBe(true);
  });
});

describe('Zendesk Signature Generation', () => {
  const timestamp = '2026-07-22T10:00:00Z';

  it('should generate a base64-encoded signature', () => {
    const signature = generateZendeskSignature('{"test":true}', timestamp, 'test_secret');

    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('should depend on the timestamp', () => {
    const payload = '{"id":123}';
    const secret = 'test_secret';

    const sig1 = generateZendeskSignature(payload, '2026-07-22T10:00:00Z', secret);
    const sig2 = generateZendeskSignature(payload, '2026-07-22T11:00:00Z', secret);

    expect(sig1).not.toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    const sig1 = generateZendeskSignature('{"id":1}', timestamp, secret);
    const sig2 = generateZendeskSignature('{"id":2}', timestamp, secret);

    expect(sig1).not.toBe(sig2);
  });
});
