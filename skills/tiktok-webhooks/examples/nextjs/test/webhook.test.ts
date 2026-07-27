import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

process.env.TIKTOK_CLIENT_SECRET = 'test_tiktok_client_secret';

// Import after env is set up.
const routeModulePromise = import('../app/webhooks/tiktok/route');

const SECRET = process.env.TIKTOK_CLIENT_SECRET as string;

/**
 * Build a valid TikTok-Signature header for a raw body.
 * signature = HMAC-SHA256(client_secret, "<t>.<raw_body>"), hex.
 */
function signHeader(rawBody: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
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

function makeRequest(body: string, header: string | null): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (header !== null) headers['tiktok-signature'] = header;
  return new Request('http://localhost/webhooks/tiktok', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyTikTokWebhook', () => {
  it('returns true for a valid signature', async () => {
    const { verifyTikTokWebhook } = await routeModulePromise;
    expect(verifyTikTokWebhook(samplePayload, signHeader(samplePayload), SECRET)).toBe(true);
  });

  it('returns false for a tampered body', async () => {
    const { verifyTikTokWebhook } = await routeModulePromise;
    const header = signHeader(samplePayload);
    expect(verifyTikTokWebhook(samplePayload.replace('completed', 'failed'), header, SECRET)).toBe(false);
  });

  it('returns false for the wrong secret', async () => {
    const { verifyTikTokWebhook } = await routeModulePromise;
    expect(verifyTikTokWebhook(samplePayload, signHeader(samplePayload), 'wrong_secret')).toBe(false);
  });

  it('returns false for a missing header', async () => {
    const { verifyTikTokWebhook } = await routeModulePromise;
    expect(verifyTikTokWebhook(samplePayload, null, SECRET)).toBe(false);
  });

  it('rejects a stale timestamp (replay protection)', async () => {
    const { verifyTikTokWebhook } = await routeModulePromise;
    const old = Math.floor(Date.now() / 1000) - 10000;
    expect(verifyTikTokWebhook(samplePayload, signHeader(samplePayload, SECRET, old), SECRET)).toBe(false);
  });
});

describe('POST /webhooks/tiktok', () => {
  it('returns 200 for a valid signature', async () => {
    const { POST } = await routeModulePromise;
    const res = await POST(makeRequest(samplePayload, signHeader(samplePayload)) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 401 for a missing signature', async () => {
    const { POST } = await routeModulePromise;
    const res = await POST(makeRequest(samplePayload, null) as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const { POST } = await routeModulePromise;
    const res = await POST(makeRequest(samplePayload, 't=1633174587,s=deadbeef') as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered payload', async () => {
    const { POST } = await routeModulePromise;
    const header = signHeader(samplePayload);
    const res = await POST(makeRequest(samplePayload.replace('publish', 'upload'), header) as never);
    expect(res.status).toBe(401);
  });

  it.each([
    ['authorization.removed', { reason: 1 }],
    ['video.upload.failed', { share_id: 'video.700' }],
    ['video.publish.completed', { share_id: 'video.701' }],
    ['portability.download.ready', { request_id: 123456789 }],
  ])('handles %s with 200', async (event, content) => {
    const { POST } = await routeModulePromise;
    const body = JSON.stringify({
      client_key: 'awx4example',
      event,
      create_time: 1633174587,
      user_openid: '0f9c1e2b',
      content: JSON.stringify(content),
    });
    const res = await POST(makeRequest(body, signHeader(body)) as never);
    expect(res.status).toBe(200);
  });
});
