const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.TIKTOK_SHOP_APP_KEY = 'test_app_key';
process.env.TIKTOK_SHOP_APP_SECRET = 'test_app_secret';

const app = require('../src/index');

const APP_KEY = process.env.TIKTOK_SHOP_APP_KEY;
const APP_SECRET = process.env.TIKTOK_SHOP_APP_SECRET;

/**
 * Generate a valid TikTok Shop signature for testing.
 * signature = HMAC-SHA256(key = app_secret, message = app_key + rawBody), hex.
 */
function sign(rawBody, appKey = APP_KEY, appSecret = APP_SECRET) {
  return crypto
    .createHmac('sha256', appSecret)
    .update(appKey + rawBody)
    .digest('hex');
}

describe('signature algorithm', () => {
  it('reproduces the official documented test vector', () => {
    // Reproducible example from the official webhooks overview
    // (partner.tiktokshop.com/docv2/page/tts-webhooks-overview):
    // app_key=abcdef, app_secret=123, expected HMAC below.
    const body =
      '{"type":1,"tts_notification_id":"7380066284010030890","shop_id":"7495540735365777507","timestamp":1718305585,"data":{"is_on_hold_order":true,"order_id":"576653688135258178","order_status":"UNPAID","update_time":1718305585}}';
    expect(sign(body, 'abcdef', '123')).toBe(
      '5dec0f11ec2f6783b8deee53c9ffbf8d024302f7c7e7fa55a35d17629031ac05'
    );
  });
});

describe('TikTok Shop Webhook Endpoint', () => {
  describe('POST /webhooks/tiktok-shop', () => {
    it('returns 401 for a missing Authorization header', async () => {
      const response = await request(app)
        .post('/webhooks/tiktok-shop')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(401);
    });

    it('returns 401 for an invalid signature', async () => {
      const payload = JSON.stringify({
        type: 1,
        tts_notification_id: 'n_1',
        shop_id: 's_1',
        data: { order_id: 'o_1', order_status: 'AWAITING_SHIPMENT' },
      });

      const response = await request(app)
        .post('/webhooks/tiktok-shop')
        .set('Content-Type', 'application/json')
        .set('Authorization', 'deadbeef')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('returns 401 for a tampered payload', async () => {
      const original = JSON.stringify({ type: 1, data: { order_id: 'o_1' } });
      const signature = sign(original);
      const tampered = JSON.stringify({ type: 1, data: { order_id: 'o_hacked' } });

      const response = await request(app)
        .post('/webhooks/tiktok-shop')
        .set('Content-Type', 'application/json')
        .set('Authorization', signature)
        .send(tampered);

      expect(response.status).toBe(401);
    });

    it('returns 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        type: 1,
        tts_notification_id: 'n_valid',
        shop_id: 's_1',
        timestamp: 1633174587,
        data: { order_id: 'o_valid', order_status: 'AWAITING_SHIPMENT' },
      });
      const signature = sign(payload);

      const response = await request(app)
        .post('/webhooks/tiktok-shop')
        .set('Content-Type', 'application/json')
        .set('Authorization', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('');
    });

    it('handles the core event types', async () => {
      const types = [1, 2, 3, 4, 5, 99]; // 99 = unknown, still acknowledged

      for (const type of types) {
        const payload = JSON.stringify({
          type,
          tts_notification_id: `n_${type}`,
          shop_id: 's_1',
          data: { order_id: 'o_1', product_id: 'p_1', package_id: 'pkg_1' },
        });
        const signature = sign(payload);

        const response = await request(app)
          .post('/webhooks/tiktok-shop')
          .set('Content-Type', 'application/json')
          .set('Authorization', signature)
          .send(payload);

        expect(response.status).toBe(200);
      }
    });
  });

  describe('GET /health', () => {
    it('returns health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
