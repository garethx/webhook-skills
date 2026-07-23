const request = require('supertest');
const crypto = require('crypto');
const zlib = require('zlib');

// Set test environment variables before importing app
process.env.NYLAS_WEBHOOK_SECRET = 'test_nylas_webhook_secret';

const { app, verifyNylasSignature } = require('../src/index');

const webhookSecret = process.env.NYLAS_WEBHOOK_SECRET;

/**
 * Generate a valid Nylas signature: hex HMAC-SHA256 of the raw body.
 * @param {Buffer|string} rawBody
 * @param {string} secret
 */
function signNylas(rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function cloudEvent(type, object = {}) {
  return JSON.stringify({
    specversion: '1.0',
    type,
    source: '/google/emails/realtime',
    id: 'evt-123',
    time: 1700000000,
    webhook_delivery_attempt: 1,
    data: {
      application_id: 'app-uuid',
      grant_id: 'grant-uuid',
      object,
    },
  });
}

describe('verifyNylasSignature', () => {
  it('returns true for a valid signature', () => {
    const payload = Buffer.from(cloudEvent('message.created', { subject: 'Hi' }));
    expect(verifyNylasSignature(payload, signNylas(payload, webhookSecret), webhookSecret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const payload = Buffer.from(cloudEvent('message.created'));
    expect(verifyNylasSignature(payload, 'deadbeef', webhookSecret)).toBe(false);
  });

  it('returns false for a missing signature', () => {
    const payload = Buffer.from(cloudEvent('message.created'));
    expect(verifyNylasSignature(payload, undefined, webhookSecret)).toBe(false);
  });

  it('returns false when the body is tampered with', () => {
    const payload = Buffer.from(cloudEvent('message.created', { subject: 'Hi' }));
    const sig = signNylas(payload, webhookSecret);
    const tampered = Buffer.from(cloudEvent('message.created', { subject: 'Tampered' }));
    expect(verifyNylasSignature(tampered, sig, webhookSecret)).toBe(false);
  });
});

describe('GET /webhooks/nylas (challenge handshake)', () => {
  it('echoes the challenge value verbatim with 200', async () => {
    const res = await request(app).get('/webhooks/nylas?challenge=abc123xyz');
    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123xyz');
  });
});

describe('POST /webhooks/nylas', () => {
  it('returns 401 for a missing signature', async () => {
    const payload = cloudEvent('message.created');
    const res = await request(app)
      .post('/webhooks/nylas')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(401);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 401 for an invalid signature', async () => {
    const payload = cloudEvent('message.created');
    const res = await request(app)
      .post('/webhooks/nylas')
      .set('Content-Type', 'application/json')
      .set('x-nylas-signature', 'invalid')
      .send(payload);
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = cloudEvent('message.created', { subject: 'Welcome' });
    const res = await request(app)
      .post('/webhooks/nylas')
      .set('Content-Type', 'application/json')
      .set('x-nylas-signature', signNylas(Buffer.from(payload), webhookSecret))
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('handles event.created', async () => {
    const payload = cloudEvent('event.created', { title: 'Standup' });
    const res = await request(app)
      .post('/webhooks/nylas')
      .set('Content-Type', 'application/json')
      .set('x-nylas-signature', signNylas(Buffer.from(payload), webhookSecret))
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('handles grant.expired', async () => {
    const payload = cloudEvent('grant.expired', {});
    const res = await request(app)
      .post('/webhooks/nylas')
      .set('Content-Type', 'application/json')
      .set('x-nylas-signature', signNylas(Buffer.from(payload), webhookSecret))
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('verifies against compressed bytes and decompresses gzip payloads', async () => {
    const raw = cloudEvent('message.created', { subject: 'Gzipped' });
    const gzipped = zlib.gzipSync(Buffer.from(raw));
    // Signature covers the COMPRESSED bytes. Send the gzip buffer as binary —
    // supertest re-serializes a Buffer if given Content-Type: application/json,
    // so we send it as octet-stream to preserve the exact signed bytes.
    const res = await request(app)
      .post('/webhooks/nylas')
      .set('Content-Type', 'application/octet-stream')
      .set('Content-Encoding', 'gzip')
      .set('x-nylas-signature', signNylas(gzipped, webhookSecret))
      .send(gzipped);
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
