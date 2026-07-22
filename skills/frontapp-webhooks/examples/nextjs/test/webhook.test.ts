import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables before importing the route handler
beforeAll(() => {
  process.env.FRONT_WEBHOOK_SECRET = 'test_app_signing_key';
});

const webhookSecret = 'test_app_signing_key';

/**
 * Generate a valid Front signature for testing.
 * base64(HMAC-SHA256(key = secret, msg = timestamp + ":" + rawBody))
 */
function generateFrontSignature(payload: string, secret: string, timestamp: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(timestamp + ':');
  hmac.update(Buffer.from(payload, 'utf8'));
  return hmac.digest('base64');
}

function makeRequest(body: string, headers: Record<string, string>) {
  return new Request('http://localhost/webhooks/frontapp', {
    method: 'POST',
    headers,
    body,
  });
}

describe('Front Webhook Route', () => {
  it('should echo the X-Front-Challenge on subscription validation', async () => {
    const { POST } = await import('../app/webhooks/frontapp/route');
    const req = makeRequest('', {
      'Content-Type': 'application/json',
      'X-Front-Challenge': 'abc123challenge',
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge: 'abc123challenge' });
  });

  it('should return 400 for missing signature', async () => {
    const { POST } = await import('../app/webhooks/frontapp/route');
    const req = makeRequest('{}', { 'Content-Type': 'application/json' });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid signature', async () => {
    const { POST } = await import('../app/webhooks/frontapp/route');
    const payload = JSON.stringify({ type: 'inbound_received', payload: { id: 'evt_test' } });
    const req = makeRequest(payload, {
      'Content-Type': 'application/json',
      'X-Front-Request-Timestamp': '1615496636',
      'X-Front-Signature': 'invalid_signature',
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('should return 400 for tampered payload', async () => {
    const { POST } = await import('../app/webhooks/frontapp/route');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const originalPayload = JSON.stringify({ type: 'inbound_received', payload: { id: 'evt_original' } });
    const signature = generateFrontSignature(originalPayload, webhookSecret, timestamp);
    const tamperedPayload = JSON.stringify({ type: 'inbound_received', payload: { id: 'evt_tampered' } });

    const req = makeRequest(tamperedPayload, {
      'Content-Type': 'application/json',
      'X-Front-Request-Timestamp': timestamp,
      'X-Front-Signature': signature,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('should return 200 for valid signature', async () => {
    const { POST } = await import('../app/webhooks/frontapp/route');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = JSON.stringify({
      type: 'inbound_received',
      payload: { id: 'evt_valid', conversation: { id: 'cnv_valid' } },
    });
    const signature = generateFrontSignature(payload, webhookSecret, timestamp);

    const req = makeRequest(payload, {
      'Content-Type': 'application/json',
      'X-Front-Request-Timestamp': timestamp,
      'X-Front-Signature': signature,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('should handle different event types', async () => {
    const { POST } = await import('../app/webhooks/frontapp/route');
    const eventTypes = [
      'inbound_received',
      'outbound_sent',
      'conversation_moved',
      'assignee_changed',
      'conversation_archived',
      'tag_added',
      'new_comment_added',
      'message_delivery_failed',
      'unknown_event',
    ];

    for (const eventType of eventTypes) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const payload = JSON.stringify({
        type: eventType,
        payload: { id: `evt_${eventType}`, conversation: { id: 'cnv_123' } },
      });
      const signature = generateFrontSignature(payload, webhookSecret, timestamp);

      const req = makeRequest(payload, {
        'Content-Type': 'application/json',
        'X-Front-Request-Timestamp': timestamp,
        'X-Front-Signature': signature,
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
    }
  });
});
