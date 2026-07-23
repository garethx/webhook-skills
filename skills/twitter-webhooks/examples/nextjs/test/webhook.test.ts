import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

beforeAll(() => {
  process.env.TWITTER_CONSUMER_SECRET = 'test_consumer_secret';
});

import { GET, POST, buildSignature, verifyTwitterSignature } from '../app/webhooks/twitter/route';

const CONSUMER_SECRET = 'test_consumer_secret';

/**
 * Generate a valid X signature for testing.
 * Matches X's algorithm: sha256= + base64(HMAC-SHA256(secret, message)).
 */
function generateSignature(message: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(message).digest('base64');
}

function postRequest(body: string, signature: string | null): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature !== null) headers.set('x-twitter-webhooks-signature', signature);
  return new NextRequest('http://localhost:3000/webhooks/twitter', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyTwitterSignature', () => {
  it('validates a correct signature', () => {
    const body = JSON.stringify({ for_user_id: '123', follow_events: [] });
    const sig = generateSignature(body, CONSUMER_SECRET);
    expect(verifyTwitterSignature(body, sig, CONSUMER_SECRET)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const body = JSON.stringify({ for_user_id: '123' });
    expect(verifyTwitterSignature(body, 'sha256=deadbeef', CONSUMER_SECRET)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyTwitterSignature('{}', null, CONSUMER_SECRET)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = JSON.stringify({ follow_events: [{ type: 'follow' }] });
    const tampered = JSON.stringify({ follow_events: [{ type: 'unfollow' }] });
    const sig = generateSignature(original, CONSUMER_SECRET);
    expect(verifyTwitterSignature(tampered, sig, CONSUMER_SECRET)).toBe(false);
  });

  it('rejects a wrong consumer secret', () => {
    const body = '{}';
    const sig = generateSignature(body, CONSUMER_SECRET);
    expect(verifyTwitterSignature(body, sig, 'wrong_secret')).toBe(false);
  });
});

describe('buildSignature', () => {
  it('produces a sha256= prefixed base64 value', () => {
    const sig = buildSignature('crc_token_value', CONSUMER_SECRET);
    expect(sig).toMatch(/^sha256=[A-Za-z0-9+/]+=*$/);
  });
});

describe('GET /webhooks/twitter (CRC)', () => {
  it('returns the response_token for a valid crc_token', async () => {
    const crcToken = 'crc_challenge_token';
    const req = new NextRequest(
      `http://localhost:3000/webhooks/twitter?crc_token=${crcToken}`
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.response_token).toBe(generateSignature(crcToken, CONSUMER_SECRET));
  });

  it('returns 400 when crc_token is missing', async () => {
    const req = new NextRequest('http://localhost:3000/webhooks/twitter');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /webhooks/twitter', () => {
  it('returns 400 when the signature header is missing', async () => {
    const body = JSON.stringify({ for_user_id: '123' });
    const res = await POST(postRequest(body, null));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature is invalid', async () => {
    const body = JSON.stringify({ for_user_id: '123' });
    const res = await POST(postRequest(body, 'sha256=invalid'));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid tweet_create_events delivery', async () => {
    const body = JSON.stringify({
      for_user_id: '3198576760',
      tweet_create_events: [{ id_str: '1', text: 'hello' }],
    });
    const sig = generateSignature(body, CONSUMER_SECRET);
    const res = await POST(postRequest(body, sig));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ received: true });
  });

  it('returns 200 for a valid follow_events delivery', async () => {
    const body = JSON.stringify({
      for_user_id: '3198576760',
      follow_events: [{ type: 'follow', source: { id: '1' }, target: { id: '2' } }],
    });
    const sig = generateSignature(body, CONSUMER_SECRET);
    const res = await POST(postRequest(body, sig));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const body = 'not valid json';
    const sig = generateSignature(body, CONSUMER_SECRET);
    const res = await POST(postRequest(body, sig));
    expect(res.status).toBe(400);
  });
});
