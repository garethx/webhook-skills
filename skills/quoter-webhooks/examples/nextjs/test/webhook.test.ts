import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, verifyQuoter } from '../app/webhooks/quoter/route';

const HASH_KEY = 'test_hash_key';

beforeAll(() => {
  process.env.QUOTER_HASH_KEY = HASH_KEY;
});

/**
 * Build a Quoter form body (hash, timestamp, data) for testing.
 * Quoter computes hash = md5(HASH_KEY + timestamp + data).
 */
function buildQuoterBody(
  data: string,
  opts: { hashKey?: string; timestamp?: string } = {}
) {
  const hashKey = opts.hashKey ?? HASH_KEY;
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const hash = crypto.createHash('md5').update(hashKey + timestamp + data).digest('hex');
  return { hash, timestamp, data };
}

function makeRequest(object: string, body: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost/webhooks/quoter?object=${object}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

describe('verifyQuoter', () => {
  const data = JSON.stringify({ id: 'quot_123', status: 'accepted' });

  it('accepts a valid hash', () => {
    const { hash, timestamp } = buildQuoterBody(data);
    expect(verifyQuoter(HASH_KEY, timestamp, data, hash)).toBe(true);
  });

  it('rejects an invalid hash', () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    expect(verifyQuoter(HASH_KEY, timestamp, data, 'deadbeef')).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const { hash, timestamp } = buildQuoterBody(data);
    const tampered = JSON.stringify({ id: 'quot_123', status: 'ordered' });
    expect(verifyQuoter(HASH_KEY, timestamp, tampered, hash)).toBe(false);
  });

  it('rejects a stale timestamp', () => {
    const oldTs = (Math.floor(Date.now() / 1000) - 400).toString();
    const { hash } = buildQuoterBody(data, { timestamp: oldTs });
    expect(verifyQuoter(HASH_KEY, oldTs, data, hash)).toBe(false);
  });

  it('rejects when no hash key is configured', () => {
    const { hash, timestamp } = buildQuoterBody(data);
    expect(verifyQuoter(undefined, timestamp, data, hash)).toBe(false);
  });
});

describe('POST /webhooks/quoter', () => {
  it('returns 400 when fields are missing', async () => {
    const res = await POST(makeRequest('quote', { data: '{}' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid hash', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const res = await POST(
      makeRequest('quote', { hash: 'deadbeef', timestamp, data: '{"id":"quot_1"}' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid delivery', async () => {
    const body = buildQuoterBody(JSON.stringify({ id: 'quot_123' }));
    const res = await POST(makeRequest('quote', body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles each object type', async () => {
    for (const object of ['quote', 'person', 'payment']) {
      const body = buildQuoterBody(JSON.stringify({ id: `${object}_1` }));
      const res = await POST(makeRequest(object, body));
      expect(res.status).toBe(200);
    }
  });

  it('returns 400 for invalid JSON in the data field', async () => {
    const body = buildQuoterBody('not-json');
    const res = await POST(makeRequest('quote', body));
    expect(res.status).toBe(400);
  });
});
