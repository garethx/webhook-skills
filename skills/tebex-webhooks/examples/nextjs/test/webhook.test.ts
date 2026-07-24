import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const WEBHOOK_SECRET = 'test_webhook_secret';

beforeAll(() => {
  process.env.TEBEX_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

// Import after env is set
import { POST } from '../app/webhooks/tebex/route';

/**
 * Generate a valid Tebex signature for testing.
 *
 * Matches the provider's two-step algorithm:
 *   HMAC-SHA256(secret, SHA256(body))
 */
function generateTebexSignature(payload: string, secret: string): string {
  const bodyHash = crypto.createHash('sha256').update(payload).digest('hex');
  return crypto.createHmac('sha256', secret).update(bodyHash).digest('hex');
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature !== undefined) headers['X-Signature'] = signature;
  return new NextRequest('http://localhost/webhooks/tebex', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /webhooks/tebex', () => {
  it('returns 400 for missing signature', async () => {
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid signature', async () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'payment.completed', subject: {} });
    const res = await POST(makeRequest(payload, 'deadbeef'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const original = JSON.stringify({ id: 'evt_1', type: 'payment.completed', subject: { id: 'a' } });
    const signature = generateTebexSignature(original, WEBHOOK_SECRET);
    const tampered = JSON.stringify({ id: 'evt_1', type: 'payment.completed', subject: { id: 'b' } });
    const res = await POST(makeRequest(tampered, signature));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({ id: 'evt_valid', type: 'payment.completed', subject: {} });
    const signature = generateTebexSignature(payload, WEBHOOK_SECRET);
    const res = await POST(makeRequest(payload, signature));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('echoes the id back for validation.webhook', async () => {
    const payload = JSON.stringify({ id: 'wh_validation_123', type: 'validation.webhook', subject: {} });
    const signature = generateTebexSignature(payload, WEBHOOK_SECRET);
    const res = await POST(makeRequest(payload, signature));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'wh_validation_123' });
  });

  it('handles different event types', async () => {
    const eventTypes = [
      'payment.completed',
      'payment.declined',
      'payment.refunded',
      'payment.dispute.opened',
      'payment.dispute.won',
      'payment.dispute.lost',
      'payment.dispute.closed',
      'recurring-payment.started',
      'recurring-payment.renewed',
      'recurring-payment.ended',
      'recurring-payment.cancellation.requested',
      'recurring-payment.cancellation.aborted',
      'unknown.event.type',
    ];

    for (const type of eventTypes) {
      const payload = JSON.stringify({ id: `evt_${type}`, type, subject: {} });
      const signature = generateTebexSignature(payload, WEBHOOK_SECRET);
      const res = await POST(makeRequest(payload, signature));
      expect(res.status).toBe(200);
    }
  });
});
