import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

const WEBHOOK_SECRET = 'test_signature_secret';

// The route reads SYNCTERA_WEBHOOK_SECRET at module load, so set the env var and
// dynamically import the route after it is set (static imports are hoisted).
let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.SYNCTERA_WEBHOOK_SECRET = WEBHOOK_SECRET;
  ({ POST } = await import('../app/webhooks/synctera/route'));
});

/**
 * Generate a valid Synctera signature for testing.
 * HMAC-SHA256 over `${timestamp}.${payload}`, hex-encoded.
 */
function sign(payload: string, secret: string, timestamp: number): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
}

function makeRequest(
  payload: string,
  { signature, timestamp }: { signature?: string; timestamp?: string }
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (signature !== undefined) headers.set('Synctera-Signature', signature);
  if (timestamp !== undefined) headers.set('Request-Timestamp', timestamp);
  return new Request('http://localhost/webhooks/synctera', {
    method: 'POST',
    body: payload,
    headers,
  });
}

describe('POST /webhooks/synctera', () => {
  it('returns 400 when signature headers are missing', async () => {
    const res = await POST(makeRequest('{}', {}) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = JSON.stringify({ type: 'ACCOUNT.UPDATED', id: 'acc_1' });
    const ts = Math.floor(Date.now() / 1000);
    const res = await POST(
      makeRequest(payload, { signature: 'deadbeef', timestamp: String(ts) }) as never
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const original = JSON.stringify({ type: 'TRANSACTIONS.POSTED.CREATED', id: 'txn_1' });
    const tampered = JSON.stringify({ type: 'TRANSACTIONS.POSTED.CREATED', id: 'txn_evil' });
    const ts = Math.floor(Date.now() / 1000);
    const res = await POST(
      makeRequest(tampered, {
        signature: sign(original, WEBHOOK_SECRET, ts),
        timestamp: String(ts),
      }) as never
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a stale timestamp (replay protection)', async () => {
    const payload = JSON.stringify({ type: 'ACCOUNT.UPDATED', id: 'acc_1' });
    const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const res = await POST(
      makeRequest(payload, {
        signature: sign(payload, WEBHOOK_SECRET, oldTs),
        timestamp: String(oldTs),
      }) as never
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({ type: 'ACCOUNT.UPDATED', id: 'acc_1' });
    const ts = Math.floor(Date.now() / 1000);
    const res = await POST(
      makeRequest(payload, {
        signature: sign(payload, WEBHOOK_SECRET, ts),
        timestamp: String(ts),
      }) as never
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a rolling secret (two "."-delimited signatures)', async () => {
    const payload = JSON.stringify({ type: 'TRANSACTIONS.POSTED.CREATED', id: 'txn_1' });
    const ts = Math.floor(Date.now() / 1000);
    const rotated = `${'0'.repeat(64)}.${sign(payload, WEBHOOK_SECRET, ts)}`;
    const res = await POST(
      makeRequest(payload, { signature: rotated, timestamp: String(ts) }) as never
    );
    expect(res.status).toBe(200);
  });

  it('handles different event types', async () => {
    // Only the first two are verified event names; the rest exercise the
    // default (unhandled) path.
    const eventTypes = [
      'ACCOUNT.UPDATED',
      'TRANSACTIONS.POSTED.CREATED',
      'UNKNOWN.EVENT',
    ];
    const ts = Math.floor(Date.now() / 1000);

    for (const type of eventTypes) {
      const payload = JSON.stringify({ type, id: 'obj_123' });
      const res = await POST(
        makeRequest(payload, {
          signature: sign(payload, WEBHOOK_SECRET, ts),
          timestamp: String(ts),
        }) as never
      );
      expect(res.status).toBe(200);
    }
  });
});
