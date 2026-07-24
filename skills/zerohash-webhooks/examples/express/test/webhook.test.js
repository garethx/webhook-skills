const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app.
process.env.ZEROHASH_WEBHOOK_SECRET = 'test_shared_secret';

const app = require('../src/index');

const webhookSecret = process.env.ZEROHASH_WEBHOOK_SECRET;

/**
 * Generate a valid Zero Hash signature (recommended scheme) for testing.
 * Signs `payload + timestamp` with HMAC-SHA256 (hex).
 */
function signWithTimestamp(payload, timestamp, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload + timestamp, 'utf8')
    .digest('hex');
}

/** Generate a valid legacy Zero Hash signature (payload only). */
function signLegacy(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

function tradeBody(status = 'terminated', tradeId = 'trade_123') {
  return JSON.stringify({
    trade_id: tradeId,
    status,
    symbol: 'BTC/USD',
    quantity: '0.5',
    price: '60000.00',
    side: 'buy',
  });
}

function balanceBody(accountType = 'available') {
  return JSON.stringify({
    account_group: '00SCXM',
    account_label: 'general',
    asset: 'USD',
    account_type: accountType,
    balance: '1500.00',
  });
}

describe('POST /webhooks/zerohash', () => {
  it('returns 400 when the signature header is missing', async () => {
    const response = await request(app)
      .post('/webhooks/zerohash')
      .set('Content-Type', 'application/json')
      .set('x-zh-hook-payload-type', 'trade_status_changed')
      .send(tradeBody());

    expect(response.status).toBe(400);
    expect(response.text).toContain('Missing Zero Hash signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const body = tradeBody();
    const timestamp = String(Date.now());

    const response = await request(app)
      .post('/webhooks/zerohash')
      .set('Content-Type', 'application/json')
      .set('x-zh-hook-payload-type', 'trade_status_changed')
      .set('x-zh-hook-timestamp', timestamp)
      .set('x-zh-hook-signature', 'deadbeef')
      .send(body);

    expect(response.status).toBe(400);
    expect(response.text).toContain('Invalid signature');
  });

  it('returns 400 for a tampered payload', async () => {
    const timestamp = String(Date.now());
    const original = tradeBody('terminated', 'trade_original');
    const signature = signWithTimestamp(original, timestamp, webhookSecret);
    const tampered = tradeBody('terminated', 'trade_tampered');

    const response = await request(app)
      .post('/webhooks/zerohash')
      .set('Content-Type', 'application/json')
      .set('x-zh-hook-payload-type', 'trade_status_changed')
      .set('x-zh-hook-timestamp', timestamp)
      .set('x-zh-hook-signature', signature)
      .send(tampered);

    expect(response.status).toBe(400);
  });

  it('returns 400 for an expired timestamp (replay protection)', async () => {
    const body = tradeBody();
    // 10 minutes ago — outside the ±5 minute tolerance.
    const timestamp = String(Date.now() - 10 * 60 * 1000);
    const signature = signWithTimestamp(body, timestamp, webhookSecret);

    const response = await request(app)
      .post('/webhooks/zerohash')
      .set('Content-Type', 'application/json')
      .set('x-zh-hook-payload-type', 'trade_status_changed')
      .set('x-zh-hook-timestamp', timestamp)
      .set('x-zh-hook-signature', signature)
      .send(body);

    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature (recommended scheme)', async () => {
    const body = tradeBody();
    const timestamp = String(Date.now());
    const signature = signWithTimestamp(body, timestamp, webhookSecret);

    const response = await request(app)
      .post('/webhooks/zerohash')
      .set('Content-Type', 'application/json')
      .set('x-zh-hook-payload-type', 'trade_status_changed')
      .set('x-zh-hook-timestamp', timestamp)
      .set('x-zh-hook-signature', signature)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });

  it('returns 200 for a valid legacy signature (payload only)', async () => {
    const body = balanceBody();
    const signature = signLegacy(body, webhookSecret);

    const response = await request(app)
      .post('/webhooks/zerohash')
      .set('Content-Type', 'application/json')
      .set('x-zh-hook-payload-type', 'account_balance.changed')
      .set('x-zh-hook-signature-256', signature)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });

  it('handles all payload types', async () => {
    const cases = [
      { type: 'trade_status_changed', body: tradeBody('accepted') },
      { type: 'trade_status_changed', body: tradeBody('active') },
      { type: 'account_balance.changed', body: balanceBody('collateral') },
      { type: 'unknown.type', body: tradeBody() },
    ];

    for (const { type, body } of cases) {
      const timestamp = String(Date.now());
      const signature = signWithTimestamp(body, timestamp, webhookSecret);

      const response = await request(app)
        .post('/webhooks/zerohash')
        .set('Content-Type', 'application/json')
        .set('x-zh-hook-payload-type', type)
        .set('x-zh-hook-timestamp', timestamp)
        .set('x-zh-hook-signature', signature)
        .send(body);

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
