import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

const APP_KEY = 'test_app_key';
const APP_SECRET = 'test_app_secret';

// Set env before importing the route (module reads env at load time).
process.env.TIKTOK_SHOP_APP_KEY = APP_KEY;
process.env.TIKTOK_SHOP_APP_SECRET = APP_SECRET;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any) => Promise<Response>;
let verifyTikTokShop: (
  rawBody: string,
  authHeader: string | null,
  appKey: string,
  appSecret: string
) => boolean;

beforeAll(async () => {
  const mod = await import('../app/webhooks/tiktok-shop/route');
  POST = mod.POST;
  verifyTikTokShop = mod.verifyTikTokShop;
});

/**
 * Generate a valid TikTok Shop signature for testing.
 * signature = HMAC-SHA256(key = app_secret, message = app_key + rawBody), hex.
 */
function sign(rawBody: string, appKey = APP_KEY, appSecret = APP_SECRET): string {
  return crypto.createHmac('sha256', appSecret).update(appKey + rawBody).digest('hex');
}

function makeRequest(body: string, authHeader?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authHeader !== undefined) headers['authorization'] = authHeader;
  return new Request('http://localhost/webhooks/tiktok-shop', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyTikTokShop', () => {
  it('accepts a correct signature', () => {
    const body = JSON.stringify({ type: 1, data: { order_id: 'o_1' } });
    expect(verifyTikTokShop(body, sign(body), APP_KEY, APP_SECRET)).toBe(true);
  });

  it('rejects an incorrect signature', () => {
    const body = JSON.stringify({ type: 1 });
    expect(verifyTikTokShop(body, 'deadbeef', APP_KEY, APP_SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const original = JSON.stringify({ type: 1, data: { order_id: 'o_1' } });
    const signature = sign(original);
    const tampered = JSON.stringify({ type: 1, data: { order_id: 'o_hacked' } });
    expect(verifyTikTokShop(tampered, signature, APP_KEY, APP_SECRET)).toBe(false);
  });

  it('rejects a null header', () => {
    expect(verifyTikTokShop('{}', null, APP_KEY, APP_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/tiktok-shop', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const body = JSON.stringify({ type: 1, data: { order_id: 'o_1' } });
    const res = await POST(makeRequest(body, 'deadbeef'));
    expect(res.status).toBe(401);
  });

  it('returns 200 with an empty body for a valid signature', async () => {
    const body = JSON.stringify({
      type: 1,
      tts_notification_id: 'n_valid',
      shop_id: 's_1',
      data: { order_id: 'o_valid', order_status: 'AWAITING_SHIPMENT' },
    });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it('acknowledges all core event types', async () => {
    for (const type of [1, 2, 3, 4, 5, 99]) {
      const body = JSON.stringify({
        type,
        tts_notification_id: `n_${type}`,
        shop_id: 's_1',
        data: { order_id: 'o_1', product_id: 'p_1', package_id: 'pkg_1' },
      });
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
    }
  });
});
