import { describe, test, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

function generateSignature(payload: string, secret: string, timestamp: string, msgId: string): string {
  const signedContent = `${msgId}.${timestamp}.${payload}`;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');
  return `v1,${signature}`;
}

beforeAll(() => {
  process.env.WEBHOOK_SECRET = TEST_SECRET;
});

// Import after env is set
const routeImport = import('../app/webhooks/standard/route');

async function postWebhook(payload: string, headers: Record<string, string>) {
  const { POST } = await routeImport;
  const request = new Request('http://localhost:3000/webhooks/standard', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  });
  return POST(request);
}

describe('Standard Webhooks Handler', () => {
  test('successfully processes valid webhook', async () => {
    const payload = JSON.stringify({
      type: 'contact.created',
      timestamp: new Date().toISOString(),
      data: { id: 'ct_123', email: 'test@example.com' },
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSignature(payload, TEST_SECRET, timestamp, msgId);

    const response = await postWebhook(payload, {
      'webhook-id': msgId,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, type: 'contact.created' });
  });

  test('handles multiple signatures (key rotation)', async () => {
    const payload = JSON.stringify({
      type: 'contact.updated',
      timestamp: new Date().toISOString(),
      data: { id: 'ct_123' },
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const valid = generateSignature(payload, TEST_SECRET, timestamp, msgId);
    const invalid = 'v1,aW52YWxpZF9zaWduYXR1cmU=';

    const response = await postWebhook(payload, {
      'webhook-id': msgId,
      'webhook-timestamp': timestamp,
      'webhook-signature': `${invalid} ${valid}`,
    });

    expect(response.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const payload = JSON.stringify({ type: 'contact.created', data: {} });
    const response = await postWebhook(payload, {});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Missing required');
  });

  test('rejects invalid signature', async () => {
    const payload = JSON.stringify({ type: 'contact.created', data: {} });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');

    const response = await postWebhook(payload, {
      'webhook-id': msgId,
      'webhook-timestamp': timestamp,
      'webhook-signature': 'v1,aW52YWxpZF9zaWduYXR1cmU=',
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid signature');
  });

  test('rejects old timestamps (outside 5-minute tolerance)', async () => {
    const payload = JSON.stringify({ type: 'contact.created', data: {} });
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSignature(payload, TEST_SECRET, oldTimestamp, msgId);

    const response = await postWebhook(payload, {
      'webhook-id': msgId,
      'webhook-timestamp': oldTimestamp,
      'webhook-signature': signature,
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Timestamp too old');
  });

  test('handles all illustrative event types', async () => {
    const eventTypes = [
      'contact.created',
      'contact.updated',
      'contact.deleted',
      'message.sent',
      'message.failed',
    ];

    for (const type of eventTypes) {
      const payload = JSON.stringify({
        type,
        timestamp: new Date().toISOString(),
        data: { id: 'resource_123' },
      });

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
      const signature = generateSignature(payload, TEST_SECRET, timestamp, msgId);

      const response = await postWebhook(payload, {
        'webhook-id': msgId,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.type).toBe(type);
    }
  });

  test('handles unknown event types gracefully', async () => {
    const payload = JSON.stringify({
      type: 'unknown.event.type',
      timestamp: new Date().toISOString(),
      data: { id: 'resource_123' },
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSignature(payload, TEST_SECRET, timestamp, msgId);

    const response = await postWebhook(payload, {
      'webhook-id': msgId,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.type).toBe('unknown.event.type');
  });
});
