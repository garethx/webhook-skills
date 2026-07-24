import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/pylon/route';

const WEBHOOK_SECRET = 'test_pylon_secret';
const TIMESTAMP = '1624235417';

beforeAll(() => {
  process.env.PYLON_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

/**
 * Generate a valid Pylon signature for testing.
 * Signs `timestamp + "." + payload` with HMAC-SHA256, hex, "hs256=" prefix.
 */
function generatePylonSignature(payload: string, timestamp: string, secret: string): string {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(payload)
    .digest('hex');
  return `hs256=${digest}`;
}

function makeRequest(body: string, headers: Record<string, string>) {
  return new Request('http://localhost/webhooks/pylon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  }) as unknown as import('next/server').NextRequest;
}

describe('Pylon Webhook Route', () => {
  it('should return 200 for a valid issue.created event', async () => {
    const payload = JSON.stringify({
      event_type: 'issue.created',
      data: { id: 'issue_1', title: 'Login is broken' },
    });
    const signature = generatePylonSignature(payload, TIMESTAMP, WEBHOOK_SECRET);

    const res = await POST(
      makeRequest(payload, {
        'Pylon-Webhook-Signature': signature,
        'Pylon-Webhook-Timestamp': TIMESTAMP,
        'Pylon-Webhook-Version': '2021-07',
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('should return 400 for a missing signature', async () => {
    const payload = JSON.stringify({ event_type: 'issue.created' });

    const res = await POST(
      makeRequest(payload, { 'Pylon-Webhook-Timestamp': TIMESTAMP })
    );

    expect(res.status).toBe(400);
  });

  it('should return 400 for an invalid signature', async () => {
    const payload = JSON.stringify({ event_type: 'issue.created' });

    const res = await POST(
      makeRequest(payload, {
        'Pylon-Webhook-Signature': 'hs256=deadbeef',
        'Pylon-Webhook-Timestamp': TIMESTAMP,
      })
    );

    expect(res.status).toBe(400);
  });

  it('should return 400 when the payload is tampered', async () => {
    const original = JSON.stringify({ event_type: 'issue.created', data: { id: '1' } });
    const signature = generatePylonSignature(original, TIMESTAMP, WEBHOOK_SECRET);
    const tampered = JSON.stringify({ event_type: 'issue.created', data: { id: '999' } });

    const res = await POST(
      makeRequest(tampered, {
        'Pylon-Webhook-Signature': signature,
        'Pylon-Webhook-Timestamp': TIMESTAMP,
      })
    );

    expect(res.status).toBe(400);
  });

  it('should return 400 when the timestamp is tampered', async () => {
    const payload = JSON.stringify({ event_type: 'issue.created' });
    const signature = generatePylonSignature(payload, TIMESTAMP, WEBHOOK_SECRET);

    const res = await POST(
      makeRequest(payload, {
        'Pylon-Webhook-Signature': signature,
        'Pylon-Webhook-Timestamp': '9999999999',
      })
    );

    expect(res.status).toBe(400);
  });
});
