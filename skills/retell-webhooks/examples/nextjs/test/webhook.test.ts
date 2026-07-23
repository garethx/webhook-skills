import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Set test environment BEFORE importing the route
process.env.RETELL_API_KEY = 'test_retell_api_key';

import { POST } from '../app/webhooks/retell/route';

/**
 * Generate a Retell-format signature header: "v={ms_timestamp},d={hex_digest}"
 * over (raw body + timestamp), HMAC-SHA256 with the API key as the secret.
 */
function signBody(body: string, apiKey: string, timestamp: number = Date.now()) {
  const digest = crypto
    .createHmac('sha256', apiKey)
    .update(body + timestamp)
    .digest('hex');
  return `v=${timestamp},d=${digest}`;
}

function createMockRequest(body: string, headers: Record<string, string>) {
  return {
    text: async () => body,
    headers: new Headers(headers),
  } as unknown as import('next/server').NextRequest;
}

describe('Retell Webhook Handler', () => {
  const apiKey = process.env.RETELL_API_KEY!;

  it('accepts a valid webhook with a correct signature', async () => {
    const payload = JSON.stringify({
      event: 'call_ended',
      call: { call_id: 'call_abc123' },
    });
    const signature = signBody(payload, apiKey);

    const request = createMockRequest(payload, {
      'X-Retell-Signature': signature,
      'Content-Type': 'application/json',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('OK');
  });

  it('rejects an invalid signature', async () => {
    const payload = JSON.stringify({
      event: 'call_ended',
      call: { call_id: 'call_abc123' },
    });

    const request = createMockRequest(payload, {
      'X-Retell-Signature': `v=${Date.now()},d=deadbeef`,
      'Content-Type': 'application/json',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  it('rejects a request with no signature header', async () => {
    const payload = JSON.stringify({
      event: 'call_ended',
      call: { call_id: 'call_abc123' },
    });

    const request = createMockRequest(payload, {
      'Content-Type': 'application/json',
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  it('rejects a signature signed with the wrong key', async () => {
    const payload = JSON.stringify({
      event: 'call_ended',
      call: { call_id: 'call_abc123' },
    });
    const signature = signBody(payload, 'wrong_key');

    const request = createMockRequest(payload, {
      'X-Retell-Signature': signature,
      'Content-Type': 'application/json',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('rejects an expired timestamp (older than 5 minutes)', async () => {
    const payload = JSON.stringify({
      event: 'call_ended',
      call: { call_id: 'call_abc123' },
    });
    const oldTimestamp = Date.now() - 6 * 60 * 1000;
    const signature = signBody(payload, apiKey, oldTimestamp);

    const request = createMockRequest(payload, {
      'X-Retell-Signature': signature,
      'Content-Type': 'application/json',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('handles a lowercase signature header', async () => {
    const payload = JSON.stringify({
      event: 'call_started',
      call: { call_id: 'call_lower' },
    });
    const signature = signBody(payload, apiKey);

    const request = createMockRequest(payload, {
      'x-retell-signature': signature,
      'Content-Type': 'application/json',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('handles all documented event types', async () => {
    const events: [string, 'call' | 'chat'][] = [
      ['call_started', 'call'],
      ['call_ended', 'call'],
      ['call_analyzed', 'call'],
      ['transcript_updated', 'call'],
      ['transfer_started', 'call'],
      ['transfer_bridged', 'call'],
      ['transfer_cancelled', 'call'],
      ['transfer_ended', 'call'],
      ['chat_started', 'chat'],
      ['chat_ended', 'chat'],
      ['chat_analyzed', 'chat'],
    ];

    for (const [event, objectKey] of events) {
      const body: Record<string, unknown> = { event };
      body[objectKey] = { [`${objectKey}_id`]: `${objectKey}_${event}` };
      const payload = JSON.stringify(body);
      const signature = signBody(payload, apiKey);

      const request = createMockRequest(payload, {
        'X-Retell-Signature': signature,
        'Content-Type': 'application/json',
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    }
  });
});
