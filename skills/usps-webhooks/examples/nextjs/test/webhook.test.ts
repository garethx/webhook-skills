import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { POST, verifyUspsSignature } from '../app/webhooks/usps/route';

const SECRET = 'test_usps_secret_32_chars_000000';

beforeAll(() => {
  process.env.USPS_WEBHOOK_SECRET = SECRET;
});

/**
 * Build a USPS notification envelope and its X-HMAC signature.
 * USPS signs `timestamp + payload` where `payload` is the raw stringified JSON.
 */
function buildNotification(
  trackingObj: Record<string, unknown>,
  secret: string,
  subscriptionType = 'TRACKING'
) {
  const timestamp = '2026-07-23T14:32:00Z';
  const payload = JSON.stringify(trackingObj);
  const envelope = {
    subscriptionId: 'a1b2c3d4-0000-0000-0000-000000000000',
    subscriptionType,
    timestamp,
    payload,
    links: [],
  };
  const signature = crypto
    .createHmac('sha256', secret)
    .update(timestamp + payload)
    .digest('base64');
  return { body: JSON.stringify(envelope), signature };
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost/webhooks/usps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  }) as unknown as import('next/server').NextRequest;
}

describe('verifyUspsSignature', () => {
  it('validates a correct signature', () => {
    const timestamp = '2026-07-23T14:32:00Z';
    const payload = '{"trackingNumber":"940010","status":"Delivered"}';
    const sig = crypto.createHmac('sha256', SECRET).update(timestamp + payload).digest('base64');

    expect(verifyUspsSignature(timestamp, payload, sig, SECRET)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyUspsSignature('t', 'p', 'invalid_signature', SECRET)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyUspsSignature('t', 'p', null, SECRET)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const timestamp = '2026-07-23T14:32:00Z';
    const payload = '{"status":"Delivered"}';
    const sig = crypto.createHmac('sha256', SECRET).update(timestamp + payload).digest('base64');

    expect(verifyUspsSignature(timestamp, '{"status":"Alert"}', sig, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/usps', () => {
  it('returns 400 for a missing signature', async () => {
    const { body } = buildNotification({ trackingNumber: '940010', status: 'Delivered' }, SECRET);
    const response = await POST(makeRequest(body));

    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const { body } = buildNotification({ trackingNumber: '940010', status: 'Delivered' }, SECRET);
    const response = await POST(makeRequest(body, { 'X-HMAC': 'invalid_signature' }));

    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const { body, signature } = buildNotification(
      { trackingNumber: '9400100000000000000000', status: 'Delivered' },
      SECRET
    );
    const response = await POST(makeRequest(body, { 'X-HMAC': signature }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('accepts the deprecated hmac-header alias', async () => {
    const { body, signature } = buildNotification(
      { trackingNumber: '9400100000000000000000', status: 'In Transit' },
      SECRET
    );
    const response = await POST(makeRequest(body, { 'hmac-header': signature }));

    expect(response.status).toBe(200);
  });

  it('handles all tracking statuses', async () => {
    const statuses = [
      'Pre-Shipment',
      'Accepted',
      'In Transit',
      'Out for Delivery',
      'Delivered',
      'Available for Pickup',
      'Delivery Attempt',
      'Alert',
    ];

    for (const status of statuses) {
      const { body, signature } = buildNotification(
        { trackingNumber: '9400100000000000000000', status },
        SECRET
      );
      const response = await POST(makeRequest(body, { 'X-HMAC': signature }));

      expect(response.status).toBe(200);
    }
  });
});
