const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.SYNCTERA_WEBHOOK_SECRET = 'test_signature_secret';

const app = require('../src/index');

const webhookSecret = process.env.SYNCTERA_WEBHOOK_SECRET;

/**
 * Generate a valid Synctera signature for testing.
 * HMAC-SHA256 over `${timestamp}.${payload}`, hex-encoded.
 */
function sign(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
}

function headers(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  return {
    'Content-Type': 'application/json',
    'Synctera-Signature': sign(payload, secret, timestamp),
    'Request-Timestamp': String(timestamp),
  };
}

describe('POST /webhooks/synctera', () => {
  it('returns 400 when signature headers are missing', async () => {
    const res = await request(app)
      .post('/webhooks/synctera')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = JSON.stringify({ type: 'ACCOUNT.UPDATED', id: 'acc_1' });

    const res = await request(app)
      .post('/webhooks/synctera')
      .set('Content-Type', 'application/json')
      .set('Synctera-Signature', 'deadbeef')
      .set('Request-Timestamp', String(Math.floor(Date.now() / 1000)))
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const original = JSON.stringify({ type: 'TRANSACTIONS.POSTED.CREATED', id: 'txn_1' });
    const signature = sign(original, webhookSecret);
    const tampered = JSON.stringify({ type: 'TRANSACTIONS.POSTED.CREATED', id: 'txn_evil' });

    const res = await request(app)
      .post('/webhooks/synctera')
      .set('Content-Type', 'application/json')
      .set('Synctera-Signature', signature)
      .set('Request-Timestamp', String(Math.floor(Date.now() / 1000)))
      .send(tampered);

    expect(res.status).toBe(400);
  });

  it('returns 400 for a stale timestamp (replay protection)', async () => {
    const payload = JSON.stringify({ type: 'ACCOUNT.UPDATED', id: 'acc_1' });
    const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago

    const res = await request(app)
      .post('/webhooks/synctera')
      .set(headers(payload, webhookSecret, oldTs))
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({ type: 'ACCOUNT.UPDATED', id: 'acc_1' });

    const res = await request(app)
      .post('/webhooks/synctera')
      .set(headers(payload, webhookSecret))
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a rolling secret (two "."-delimited signatures)', async () => {
    const payload = JSON.stringify({ type: 'TRANSACTIONS.POSTED.CREATED', id: 'txn_1' });
    const ts = Math.floor(Date.now() / 1000);
    const valid = sign(payload, webhookSecret, ts);
    // Simulate rotation: old (unknown) signature "." new valid signature
    const rotated = `${'0'.repeat(64)}.${valid}`;

    const res = await request(app)
      .post('/webhooks/synctera')
      .set('Content-Type', 'application/json')
      .set('Synctera-Signature', rotated)
      .set('Request-Timestamp', String(ts))
      .send(payload);

    expect(res.status).toBe(200);
  });

  it('handles different event types', async () => {
    // Only the first two are verified event names; the rest exercise the
    // default (unhandled) path.
    const eventTypes = [
      'ACCOUNT.UPDATED',
      'TRANSACTIONS.POSTED.CREATED',
      'UNKNOWN.EVENT',
    ];

    for (const type of eventTypes) {
      const payload = JSON.stringify({ type, id: 'obj_123' });
      const res = await request(app)
        .post('/webhooks/synctera')
        .set(headers(payload, webhookSecret))
        .send(payload);

      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
