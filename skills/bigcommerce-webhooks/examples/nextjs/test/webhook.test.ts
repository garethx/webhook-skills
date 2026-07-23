import { describe, it, expect, beforeAll } from 'vitest';
import { Webhook } from 'standardwebhooks';

// BIGCOMMERCE_CLIENT_SECRET is the app's client secret (raw); the route
// base64-encodes it before handing it to the standardwebhooks library.
process.env.BIGCOMMERCE_CLIENT_SECRET = 'test_client_secret_value';

// Reconstruct the same signer the route uses: base64-encoded client secret.
const wh = new Webhook(
  Buffer.from(process.env.BIGCOMMERCE_CLIENT_SECRET).toString('base64')
);

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import('../app/webhooks/bigcommerce/route'));
});

function signedHeaders(
  payload: string,
  { webhookId = 'msg_test_123', date = new Date() }: { webhookId?: string; date?: Date } = {}
): Record<string, string> {
  return {
    'content-type': 'application/json',
    'webhook-id': webhookId,
    'webhook-timestamp': Math.floor(date.getTime() / 1000).toString(),
    'webhook-signature': wh.sign(webhookId, date, payload),
  };
}

function makeRequest(payload: string, headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/webhooks/bigcommerce', {
    method: 'POST',
    headers,
    body: payload,
  });
}

describe('BigCommerce webhook route', () => {
  it('returns 400 when signature headers are missing', async () => {
    const res = await POST(makeRequest('{}', { 'content-type': 'application/json' }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Invalid signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = JSON.stringify({ scope: 'store/order/created', data: { type: 'order', id: 1 } });
    const res = await POST(
      makeRequest(payload, {
        'content-type': 'application/json',
        'webhook-id': 'msg_test_123',
        'webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
        'webhook-signature': 'v1,not_a_real_signature',
      })
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Invalid signature');
  });

  it('returns 400 for an expired timestamp (replay protection)', async () => {
    const payload = JSON.stringify({ scope: 'store/order/created', data: { type: 'order', id: 1 } });
    const oldDate = new Date(Date.now() - 600 * 1000);
    const res = await POST(makeRequest(payload, signedHeaders(payload, { date: oldDate })));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Invalid signature');
  });

  it('returns 400 when the payload is tampered after signing', async () => {
    const original = JSON.stringify({ scope: 'store/order/created', data: { type: 'order', id: 1 } });
    const headers = signedHeaders(original);
    const tampered = JSON.stringify({ scope: 'store/order/created', data: { type: 'order', id: 999 } });
    const res = await POST(makeRequest(tampered, headers));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Invalid signature');
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({
      store_id: '1000',
      producer: 'stores/abc123',
      scope: 'store/order/statusUpdated',
      data: { type: 'order', id: 173331 },
      hash: 'a1b2c3',
      created_at: 1561479335,
    });
    const res = await POST(makeRequest(payload, signedHeaders(payload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  const scopes = [
    'store/order/created',
    'store/order/updated',
    'store/order/statusUpdated',
    'store/product/created',
    'store/product/updated',
    'store/product/deleted',
    'store/product/inventory/updated',
    'store/customer/created',
    'store/cart/created',
    'store/cart/abandoned',
  ];

  scopes.forEach((scope) => {
    it(`handles ${scope}`, async () => {
      const payload = JSON.stringify({ scope, data: { type: scope.split('/')[1], id: 555 } });
      const res = await POST(makeRequest(payload, signedHeaders(payload)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });
  });

  it('handles an unrecognized scope', async () => {
    const payload = JSON.stringify({ scope: 'store/something/unknown', data: { type: 'thing', id: 1 } });
    const res = await POST(makeRequest(payload, signedHeaders(payload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });
});
