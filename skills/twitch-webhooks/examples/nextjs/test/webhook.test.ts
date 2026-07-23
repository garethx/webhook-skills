import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

beforeAll(() => {
  process.env.TWITCH_WEBHOOK_SECRET = 'test_twitch_secret';
});

import { POST } from '../app/webhooks/twitch/route';

const SECRET = 'test_twitch_secret';

/**
 * Generate a valid Twitch EventSub signature for testing.
 * Signs HMAC-SHA256 over messageId + timestamp + body.
 */
function generateTwitchSignature(
  messageId: string,
  timestamp: string,
  payload: string,
  secret: string
): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(messageId);
  hmac.update(timestamp);
  hmac.update(payload);
  return 'sha256=' + hmac.digest('hex');
}

function buildRequest(
  messageId: string,
  timestamp: string,
  signature: string,
  messageType: string,
  payload: string
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/twitch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Twitch-Eventsub-Message-Id': messageId,
      'Twitch-Eventsub-Message-Timestamp': timestamp,
      'Twitch-Eventsub-Message-Signature': signature,
      'Twitch-Eventsub-Message-Type': messageType,
    },
    body: payload,
  });
}

describe('POST /webhooks/twitch', () => {
  it('should return 403 for an invalid signature', async () => {
    const messageId = 'msg-1';
    const timestamp = new Date().toISOString();
    const payload = JSON.stringify({ challenge: 'abc' });

    const res = await POST(
      buildRequest(messageId, timestamp, 'sha256=invalid', 'webhook_callback_verification', payload)
    );

    expect(res.status).toBe(403);
  });

  it('should return 403 for a missing signature', async () => {
    const messageId = 'msg-1';
    const timestamp = new Date().toISOString();
    const payload = JSON.stringify({ challenge: 'abc' });

    const res = await POST(
      buildRequest(messageId, timestamp, '', 'webhook_callback_verification', payload)
    );

    expect(res.status).toBe(403);
  });

  it('should echo the challenge as text/plain for verification', async () => {
    const messageId = 'msg-verify';
    const timestamp = new Date().toISOString();
    const payload = JSON.stringify({ challenge: 'pogchamp-challenge-123' });
    const signature = generateTwitchSignature(messageId, timestamp, payload, SECRET);

    const res = await POST(
      buildRequest(messageId, timestamp, signature, 'webhook_callback_verification', payload)
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await res.text()).toBe('pogchamp-challenge-123');
  });

  it('should return 204 for a stream.online notification', async () => {
    const messageId = 'msg-online';
    const timestamp = new Date().toISOString();
    const payload = JSON.stringify({
      subscription: { type: 'stream.online', version: '1' },
      event: { broadcaster_user_name: 'Cool_User', type: 'live' },
    });
    const signature = generateTwitchSignature(messageId, timestamp, payload, SECRET);

    const res = await POST(
      buildRequest(messageId, timestamp, signature, 'notification', payload)
    );

    expect(res.status).toBe(204);
  });

  it('should return 204 for a channel.follow notification', async () => {
    const messageId = 'msg-follow';
    const timestamp = new Date().toISOString();
    const payload = JSON.stringify({
      subscription: { type: 'channel.follow', version: '2' },
      event: { user_name: 'Follower', broadcaster_user_name: 'Cool_User' },
    });
    const signature = generateTwitchSignature(messageId, timestamp, payload, SECRET);

    const res = await POST(
      buildRequest(messageId, timestamp, signature, 'notification', payload)
    );

    expect(res.status).toBe(204);
  });

  it('should return 204 for a revocation', async () => {
    const messageId = 'msg-revoke';
    const timestamp = new Date().toISOString();
    const payload = JSON.stringify({
      subscription: { type: 'stream.online', status: 'authorization_revoked' },
    });
    const signature = generateTwitchSignature(messageId, timestamp, payload, SECRET);

    const res = await POST(
      buildRequest(messageId, timestamp, signature, 'revocation', payload)
    );

    expect(res.status).toBe(204);
  });

  it('should return 403 for a stale timestamp', async () => {
    const messageId = 'msg-stale';
    const timestamp = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const payload = JSON.stringify({
      subscription: { type: 'stream.online', version: '1' },
      event: { broadcaster_user_name: 'Cool_User', type: 'live' },
    });
    const signature = generateTwitchSignature(messageId, timestamp, payload, SECRET);

    const res = await POST(
      buildRequest(messageId, timestamp, signature, 'notification', payload)
    );

    expect(res.status).toBe(403);
  });
});

describe('Twitch signature format', () => {
  it('should generate a sha256-prefixed hex signature', () => {
    const sig = generateTwitchSignature('id', new Date().toISOString(), '{"a":1}', SECRET);
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('should change when the body changes', () => {
    const ts = new Date().toISOString();
    const a = generateTwitchSignature('id', ts, '{"a":1}', SECRET);
    const b = generateTwitchSignature('id', ts, '{"a":2}', SECRET);
    expect(a).not.toBe(b);
  });
});
