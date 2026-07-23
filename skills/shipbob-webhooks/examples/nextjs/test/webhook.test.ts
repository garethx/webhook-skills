import { describe, test, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Test webhook secret (whsec_ + base64-encoded key)
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Helper to generate valid ShipBob (Standard Webhooks) signatures.
function generateSignature(payload: string, secret: string, timestamp: string, webhookId: string): string {
  const signedContent = `${webhookId}.${timestamp}.${payload}`;
  const secretBytes = Buffer.from(secret.split('_')[1], 'base64');
  const signature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');
  return `v1,${signature}`;
}

import { POST } from '../app/webhooks/shipbob/route';

function buildRequest(payload: string, headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/webhooks/shipbob', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload
  });
}

describe('ShipBob Webhook Handler', () => {
  beforeAll(() => {
    process.env.SHIPBOB_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('successfully processes valid webhook', async () => {
    const payload = JSON.stringify({ id: 'shipment_123', order_id: 456, status: 'Completed' });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const webhookId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSignature(payload, TEST_SECRET, timestamp, webhookId);

    const response = await POST(buildRequest(payload, {
      'webhook-id': webhookId,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
      'x-webhook-topic': 'order.shipped'
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, topic: 'order.shipped' });
  });

  test('handles multiple signatures correctly', async () => {
    const payload = JSON.stringify({ id: 'shipment_123', status: 'Delivered' });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const webhookId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const validSignature = generateSignature(payload, TEST_SECRET, timestamp, webhookId);
    const invalidSignature = 'v1,aW52YWxpZF9zaWduYXR1cmU=';
    const multiSignature = `${invalidSignature} ${validSignature}`;

    const response = await POST(buildRequest(payload, {
      'webhook-id': webhookId,
      'webhook-timestamp': timestamp,
      'webhook-signature': multiSignature,
      'x-webhook-topic': 'order.shipment.delivered'
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, topic: 'order.shipment.delivered' });
  });

  test('rejects missing headers', async () => {
    const payload = JSON.stringify({ id: 'shipment_123' });

    const response = await POST(buildRequest(payload, { 'x-webhook-topic': 'order.shipped' }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('Missing required');
  });

  test('rejects invalid signature', async () => {
    const payload = JSON.stringify({ id: 'shipment_123' });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const webhookId = 'msg_' + crypto.randomBytes(16).toString('hex');

    const response = await POST(buildRequest(payload, {
      'webhook-id': webhookId,
      'webhook-timestamp': timestamp,
      'webhook-signature': 'v1,aW52YWxpZF9zaWduYXR1cmU=',
      'x-webhook-topic': 'order.shipped'
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Invalid signature');
  });

  test('rejects old timestamps', async () => {
    const payload = JSON.stringify({ id: 'shipment_123' });
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const webhookId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSignature(payload, TEST_SECRET, oldTimestamp, webhookId);

    const response = await POST(buildRequest(payload, {
      'webhook-id': webhookId,
      'webhook-timestamp': oldTimestamp,
      'webhook-signature': signature,
      'x-webhook-topic': 'order.shipped'
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Timestamp too old');
  });

  test('handles all common topics', async () => {
    const topics = [
      'order.shipped',
      'order.shipment.delivered',
      'order.shipment.tracking.updated',
      'order.shipment.exception',
      'return.created',
      'wro.created',
      'billing.charge.created'
    ];

    for (const topic of topics) {
      const payload = JSON.stringify({ id: 'resource_123', topic });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const webhookId = 'msg_' + crypto.randomBytes(16).toString('hex');
      const signature = generateSignature(payload, TEST_SECRET, timestamp, webhookId);

      const response = await POST(buildRequest(payload, {
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
        'x-webhook-topic': topic
      }));

      expect(response.status).toBe(200);
      expect((await response.json()).topic).toBe(topic);
    }
  });

  test('handles unknown topics gracefully', async () => {
    const payload = JSON.stringify({ id: 'resource_123' });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const webhookId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateSignature(payload, TEST_SECRET, timestamp, webhookId);

    const response = await POST(buildRequest(payload, {
      'webhook-id': webhookId,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
      'x-webhook-topic': 'some.unhandled.topic'
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).topic).toBe('some.unhandled.topic');
  });
});
