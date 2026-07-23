import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { POST } from '../app/webhooks/polar/route';

const webhookSecret = 'polar_whs_test_secret';

// A complete, schema-valid `order.paid` payload (matches @polar-sh/sdk's parser).
const orderPaidFixture = readFileSync(
  join(__dirname, 'fixtures', 'order-paid.json'),
  'utf8'
);

beforeAll(() => {
  process.env.POLAR_WEBHOOK_SECRET = webhookSecret;
});

/**
 * Generate valid Standard Webhooks headers for a payload, exactly as Polar signs.
 * Signed content: `${id}.${timestamp}.${payload}`; signature is
 * base64(HMAC-SHA256(rawSecretBytes, signedContent)); header value is `v1,<sig>`.
 */
function generatePolarHeaders(
  payload: string,
  secret: string,
  opts: { id?: string; timestamp?: string } = {}
): Record<string, string> {
  const id = opts.id ?? 'msg_test_123';
  const ts = opts.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${id}.${ts}.${payload}`)
    .digest('base64');
  return {
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': `v1,${signature}`,
  };
}

function makeRequest(body: string, headers: Record<string, string>) {
  return new Request('http://localhost:3000/webhooks/polar', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  }) as unknown as Parameters<typeof POST>[0];
}

describe('Polar Webhook Route', () => {
  it('should return 400 for missing signature headers', async () => {
    const res = await POST(makeRequest('{}', {}));
    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid signature', async () => {
    const headers = {
      'webhook-id': 'msg_test_123',
      'webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
      'webhook-signature': 'v1,invalidsignature',
    };
    const res = await POST(makeRequest(orderPaidFixture, headers));
    expect(res.status).toBe(400);
  });

  it('should return 400 for a tampered payload', async () => {
    const headers = generatePolarHeaders(orderPaidFixture, webhookSecret);
    const parsed = JSON.parse(orderPaidFixture);
    const tampered = JSON.stringify({
      ...parsed,
      data: { ...parsed.data, total_amount: 999999 },
    });
    const res = await POST(makeRequest(tampered, headers));
    expect(res.status).toBe(400);
  });

  it('should return 200 for a valid, fully-parsed event', async () => {
    const headers = generatePolarHeaders(orderPaidFixture, webhookSecret);
    const res = await POST(makeRequest(orderPaidFixture, headers));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('should reject an old timestamp (replay protection)', async () => {
    const oldTs = (Math.floor(Date.now() / 1000) - 60 * 60).toString();
    const headers = generatePolarHeaders(orderPaidFixture, webhookSecret, {
      timestamp: oldTs,
    });
    const res = await POST(makeRequest(orderPaidFixture, headers));
    expect(res.status).toBe(400);
  });

  it('should acknowledge an authentic event it cannot parse (2xx, no retry)', async () => {
    const payload = JSON.stringify({ type: 'some.future.event', data: { id: 'obj_123' } });
    const headers = generatePolarHeaders(payload, webhookSecret);
    const res = await POST(makeRequest(payload, headers));
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
  });
});
