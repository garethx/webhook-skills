import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Set test environment variables before importing the route
process.env.RECHARGE_API_CLIENT_SECRET = 'test_client_secret';

import { POST } from '../app/webhooks/recharge/route';

// Reject deliveries whose signed timestamp is more than 48 hours from now.
const TIMESTAMP_TOLERANCE_SECONDS = 172800;

const now = () => Math.floor(Date.now() / 1000);

/**
 * Generate a valid timestamp-bound signature header for testing.
 * HMAC-SHA-256 over "<timestamp>.<payload>", keyed by the client secret,
 * delivered as `t=<epoch>,v1=<hex>`.
 */
function generateTimestampedSignature(
  payload: string,
  secret: string,
  timestamp: number
): string {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(payload)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

/**
 * Generate a valid legacy Recharge signature for testing.
 * The legacy scheme is a plain SHA-256 of (clientSecret + rawBody), hex-encoded - NOT HMAC.
 */
function generateLegacySignature(payload: string, secret: string): string {
  return crypto
    .createHash('sha256')
    .update(secret)
    .update(payload)
    .digest('hex');
}

/**
 * Build a POST request to the webhook route (NextRequest is a subclass of
 * Request, and the handler only uses the shared interface).
 */
function webhookRequest(body: string, headers: Record<string, string>) {
  return new Request('http://localhost/webhooks/recharge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

describe('Recharge Webhook Route (timestamp-bound scheme)', () => {
  const clientSecret = 'test_client_secret';

  it('should return 200 for a valid signature', async () => {
    const payload = JSON.stringify({ charge: { id: 123, status: 'success' } });
    const header = generateTimestampedSignature(payload, clientSecret, now());

    const response = await POST(
      webhookRequest(payload, { 'X-Recharge-Webhook-Signature': header }) as any
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('should return 400 for an invalid signature', async () => {
    const payload = JSON.stringify({ charge: { id: 123 } });
    const header = `t=${now()},v1=${'0'.repeat(64)}`;

    const response = await POST(
      webhookRequest(payload, { 'X-Recharge-Webhook-Signature': header }) as any
    );

    expect(response.status).toBe(400);
  });

  it('should return 400 for a malformed signature header', async () => {
    const payload = JSON.stringify({ charge: { id: 123 } });

    const response = await POST(
      webhookRequest(payload, { 'X-Recharge-Webhook-Signature': 'not-a-signature' }) as any
    );

    expect(response.status).toBe(400);
  });

  it('should return 400 for an expired timestamp (older than 48 hours)', async () => {
    const payload = JSON.stringify({ charge: { id: 123 } });
    const expired = now() - TIMESTAMP_TOLERANCE_SECONDS - 1;
    const header = generateTimestampedSignature(payload, clientSecret, expired);

    const response = await POST(
      webhookRequest(payload, { 'X-Recharge-Webhook-Signature': header }) as any
    );

    expect(response.status).toBe(400);
  });

  it('should return 200 just inside the 48-hour window', async () => {
    const payload = JSON.stringify({ charge: { id: 123 } });
    const recent = now() - 172000;
    const header = generateTimestampedSignature(payload, clientSecret, recent);

    const response = await POST(
      webhookRequest(payload, { 'X-Recharge-Webhook-Signature': header }) as any
    );

    expect(response.status).toBe(200);
  });

  it('should return 400 for a tampered payload', async () => {
    const original = JSON.stringify({ charge: { id: 123, total_price: '10.00' } });
    const header = generateTimestampedSignature(original, clientSecret, now());
    const tampered = JSON.stringify({ charge: { id: 123, total_price: '999.00' } });

    const response = await POST(
      webhookRequest(tampered, { 'X-Recharge-Webhook-Signature': header }) as any
    );

    expect(response.status).toBe(400);
  });

  it('should NOT fall back to legacy when the new header is present but invalid', async () => {
    const payload = JSON.stringify({ charge: { id: 123 } });

    const response = await POST(
      webhookRequest(payload, {
        'X-Recharge-Webhook-Signature': `t=${now()},v1=${'0'.repeat(64)}`,
        'X-Recharge-Hmac-Sha256': generateLegacySignature(payload, clientSecret),
      }) as any
    );

    expect(response.status).toBe(400);
  });
});

describe('Recharge Webhook Route (legacy scheme fallback)', () => {
  const clientSecret = 'test_client_secret';

  it('should return 200 for a valid legacy signature when the new header is absent', async () => {
    const payload = JSON.stringify({ charge: { id: 123, status: 'success' } });
    const signature = generateLegacySignature(payload, clientSecret);

    const response = await POST(
      webhookRequest(payload, { 'X-Recharge-Hmac-Sha256': signature }) as any
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('should return 400 for an invalid legacy signature', async () => {
    const payload = JSON.stringify({ charge: { id: 123 } });

    const response = await POST(
      webhookRequest(payload, { 'X-Recharge-Hmac-Sha256': 'invalid_signature' }) as any
    );

    expect(response.status).toBe(400);
  });

  it('should return 400 for a missing signature', async () => {
    const payload = JSON.stringify({ charge: { id: 123 } });

    const response = await POST(webhookRequest(payload, {}) as any);

    expect(response.status).toBe(400);
  });

  it('should return 400 for a tampered payload', async () => {
    const original = JSON.stringify({ charge: { id: 123, total_price: '10.00' } });
    const signature = generateLegacySignature(original, clientSecret);
    const tampered = JSON.stringify({ charge: { id: 123, total_price: '999.00' } });

    const response = await POST(
      webhookRequest(tampered, { 'X-Recharge-Hmac-Sha256': signature }) as any
    );

    expect(response.status).toBe(400);
  });

  it('should NOT accept an HMAC digest for the legacy header (plain hash, not HMAC)', async () => {
    const payload = JSON.stringify({ charge: { id: 123 } });
    const hmacSig = crypto
      .createHmac('sha256', clientSecret)
      .update(payload)
      .digest('hex');

    const response = await POST(
      webhookRequest(payload, { 'X-Recharge-Hmac-Sha256': hmacSig }) as any
    );

    expect(response.status).toBe(400);
  });
});

describe('Recharge Webhook Route (payload-key dispatch)', () => {
  const clientSecret = 'test_client_secret';

  it('should dispatch on the top-level payload resource key', async () => {
    const payloads = [
      { charge: { id: 456 } },
      { subscription: { id: 456 } },
      { order: { id: 456 } },
      { customer: { id: 456 } },
      { address: { id: 456 } },
    ];

    for (const body of payloads) {
      const payload = JSON.stringify(body);
      const header = generateTimestampedSignature(payload, clientSecret, now());

      const response = await POST(
        webhookRequest(payload, { 'X-Recharge-Webhook-Signature': header }) as any
      );

      expect(response.status).toBe(200);
    }
  });

  it('should still return 200 for an unrecognized resource key', async () => {
    const payload = JSON.stringify({ something_new: { id: 789 } });
    const header = generateTimestampedSignature(payload, clientSecret, now());

    const response = await POST(
      webhookRequest(payload, { 'X-Recharge-Webhook-Signature': header }) as any
    );

    expect(response.status).toBe(200);
  });
});

describe('Recharge Signature Generation', () => {
  it('should generate a t=/v1= header with a 64-character hex digest', () => {
    const header = generateTimestampedSignature('{"test":true}', 'test_secret', 1700000000);

    expect(header).toMatch(/^t=1700000000,v1=[a-f0-9]{64}$/);
  });

  it('should generate a 64-character hex legacy signature', () => {
    const signature = generateLegacySignature('{"test":true}', 'test_secret');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should prepend the secret in the legacy scheme (order matters)', () => {
    const secret = 'test_secret';
    const payload = '{"id":123}';

    const correct = generateLegacySignature(payload, secret);
    const reversed = crypto
      .createHash('sha256')
      .update(payload)
      .update(secret)
      .digest('hex');

    // secret+body and body+secret must differ
    expect(correct).not.toBe(reversed);
  });
});
