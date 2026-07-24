import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { verifyCourierWebhook } from '../app/webhooks/courier/route';

beforeAll(() => {
  process.env.COURIER_WEBHOOK_SECRET = 'courier_test_secret';
});

const webhookSecret = 'courier_test_secret';

/**
 * Generate a valid Courier signature header for testing.
 * Signed content is `<timestamp_ms>.<rawBody>`, HMAC-SHA256 hex.
 */
function generateCourierSignature(payload: string, secret: string, timestamp = Date.now()): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},signature=${signature}`;
}

describe('verifyCourierWebhook', () => {
  it('accepts a valid signature', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: { id: 'm1' } });
    const header = generateCourierSignature(payload, webhookSecret);
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(true);
  });

  it('rejects a null header', () => {
    expect(verifyCourierWebhook('{}', null, webhookSecret)).toBe(false);
  });

  it('rejects a malformed header', () => {
    expect(verifyCourierWebhook('{}', 'not-a-signature', webhookSecret)).toBe(false);
  });

  it('rejects an invalid signature', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: {} });
    const header = `t=${Date.now()},signature=deadbeef`;
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = JSON.stringify({ type: 'message:updated', data: { id: 'm1' } });
    const header = generateCourierSignature(original, webhookSecret);
    const tampered = JSON.stringify({ type: 'message:updated', data: { id: 'HACKED' } });
    expect(verifyCourierWebhook(tampered, header, webhookSecret)).toBe(false);
  });

  it('rejects a stale timestamp', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: {} });
    const staleTs = Date.now() - 10 * 60 * 1000; // 10 minutes ago
    const header = generateCourierSignature(payload, webhookSecret, staleTs);
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(false);
  });

  it('accepts all Courier event types with a valid signature', () => {
    const eventTypes = [
      'message:updated',
      'notification:submitted',
      'notification:submission_canceled',
      'notification:published',
      'audiences:updated',
      'audiences:user:matched',
      'audiences:user:unmatched',
      'audiences:calculated',
    ];

    for (const type of eventTypes) {
      const payload = JSON.stringify({ type, data: { id: 'obj_123' } });
      const header = generateCourierSignature(payload, webhookSecret);
      expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(true);
    }
  });
});

describe('generateCourierSignature', () => {
  it('produces the documented header format', () => {
    const header = generateCourierSignature('{"test":true}', webhookSecret);
    expect(header).toMatch(/^t=\d+,signature=[a-f0-9]{64}$/);
  });
});
