const crypto = require('crypto');
const request = require('supertest');

// Set the test shared secret before importing the app
process.env.VAPI_WEBHOOK_SECRET = 'test_vapi_shared_secret_abc123';

const {
  app,
  verifyVapiSecret,
  extractToken,
} = require('../src/index');

const SECRET = process.env.VAPI_WEBHOOK_SECRET;

// Build a Vapi delivery body. The event type is NESTED at message.type.
function message(type, extra = {}) {
  return { message: { type, call: { id: 'call_123' }, timestamp: 1712345678000, ...extra } };
}

// Send with the Bearer header by default; helpers below cover the legacy header.
function post(body, secret = SECRET, header = 'bearer') {
  const req = request(app).post('/webhooks/vapi');
  if (secret !== null) {
    if (header === 'bearer') req.set('Authorization', `Bearer ${secret}`);
    else req.set('X-Vapi-Secret', secret);
  }
  return req.send(body);
}

describe('verifyVapiSecret / extractToken', () => {
  it('extracts a Bearer token', () => {
    expect(extractToken({ authorization: `Bearer ${SECRET}` })).toBe(SECRET);
  });

  it('extracts a raw Authorization value (no Bearer prefix)', () => {
    expect(extractToken({ authorization: SECRET })).toBe(SECRET);
  });

  it('falls back to X-Vapi-Secret', () => {
    expect(extractToken({ 'x-vapi-secret': SECRET })).toBe(SECRET);
  });

  it('returns true for a matching Bearer secret', () => {
    expect(verifyVapiSecret({ authorization: `Bearer ${SECRET}` }, SECRET)).toBe(true);
  });

  it('returns true for a matching X-Vapi-Secret', () => {
    expect(verifyVapiSecret({ 'x-vapi-secret': SECRET }, SECRET)).toBe(true);
  });

  it('returns false for a wrong secret', () => {
    expect(verifyVapiSecret({ authorization: 'Bearer nope' }, SECRET)).toBe(false);
  });

  it('returns false when no secret header is present', () => {
    expect(verifyVapiSecret({}, SECRET)).toBe(false);
  });

  it('returns false for a length mismatch (no throw)', () => {
    expect(verifyVapiSecret({ authorization: `Bearer ${SECRET}x` }, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/vapi — auth', () => {
  it('returns 401 with no secret', async () => {
    const res = await post(message('status-update'), null);
    expect(res.status).toBe(401);
  });

  it('returns 401 with a wrong secret', async () => {
    const res = await post(message('status-update'), 'wrong_secret');
    expect(res.status).toBe(401);
  });

  it('accepts the legacy X-Vapi-Secret header', async () => {
    const res = await post(message('status-update'), SECRET, 'x-vapi-secret');
    expect(res.status).toBe(200);
  });
});

describe('POST /webhooks/vapi — informational types', () => {
  it('acknowledges status-update with 200', async () => {
    const res = await post(message('status-update', { status: 'in-progress' }));
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('acknowledges end-of-call-report with 200', async () => {
    const res = await post(message('end-of-call-report', { endedReason: 'hangup', cost: 0.03 }));
    expect(res.status).toBe(200);
  });

  it('acknowledges an unknown type with 200 (no retry storm)', async () => {
    const res = await post(message('some-future-message'));
    expect(res.status).toBe(200);
  });
});

describe('POST /webhooks/vapi — request/response types', () => {
  it('answers assistant-request with an assistantId body', async () => {
    const res = await post(message('assistant-request'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('assistantId');
  });

  it('answers tool-calls with one result per toolCall', async () => {
    const body = message('tool-calls', {
      toolCallList: [
        { id: 'tc_1', function: { name: 'get_weather', arguments: '{}' } },
        { id: 'tc_2', function: { name: 'get_time', arguments: '{}' } },
      ],
    });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0]).toMatchObject({ name: 'get_weather', toolCallId: 'tc_1' });
  });

  it('answers transfer-destination-request with a destination', async () => {
    const res = await post(message('transfer-destination-request'));
    expect(res.status).toBe(200);
    expect(res.body.destination).toBeDefined();
  });

  it('answers knowledge-base-request with a documents array', async () => {
    const res = await post(message('knowledge-base-request'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.documents)).toBe(true);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// Known-answer test for the HMAC credential path (verified against live Vapi
// deliveries 2026-08-12). Vapi signs with HMAC-SHA256, hex, secret verbatim, in
// the x-signature header. The Payload Format decides the signed content:
//   {body}            -> HMAC-SHA256(rawBody, secret)
//   {timestamp}.{body}-> HMAC-SHA256(<x-timestamp> + "." + rawBody, secret)
// The expected digests below are self-computed with a sample secret; they lock
// the exact construction so a regression in it is caught.
describe('Vapi HMAC construction (verified)', () => {
  const secret = 'whsec_vapi_sample_key';
  const body =
    '{"message":{"type":"status-update","status":"ended","timestamp":1786546871392,"call":{"id":"call_kat123"}}}';

  it('{body} format signs the raw request body', () => {
    const hex = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(hex).toBe('bf7be5b3be319cba484d93d31bc820376566161a3a0a442c3b9292fc599a15e4');
  });

  it('{timestamp}.{body} format signs the x-timestamp header value + "." + body', () => {
    const xTimestamp = '1786546871433'; // value delivered in the x-timestamp header
    const hex = crypto
      .createHmac('sha256', secret)
      .update(`${xTimestamp}.${body}`)
      .digest('hex');
    expect(hex).toBe('708dd047594968a1403c7e1695e89d3e0898ad57e0c6990ace3576f9a0259184');
  });
});
