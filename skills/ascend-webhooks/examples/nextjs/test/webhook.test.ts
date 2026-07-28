import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Set the secret before importing the route (it is read at module load).
process.env.ASCEND_WEBHOOK_SECRET = 'test_ascend_secret';
const webhookSecret = process.env.ASCEND_WEBHOOK_SECRET;

const { POST } = await import('../app/webhooks/ascend/route');

/**
 * Generate a valid Ascend signature header for testing.
 * Signed string is `<timestamp>:<payload>` (colon separator, RAW body).
 */
function generateAscendSignature(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}:${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) headers['X-Ascend-Signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/ascend', {
    method: 'POST',
    headers,
    body,
  });
}

describe('Ascend Webhook Route', () => {
  it('should return 400 for missing signature', async () => {
    const response = await POST(makeRequest('{}'));
    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid signature', async () => {
    const payload = JSON.stringify({
      id: 'evt_test_123',
      type: 'invoice.paid',
      data: { id: 'inv_test_123' },
    });
    const response = await POST(makeRequest(payload, 't=123,v1=deadbeef'));
    expect(response.status).toBe(400);
  });

  it('should return 400 for tampered payload', async () => {
    const originalPayload = JSON.stringify({
      id: 'evt_test_123',
      type: 'invoice.paid',
      data: { id: 'inv_test_123' },
    });
    const signature = generateAscendSignature(originalPayload, webhookSecret);
    const tamperedPayload = JSON.stringify({
      id: 'evt_test_123',
      type: 'invoice.paid',
      data: { id: 'inv_tampered' },
    });
    const response = await POST(makeRequest(tamperedPayload, signature));
    expect(response.status).toBe(400);
  });

  it('should return 200 for valid signature', async () => {
    const payload = JSON.stringify({
      id: 'evt_test_valid',
      type: 'invoice.paid',
      data: { id: 'inv_test_valid', invoice_number: 'II2DH1HGHJ' },
    });
    const signature = generateAscendSignature(payload, webhookSecret);
    const response = await POST(makeRequest(payload, signature));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('should handle different event types', async () => {
    const eventTypes = [
      'invoice.paid',
      'invoice.voided',
      'payout.paid',
      'refund.paid',
      'unknown.event.type',
    ];

    for (const eventType of eventTypes) {
      const payload = JSON.stringify({
        id: `evt_${eventType.replace(/\./g, '_')}`,
        type: eventType,
        data: { id: 'obj_123' },
      });
      const signature = generateAscendSignature(payload, webhookSecret);
      const response = await POST(makeRequest(payload, signature));

      expect(response.status).toBe(200);
    }
  });
});

describe('Ascend Signature Generation', () => {
  it('should generate the expected format', () => {
    const signature = generateAscendSignature('{"test":true}', 'secret');
    expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
  });
});
