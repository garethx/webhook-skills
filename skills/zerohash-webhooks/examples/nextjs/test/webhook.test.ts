import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Set test environment variables before importing the route.
beforeAll(() => {
  process.env.ZEROHASH_WEBHOOK_SECRET = 'test_shared_secret';
});

const webhookSecret = 'test_shared_secret';

/** Recommended scheme: HMAC-SHA256 (hex) of `payload + timestamp`. */
function signWithTimestamp(payload: string, timestamp: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload + timestamp, 'utf8')
    .digest('hex');
}

/** Legacy scheme: HMAC-SHA256 (hex) of `payload` only. */
function signLegacy(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

function tradeBody(status = 'terminated', tradeId = 'trade_123'): string {
  return JSON.stringify({
    trade_id: tradeId,
    status,
    symbol: 'BTC/USD',
    quantity: '0.5',
    price: '60000.00',
    side: 'buy',
  });
}

// The payment_status_changed payload shape is not documented — this is a
// plausible placeholder, not a verified schema.
function paymentBody(status = 'settled', paymentId = 'payment_123'): string {
  return JSON.stringify({
    payment_id: paymentId,
    status,
    asset: 'USD',
    amount: '250.00',
  });
}

function balanceBody(accountType = 'available'): string {
  return JSON.stringify({
    account_group: '00SCXM',
    account_label: 'general',
    asset: 'USD',
    account_type: accountType,
    balance: '1500.00',
  });
}

function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/zerohash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/zerohash', () => {
  it('returns 400 when the signature header is missing', async () => {
    const { POST } = await import('../app/webhooks/zerohash/route');
    const res = await POST(
      makeRequest(tradeBody(), { 'x-zh-hook-payload-type': 'trade_status_changed' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const { POST } = await import('../app/webhooks/zerohash/route');
    const res = await POST(
      makeRequest(tradeBody(), {
        'x-zh-hook-payload-type': 'trade_status_changed',
        'x-zh-hook-timestamp': String(Date.now()),
        'x-zh-hook-signature': 'deadbeef',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const { POST } = await import('../app/webhooks/zerohash/route');
    const timestamp = String(Date.now());
    const original = tradeBody('terminated', 'trade_original');
    const signature = signWithTimestamp(original, timestamp, webhookSecret);
    const tampered = tradeBody('terminated', 'trade_tampered');
    const res = await POST(
      makeRequest(tampered, {
        'x-zh-hook-payload-type': 'trade_status_changed',
        'x-zh-hook-timestamp': timestamp,
        'x-zh-hook-signature': signature,
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for an expired timestamp (replay protection)', async () => {
    const { POST } = await import('../app/webhooks/zerohash/route');
    const body = tradeBody();
    const timestamp = String(Date.now() - 10 * 60 * 1000); // 10 min ago
    const signature = signWithTimestamp(body, timestamp, webhookSecret);
    const res = await POST(
      makeRequest(body, {
        'x-zh-hook-payload-type': 'trade_status_changed',
        'x-zh-hook-timestamp': timestamp,
        'x-zh-hook-signature': signature,
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature (recommended scheme)', async () => {
    const { POST } = await import('../app/webhooks/zerohash/route');
    const body = tradeBody();
    const timestamp = String(Date.now());
    const signature = signWithTimestamp(body, timestamp, webhookSecret);
    const res = await POST(
      makeRequest(body, {
        'x-zh-hook-payload-type': 'trade_status_changed',
        'x-zh-hook-timestamp': timestamp,
        'x-zh-hook-signature': signature,
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 200 for a seconds-precision timestamp (unit is undocumented)', async () => {
    const { POST } = await import('../app/webhooks/zerohash/route');
    const body = tradeBody();
    // Zero Hash does not document whether the timestamp is seconds or ms.
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signWithTimestamp(body, timestamp, webhookSecret);
    const res = await POST(
      makeRequest(body, {
        'x-zh-hook-payload-type': 'trade_status_changed',
        'x-zh-hook-timestamp': timestamp,
        'x-zh-hook-signature': signature,
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 400 for an expired seconds-precision timestamp', async () => {
    const { POST } = await import('../app/webhooks/zerohash/route');
    const body = tradeBody();
    const timestamp = String(Math.floor(Date.now() / 1000) - 10 * 60); // 10 min ago
    const signature = signWithTimestamp(body, timestamp, webhookSecret);
    const res = await POST(
      makeRequest(body, {
        'x-zh-hook-payload-type': 'trade_status_changed',
        'x-zh-hook-timestamp': timestamp,
        'x-zh-hook-signature': signature,
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-numeric timestamp', async () => {
    const { POST } = await import('../app/webhooks/zerohash/route');
    const body = tradeBody();
    const timestamp = 'not-a-timestamp';
    const signature = signWithTimestamp(body, timestamp, webhookSecret);
    const res = await POST(
      makeRequest(body, {
        'x-zh-hook-payload-type': 'trade_status_changed',
        'x-zh-hook-timestamp': timestamp,
        'x-zh-hook-signature': signature,
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid legacy signature (payload only)', async () => {
    const { POST } = await import('../app/webhooks/zerohash/route');
    const body = balanceBody();
    const signature = signLegacy(body, webhookSecret);
    const res = await POST(
      makeRequest(body, {
        'x-zh-hook-payload-type': 'account_balance.changed',
        'x-zh-hook-signature-256': signature,
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles all payload types', async () => {
    const { POST } = await import('../app/webhooks/zerohash/route');
    const cases = [
      { type: 'trade_status_changed', body: tradeBody('accepted') },
      { type: 'trade_status_changed', body: tradeBody('active') },
      { type: 'payment_status_changed', body: paymentBody() },
      // Both spellings of the (unconfirmed) balance event name.
      { type: 'account_balance.changed', body: balanceBody('collateral') },
      { type: 'account_balance_changed', body: balanceBody('available') },
      { type: 'unknown.type', body: tradeBody() },
    ];

    for (const { type, body } of cases) {
      const timestamp = String(Date.now());
      const signature = signWithTimestamp(body, timestamp, webhookSecret);
      const res = await POST(
        makeRequest(body, {
          'x-zh-hook-payload-type': type,
          'x-zh-hook-timestamp': timestamp,
          'x-zh-hook-signature': signature,
        })
      );
      expect(res.status).toBe(200);
    }
  });
});
