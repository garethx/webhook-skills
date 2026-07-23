const crypto = require('crypto');
const request = require('supertest');

const PUBLIC_KEY = 'wh_pk_test_public_key';
const SECRET_KEY = 'wh_sk_test_secret_key';

// Configure env before importing the app
process.env.SOLIDGATE_WEBHOOK_PUBLIC_KEY = PUBLIC_KEY;
process.env.SOLIDGATE_WEBHOOK_SECRET_KEY = SECRET_KEY;

const { app, verifySolidgateSignature } = require('../src/index');

/**
 * Generate a valid Solidgate signature for testing.
 * Mirrors the provider algorithm: base64( hex( HMAC-SHA512(secret, pub + body + pub) ) )
 */
function generateSolidgateSignature(body, publicKey, secretKey) {
  const hex = crypto
    .createHmac('sha512', secretKey)
    .update(publicKey + body + publicKey)
    .digest('hex');
  return Buffer.from(hex).toString('base64');
}

describe('Solidgate signature verification (unit)', () => {
  it('validates a correct signature', () => {
    const body = JSON.stringify({ order: { order_id: 'ord_1', status: 'approved' } });
    const signature = generateSolidgateSignature(body, PUBLIC_KEY, SECRET_KEY);
    expect(verifySolidgateSignature(body, signature, PUBLIC_KEY, SECRET_KEY)).toBe(true);
  });

  it('validates when the raw body is a Buffer', () => {
    const body = JSON.stringify({ order: { order_id: 'ord_2' } });
    const signature = generateSolidgateSignature(body, PUBLIC_KEY, SECRET_KEY);
    expect(verifySolidgateSignature(Buffer.from(body), signature, PUBLIC_KEY, SECRET_KEY)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const body = JSON.stringify({ order: { order_id: 'ord_1' } });
    expect(verifySolidgateSignature(body, 'not-a-valid-signature', PUBLIC_KEY, SECRET_KEY)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify({ order: { order_id: 'ord_1', amount: 1000 } });
    const signature = generateSolidgateSignature(body, PUBLIC_KEY, SECRET_KEY);
    const tampered = JSON.stringify({ order: { order_id: 'ord_1', amount: 9999 } });
    expect(verifySolidgateSignature(tampered, signature, PUBLIC_KEY, SECRET_KEY)).toBe(false);
  });

  it('rejects a wrong secret key', () => {
    const body = JSON.stringify({ order: { order_id: 'ord_1' } });
    const signature = generateSolidgateSignature(body, PUBLIC_KEY, SECRET_KEY);
    expect(verifySolidgateSignature(body, signature, PUBLIC_KEY, 'wh_sk_wrong')).toBe(false);
  });

  it('produces a Base64-encoded hex string (128 hex chars => 172-char base64)', () => {
    const body = '{"test":true}';
    const signature = generateSolidgateSignature(body, PUBLIC_KEY, SECRET_KEY);
    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // SHA-512 hex digest is 128 chars; base64 of 128 bytes is 172 chars (with padding)
    expect(Buffer.from(signature, 'base64').toString('utf8')).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe('Solidgate webhook endpoint (integration)', () => {
  const body = JSON.stringify({ order: { order_id: 'ord_42', status: 'approved' } });
  const signature = generateSolidgateSignature(body, PUBLIC_KEY, SECRET_KEY);

  it('accepts a valid signed webhook', async () => {
    const res = await request(app)
      .post('/webhooks/solidgate')
      .set('Content-Type', 'application/json')
      .set('merchant', PUBLIC_KEY)
      .set('signature', signature)
      .set('solidgate-event-type', 'card_gate.order.updated')
      .set('solidgate-event-id', 'evt_123')
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects a webhook with an invalid signature', async () => {
    const res = await request(app)
      .post('/webhooks/solidgate')
      .set('Content-Type', 'application/json')
      .set('merchant', PUBLIC_KEY)
      .set('signature', 'invalid')
      .set('solidgate-event-type', 'card_gate.order.updated')
      .send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a webhook with a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/solidgate')
      .set('Content-Type', 'application/json')
      .set('merchant', PUBLIC_KEY)
      .send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a webhook from an unexpected merchant', async () => {
    const res = await request(app)
      .post('/webhooks/solidgate')
      .set('Content-Type', 'application/json')
      .set('merchant', 'wh_pk_someone_else')
      .set('signature', signature)
      .set('solidgate-event-type', 'card_gate.order.updated')
      .send(body);
    expect(res.status).toBe(400);
  });

  it('handles subscription.updated.v2 events', async () => {
    const subBody = JSON.stringify({ subscription: { id: 'sub_1', status: 'active' } });
    const subSig = generateSolidgateSignature(subBody, PUBLIC_KEY, SECRET_KEY);
    const res = await request(app)
      .post('/webhooks/solidgate')
      .set('Content-Type', 'application/json')
      .set('merchant', PUBLIC_KEY)
      .set('signature', subSig)
      .set('solidgate-event-type', 'subscription.updated.v2')
      .set('solidgate-event-id', 'evt_sub_1')
      .send(subBody);
    expect(res.status).toBe(200);
  });
});
