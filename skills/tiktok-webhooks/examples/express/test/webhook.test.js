const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.TIKTOK_CLIENT_SECRET = 'test_tiktok_client_secret';

const { app, verifyTikTokWebhook } = require('../src/index');

const SECRET = process.env.TIKTOK_CLIENT_SECRET;

/**
 * Build a valid TikTok-Signature header for a raw body.
 * signature = HMAC-SHA256(client_secret, "<t>.<raw_body>"), hex.
 */
function signHeader(rawBody, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const s = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
  return `t=${timestamp},s=${s}`;
}

const samplePayload = JSON.stringify({
  client_key: 'awx4example',
  event: 'video.publish.completed',
  create_time: 1633174587,
  user_openid: '0f9c1e2b-1234-5678-9abc-def012345678',
  content: JSON.stringify({ share_id: 'video.7107000000000000000' }),
});

describe('verifyTikTokWebhook', () => {
  it('returns true for a valid signature', () => {
    expect(verifyTikTokWebhook(samplePayload, signHeader(samplePayload), SECRET)).toBe(true);
  });

  it('returns false for a tampered body', () => {
    const header = signHeader(samplePayload);
    const tampered = samplePayload.replace('completed', 'failed');
    expect(verifyTikTokWebhook(tampered, header, SECRET)).toBe(false);
  });

  it('returns false for the wrong secret', () => {
    expect(verifyTikTokWebhook(samplePayload, signHeader(samplePayload), 'wrong_secret')).toBe(false);
  });

  it('returns false for a missing header', () => {
    expect(verifyTikTokWebhook(samplePayload, undefined, SECRET)).toBe(false);
  });

  it('returns false when the client secret is not set', () => {
    expect(verifyTikTokWebhook(samplePayload, signHeader(samplePayload), '')).toBe(false);
  });

  it('rejects a stale timestamp (replay protection)', () => {
    const old = Math.floor(Date.now() / 1000) - 10000;
    expect(verifyTikTokWebhook(samplePayload, signHeader(samplePayload, SECRET, old), SECRET)).toBe(false);
  });

  it('accepts a Buffer raw body', () => {
    const buf = Buffer.from(samplePayload, 'utf8');
    expect(verifyTikTokWebhook(buf, signHeader(samplePayload), SECRET)).toBe(true);
  });
});

describe('POST /webhooks/tiktok', () => {
  function post(rawBody, header) {
    const req = request(app)
      .post('/webhooks/tiktok')
      .set('Content-Type', 'application/json');
    if (header !== null) req.set('TikTok-Signature', header);
    return req.send(rawBody);
  }

  it('returns 200 for a valid signature', async () => {
    const res = await post(samplePayload, signHeader(samplePayload));
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('returns 401 for a missing signature', async () => {
    const res = await post(samplePayload, null);
    expect(res.status).toBe(401);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await post(samplePayload, 't=1633174587,s=deadbeef');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered payload', async () => {
    const header = signHeader(samplePayload);
    const res = await post(samplePayload.replace('publish', 'upload'), header);
    expect(res.status).toBe(401);
  });

  it.each([
    ['authorization.removed', { reason: 1 }],
    ['video.upload.failed', { share_id: 'video.700' }],
    ['video.publish.completed', { share_id: 'video.701' }],
    ['portability.download.ready', { request_id: 123456789 }],
  ])('handles %s with 200', async (event, content) => {
    const body = JSON.stringify({
      client_key: 'awx4example',
      event,
      create_time: 1633174587,
      user_openid: '0f9c1e2b',
      content: JSON.stringify(content),
    });
    const res = await post(body, signHeader(body));
    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
