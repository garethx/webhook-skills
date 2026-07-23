import { describe, test, expect, beforeAll } from 'vitest';
import nacl from 'tweetnacl';

// Generate a real Ed25519 keypair for testing.
// Telnyx provides the public key as base64 (32 bytes) in Mission Control.
const keypair = nacl.sign.keyPair();
const PUBLIC_KEY_B64 = Buffer.from(keypair.publicKey).toString('base64');
const SECRET_KEY = keypair.secretKey;

beforeAll(() => {
  process.env.TELNYX_PUBLIC_KEY = PUBLIC_KEY_B64;
});

// Import after env is set
import { POST } from '../app/webhooks/telnyx/route';

// Sign the exact Telnyx scheme: base64( Ed25519( `${timestamp}|${rawBody}` ) )
function signPayload(rawBody: string, timestamp: string): string {
  const message = Buffer.from(`${timestamp}|${rawBody}`, 'utf8');
  const signature = nacl.sign.detached(new Uint8Array(message), SECRET_KEY);
  return Buffer.from(signature).toString('base64');
}

interface SendOptions {
  tamperBody?: boolean;
  omitHeaders?: boolean;
  badSig?: boolean;
  staleTs?: boolean;
}

function buildRequest(payloadObj: unknown, opts: SendOptions = {}): Request {
  const rawBody = JSON.stringify(payloadObj);
  const timestamp = opts.staleTs
    ? (Math.floor(Date.now() / 1000) - 3600).toString()
    : Math.floor(Date.now() / 1000).toString();
  let signature = signPayload(rawBody, timestamp);
  if (opts.badSig) {
    signature = Buffer.from('00'.repeat(64), 'hex').toString('base64');
  }

  const sentBody = opts.tamperBody ? rawBody.replace(/}$/, ',"injected":true}') : rawBody;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (!opts.omitHeaders) {
    headers['telnyx-signature-ed25519'] = signature;
    headers['telnyx-timestamp'] = timestamp;
  }

  return new Request('http://localhost:3000/webhooks/telnyx', {
    method: 'POST',
    headers,
    body: sentBody,
  });
}

function messageEvent(eventType: string) {
  return {
    data: {
      record_type: 'event',
      event_type: eventType,
      id: '2c60c1c6-1234-4b6a-9f3f-abcdef012345',
      occurred_at: '2024-02-02T22:25:27.521Z',
      payload: {
        id: '40385f64-1234-4b0e-8c1f-0123456789ab',
        record_type: 'message',
        direction: eventType === 'message.received' ? 'inbound' : 'outbound',
        from: { phone_number: '+13125550001' },
        to: [{ phone_number: '+13125550002', status: 'sent' }],
        text: 'Hello from Telnyx',
      },
    },
    meta: { attempt: 1, delivered_to: 'https://example.com/webhooks/telnyx' },
  };
}

describe('Telnyx Webhook Handler (Next.js)', () => {
  test('responds 200 to a valid message.sent event', async () => {
    const res = await POST(buildRequest(messageEvent('message.sent')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  test('rejects request with missing signature headers (400)', async () => {
    const res = await POST(buildRequest(messageEvent('message.sent'), { omitHeaders: true }));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Missing Telnyx signature/i);
  });

  test('rejects request with invalid signature (400)', async () => {
    const res = await POST(buildRequest(messageEvent('message.sent'), { badSig: true }));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Invalid signature/i);
  });

  test('rejects tampered body (400)', async () => {
    const res = await POST(buildRequest(messageEvent('message.received'), { tamperBody: true }));
    expect(res.status).toBe(400);
  });

  test('rejects a stale timestamp outside tolerance (400)', async () => {
    const res = await POST(buildRequest(messageEvent('message.sent'), { staleTs: true }));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Invalid signature/i);
  });

  test('handles all common event types', async () => {
    for (const eventType of ['message.received', 'message.sent', 'message.finalized']) {
      const res = await POST(buildRequest(messageEvent(eventType)));
      expect(res.status).toBe(200);
    }
  });

  test('handles unknown event types gracefully (200)', async () => {
    const res = await POST(buildRequest(messageEvent('message.some_future_event')));
    expect(res.status).toBe(200);
  });
});
