import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Realistic test secret (any string works; Paymob's is an opaque key)
beforeAll(() => {
  process.env.PAYMOB_HMAC_SECRET = 'test_hmac_secret';
});

import { POST, buildSignedString, transactionState } from '../app/webhooks/paymob/route';

const SECRET = 'test_hmac_secret';

function makeObj(overrides: Record<string, unknown> = {}) {
  return {
    id: 123456789,
    amount_cents: 10000,
    created_at: '2026-07-27T10:15:30.123456',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    integration_id: 987654,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    pending: false,
    success: true,
    owner: 543210,
    order: { id: 222333444 },
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
    ...overrides,
  };
}

// Generate a valid HMAC exactly as Paymob does: SHA512 hex over the ordered fields.
function sign(obj: any, secret = SECRET): string {
  return crypto
    .createHmac('sha512', secret)
    .update(buildSignedString(obj))
    .digest('hex');
}

function makeRequest(obj: any, hmac: string | null) {
  const url = hmac
    ? `https://example.com/webhooks/paymob?hmac=${hmac}`
    : 'https://example.com/webhooks/paymob';
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'TRANSACTION', obj }),
  }) as any;
}

describe('Paymob webhook handler', () => {
  it('accepts a callback with a valid HMAC', async () => {
    const obj = makeObj();
    const res = await POST(makeRequest(obj, sign(obj)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a callback with an invalid HMAC', async () => {
    const obj = makeObj();
    const res = await POST(makeRequest(obj, 'deadbeef'));
    expect(res.status).toBe(400);
  });

  it('rejects a callback when the hmac param is missing', async () => {
    const obj = makeObj();
    const res = await POST(makeRequest(obj, null));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered payload (amount changed after signing)', async () => {
    const obj = makeObj();
    const hmac = sign(obj);
    const tampered = makeObj({ amount_cents: 1 });
    const res = await POST(makeRequest(tampered, hmac));
    expect(res.status).toBe(400);
  });

  it('rejects a non-transaction payload', async () => {
    const req = new Request('https://example.com/webhooks/paymob?hmac=abc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'SOMETHING_ELSE' }),
    }) as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('uses SHA512 (128-char hex digest)', () => {
    expect(sign(makeObj())).toHaveLength(128);
  });

  it('derives the transaction state from boolean fields', () => {
    expect(transactionState(makeObj() as any)).toBe('succeeded');
    expect(transactionState(makeObj({ success: false, error_occured: true }) as any)).toBe('failed');
    expect(transactionState(makeObj({ pending: true }) as any)).toBe('pending');
    expect(transactionState(makeObj({ is_auth: true, is_capture: false }) as any)).toBe('authorized');
    expect(transactionState(makeObj({ is_refunded: true }) as any)).toBe('refunded');
    expect(transactionState(makeObj({ is_voided: true }) as any)).toBe('voided');
  });
});
