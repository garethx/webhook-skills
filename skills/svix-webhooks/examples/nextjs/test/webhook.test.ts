import { describe, test, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/svix/route';
import { NextRequest } from 'next/server';

// Test signing secret. base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Generate a valid Svix signature (same algorithm the sender uses).
function generateSvixSignature(payload: string, secret: string, timestamp: string, msgId: string): string {
  const signedContent = `${msgId}.${timestamp}.${payload}`;
  const key = Buffer.from(secret.split('_')[1], 'base64');
  const signature = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  return `v1,${signature}`;
}

function makeRequest(payload: string, extraHeaders: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/svix', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: payload,
  });
}

describe('Svix Webhook Handler', () => {
  beforeAll(() => {
    process.env.SVIX_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('successfully processes a valid webhook', async () => {
    const payload = JSON.stringify({ type: 'invoice.paid', data: { id: 'in_123' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSvixSignature(payload, TEST_SECRET, timestamp, msgId);

    const response = await POST(
      makeRequest(payload, {
        'svix-id': msgId,
        'svix-timestamp': timestamp,
        'svix-signature': signature,
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true, type: 'invoice.paid' });
  });

  test('accepts webhook-* header aliases (Standard Webhooks)', async () => {
    const payload = JSON.stringify({ type: 'user.created', data: { id: 'user_123' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSvixSignature(payload, TEST_SECRET, timestamp, msgId);

    const response = await POST(
      makeRequest(payload, {
        'webhook-id': msgId,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.type).toBe('user.created');
  });

  test('handles multiple signatures (secret rotation)', async () => {
    const payload = JSON.stringify({ type: 'user.updated', data: { id: 'user_123' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const valid = generateSvixSignature(payload, TEST_SECRET, timestamp, msgId);
    const invalid = 'v1,aW52YWxpZF9zaWduYXR1cmU=';

    const response = await POST(
      makeRequest(payload, {
        'svix-id': msgId,
        'svix-timestamp': timestamp,
        'svix-signature': `${invalid} ${valid}`,
      })
    );

    expect(response.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const payload = JSON.stringify({ type: 'user.created', data: { id: 'user_123' } });

    const response = await POST(makeRequest(payload, {}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Missing required');
  });

  test('rejects an invalid signature', async () => {
    const payload = JSON.stringify({ type: 'user.created', data: { id: 'user_123' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');

    const response = await POST(
      makeRequest(payload, {
        'svix-id': msgId,
        'svix-timestamp': timestamp,
        'svix-signature': 'v1,aW52YWxpZF9zaWduYXR1cmU=',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid signature');
  });

  test('rejects an old timestamp', async () => {
    const payload = JSON.stringify({ type: 'user.created', data: { id: 'user_123' } });
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSvixSignature(payload, TEST_SECRET, oldTimestamp, msgId);

    const response = await POST(
      makeRequest(payload, {
        'svix-id': msgId,
        'svix-timestamp': oldTimestamp,
        'svix-signature': signature,
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Timestamp too old');
  });

  test('handles all illustrative event types', async () => {
    const eventTypes = ['invoice.paid', 'user.created', 'user.updated', 'message.sent'];

    for (const eventType of eventTypes) {
      const payload = JSON.stringify({ type: eventType, data: { id: 'resource_123' } });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
      const signature = generateSvixSignature(payload, TEST_SECRET, timestamp, msgId);

      const response = await POST(
        makeRequest(payload, {
          'svix-id': msgId,
          'svix-timestamp': timestamp,
          'svix-signature': signature,
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.type).toBe(eventType);
    }
  });

  test('handles unknown event types gracefully', async () => {
    const payload = JSON.stringify({ type: 'some.unknown.event', data: { id: 'resource_123' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSvixSignature(payload, TEST_SECRET, timestamp, msgId);

    const response = await POST(
      makeRequest(payload, {
        'svix-id': msgId,
        'svix-timestamp': timestamp,
        'svix-signature': signature,
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.type).toBe('some.unknown.event');
  });
});
