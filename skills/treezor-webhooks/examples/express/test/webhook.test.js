const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.TREEZOR_WEBHOOK_SECRET = 'test_webhook_secret';

const { app, canonicalize, verifyTreezorWebhook } = require('../src/index');

const SECRET = process.env.TREEZOR_WEBHOOK_SECRET;

/**
 * Generate a valid Treezor object_payload_signature for testing, using the same
 * canonical serialization the handler verifies against.
 */
function sign(objectPayload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(canonicalize(objectPayload), 'utf8')
    .digest('base64');
}

/**
 * Build a full Treezor webhook body with a valid signature.
 */
function buildEvent(webhook, objectPayload, secret = SECRET) {
  return {
    webhook,
    webhook_id: '6f3b3f9e-1c2d-4a5b-8e7f-0a1b2c3d4e5f',
    webhook_created_at: '1690000000.0000',
    object: webhook.split('.')[0],
    object_id: String(objectPayload.id ?? '1'),
    object_payload: objectPayload,
    object_payload_signature: sign(objectPayload, secret),
  };
}

describe('canonicalize', () => {
  it('uses compact separators (no spaces)', () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it('escapes forward slashes', () => {
    expect(canonicalize({ iban: 'a/b' })).toBe('{"iban":"a\\/b"}');
  });

  it('escapes non-ASCII to lowercase \\uXXXX', () => {
    expect(canonicalize({ name: 'Élodie' })).toBe('{"name":"\\u00c9lodie"}');
  });
});

describe('verifyTreezorWebhook', () => {
  it('returns true for a valid signature', () => {
    const payload = { payinId: 123, amount: '42.00' };
    expect(verifyTreezorWebhook(payload, sign(payload, SECRET), SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyTreezorWebhook({ id: 1 }, 'not-a-signature', SECRET)).toBe(false);
  });

  it('returns false for a missing signature', () => {
    expect(verifyTreezorWebhook({ id: 1 }, undefined, SECRET)).toBe(false);
  });

  it('returns false for the wrong secret', () => {
    const payload = { id: 1 };
    expect(verifyTreezorWebhook(payload, sign(payload, SECRET), 'wrong_secret')).toBe(false);
  });

  it('returns false when the payload is tampered', () => {
    const signature = sign({ amount: '10.00' }, SECRET);
    expect(verifyTreezorWebhook({ amount: '999.00' }, signature, SECRET)).toBe(false);
  });

  it('verifies payloads with non-ASCII characters', () => {
    const payload = { holder: 'José', city: 'Château' };
    expect(verifyTreezorWebhook(payload, sign(payload, SECRET), SECRET)).toBe(true);
  });
});

describe('POST /webhooks/treezor', () => {
  it('returns 400 for invalid JSON', async () => {
    const response = await request(app)
      .post('/webhooks/treezor')
      .set('Content-Type', 'text/plain')
      .send('not json');

    expect(response.status).toBe(400);
    expect(response.text).toBe('Invalid JSON');
  });

  it('returns 400 for a missing signature', async () => {
    const event = buildEvent('payin.create', { id: 123 });
    delete event.object_payload_signature;

    const response = await request(app)
      .post('/webhooks/treezor')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(event));

    expect(response.status).toBe(400);
    expect(response.text).toBe('Invalid signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const event = buildEvent('payin.create', { id: 123 });
    event.object_payload_signature = 'invalid';

    const response = await request(app)
      .post('/webhooks/treezor')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(event));

    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const event = buildEvent('payin.create', { payinId: 123, amount: '42.00', currency: 'EUR' });

    const response = await request(app)
      .post('/webhooks/treezor')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(event));

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  it('handles the documented event types', async () => {
    const events = [
      'payin.create',
      'payin.update',
      'payout.create',
      'payout.update',
      'transfer.create',
      'transaction.create',
      'cardtransaction.create',
      'card.create',
      'card.update',
      'wallet.create',
      'user.create',
      'user.update',
      'user.kycreview',
    ];

    for (const name of events) {
      const event = buildEvent(name, { id: 456 });
      const response = await request(app)
        .post('/webhooks/treezor')
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify(event));

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
