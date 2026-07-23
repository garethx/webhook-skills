import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Set test environment variables before importing the route
beforeAll(() => {
  process.env.OURA_CLIENT_SECRET = 'test_client_secret';
  process.env.OURA_VERIFICATION_TOKEN = 'test_verification_token';
});

import { GET, POST, verifyOuraSignature } from '../app/webhooks/oura/route';

/**
 * Generate a valid Oura signature for testing.
 * HMAC-SHA256 over (timestamp + rawBody), hex, UPPERCASE.
 */
function generateOuraSignature(rawBody: string, timestamp: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(timestamp + rawBody)
    .digest('hex')
    .toUpperCase();
}

const SECRET = 'test_client_secret';
const TIMESTAMP = '1700000000';

function postRequest(body: string, signature: string | null, timestamp: string | null = TIMESTAMP) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature !== null) headers.set('x-oura-signature', signature);
  if (timestamp !== null) headers.set('x-oura-timestamp', timestamp);
  return new NextRequest('http://localhost:3000/webhooks/oura', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyOuraSignature', () => {
  it('validates a correct signature', () => {
    const body = JSON.stringify({ event_type: 'update', data_type: 'sleep' });
    const signature = generateOuraSignature(body, TIMESTAMP, SECRET);

    expect(verifyOuraSignature(body, signature, TIMESTAMP, SECRET)).toBe(true);
  });

  it('produces an UPPERCASE hex digest (matches Oura)', () => {
    const signature = generateOuraSignature('{"data_type":"sleep"}', TIMESTAMP, SECRET);

    expect(signature).toMatch(/^[A-F0-9]{64}$/);
  });

  it('rejects an invalid signature', () => {
    expect(verifyOuraSignature('{"data_type":"sleep"}', 'INVALID', TIMESTAMP, SECRET)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyOuraSignature('{"data_type":"sleep"}', null, TIMESTAMP, SECRET)).toBe(false);
  });

  it('rejects a missing timestamp', () => {
    const body = '{"data_type":"sleep"}';
    const signature = generateOuraSignature(body, TIMESTAMP, SECRET);

    expect(verifyOuraSignature(body, signature, null, SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const original = JSON.stringify({ data_type: 'sleep', object_id: '1' });
    const signature = generateOuraSignature(original, TIMESTAMP, SECRET);
    const tampered = JSON.stringify({ data_type: 'sleep', object_id: '999' });

    expect(verifyOuraSignature(tampered, signature, TIMESTAMP, SECRET)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const body = '{"data_type":"sleep"}';
    const signature = generateOuraSignature(body, TIMESTAMP, SECRET);

    expect(verifyOuraSignature(body, signature, TIMESTAMP, 'wrong_secret')).toBe(false);
  });
});

describe('GET /webhooks/oura (handshake)', () => {
  it('echoes the challenge for a valid verification_token', async () => {
    const request = new NextRequest(
      'http://localhost:3000/webhooks/oura?verification_token=test_verification_token&challenge=abc123'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge: 'abc123' });
  });

  it('returns 401 for an invalid verification_token', async () => {
    const request = new NextRequest(
      'http://localhost:3000/webhooks/oura?verification_token=wrong&challenge=abc123'
    );
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('returns 401 when verification_token is missing', async () => {
    const request = new NextRequest('http://localhost:3000/webhooks/oura?challenge=abc123');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});

describe('POST /webhooks/oura (events)', () => {
  it('returns 200 for a valid signature', async () => {
    const body = JSON.stringify({
      event_type: 'update',
      data_type: 'sleep',
      object_id: '12345abc',
      event_time: '2023-01-01T08:00:00+00:00',
      user_id: 'user123',
    });
    const signature = generateOuraSignature(body, TIMESTAMP, SECRET);

    const response = await POST(postRequest(body, signature));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('returns 401 for an invalid signature', async () => {
    const body = JSON.stringify({ event_type: 'update', data_type: 'sleep' });

    const response = await POST(postRequest(body, 'INVALID'));

    expect(response.status).toBe(401);
  });

  it('returns 401 for a missing signature', async () => {
    const body = JSON.stringify({ event_type: 'update', data_type: 'sleep' });

    const response = await POST(postRequest(body, null));

    expect(response.status).toBe(401);
  });

  it('handles a daily_readiness event', async () => {
    const body = JSON.stringify({
      event_type: 'create',
      data_type: 'daily_readiness',
      object_id: 'r1',
      event_time: '2023-01-01T08:00:00+00:00',
      user_id: 'user123',
    });
    const signature = generateOuraSignature(body, TIMESTAMP, SECRET);

    const response = await POST(postRequest(body, signature));

    expect(response.status).toBe(200);
  });
});
