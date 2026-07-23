const request = require('supertest');
const nacl = require('tweetnacl');

// Generate a real Ed25519 keypair for testing.
// Telnyx provides the public key as base64 (32 bytes) in Mission Control.
const keypair = nacl.sign.keyPair();
const PUBLIC_KEY_B64 = Buffer.from(keypair.publicKey).toString('base64');
const SECRET_KEY = keypair.secretKey;

process.env.TELNYX_PUBLIC_KEY = PUBLIC_KEY_B64;

const { app, server } = require('../src/index');

// Sign the exact Telnyx scheme: base64( Ed25519( `${timestamp}|${rawBody}` ) )
function signPayload(rawBody, timestamp) {
  const message = Buffer.from(`${timestamp}|${rawBody}`, 'utf8');
  const signature = nacl.sign.detached(new Uint8Array(message), SECRET_KEY);
  return Buffer.from(signature).toString('base64');
}

function sendSigned(payloadObj, { tamperBody = false, omitHeaders = false, badSig = false, staleTs = false } = {}) {
  const rawBody = JSON.stringify(payloadObj);
  const timestamp = staleTs
    ? (Math.floor(Date.now() / 1000) - 3600).toString() // 1 hour old
    : Math.floor(Date.now() / 1000).toString();
  let signature = signPayload(rawBody, timestamp);

  if (badSig) {
    signature = Buffer.from('00'.repeat(64), 'hex').toString('base64');
  }

  const sentBody = tamperBody ? rawBody.replace(/}$/, ',"injected":true}') : rawBody;

  const req = request(app).post('/webhooks/telnyx').set('Content-Type', 'application/json');

  if (!omitHeaders) {
    req.set('telnyx-signature-ed25519', signature);
    req.set('telnyx-timestamp', timestamp);
  }

  return req.send(sentBody);
}

function messageEvent(eventType) {
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

describe('Telnyx Webhook Handler', () => {
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('health check works', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('responds 200 to a valid message.sent event', async () => {
    const response = await sendSigned(messageEvent('message.sent'));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });

  test('rejects request with missing signature headers (400)', async () => {
    const response = await sendSigned(messageEvent('message.sent'), { omitHeaders: true });
    expect(response.status).toBe(400);
    expect(response.text).toMatch(/Missing Telnyx signature/i);
  });

  test('rejects request with invalid signature (400)', async () => {
    const response = await sendSigned(messageEvent('message.sent'), { badSig: true });
    expect(response.status).toBe(400);
    expect(response.text).toMatch(/Invalid signature/i);
  });

  test('rejects when body is tampered after signing (400)', async () => {
    const response = await sendSigned(messageEvent('message.received'), { tamperBody: true });
    expect(response.status).toBe(400);
  });

  test('rejects a stale timestamp outside tolerance (400)', async () => {
    const response = await sendSigned(messageEvent('message.sent'), { staleTs: true });
    expect(response.status).toBe(400);
    expect(response.text).toMatch(/Invalid signature/i);
  });

  test('handles all common event types', async () => {
    for (const eventType of ['message.received', 'message.sent', 'message.finalized']) {
      const response = await sendSigned(messageEvent(eventType));
      expect(response.status).toBe(200);
    }
  });

  test('handles unknown event types gracefully (200)', async () => {
    const response = await sendSigned(messageEvent('message.some_future_event'));
    expect(response.status).toBe(200);
  });
});
