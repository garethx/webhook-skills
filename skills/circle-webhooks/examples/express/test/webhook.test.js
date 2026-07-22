const request = require('supertest');
const crypto = require('crypto');

const { app, publicKeyCache } = require('../src/index');

// Generate one ECDSA P-256 key pair for the whole suite. Circle signs with
// ECDSA_SHA_256 and returns a base64 DER (SPKI) public key; a P-256 key pair
// exercises the exact same verification path.
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});

// The X-Circle-Key-Id is the UUID of the public key that signed the request.
const TEST_KEY_ID = '879dc113-5ca4-4ff7-a6b7-54652083fcf8';

// Pre-populate the cache so getPublicKey returns our test key instead of
// making a real API call to Circle.
publicKeyCache.set(TEST_KEY_ID, publicKey);

function signCircleRequest(rawBody, { keyId = TEST_KEY_ID } = {}) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  const signer = crypto.createSign('SHA256');
  signer.update(body);
  signer.end();
  const signature = signer.sign(privateKey, 'base64');
  return {
    'x-circle-signature': signature,
    'x-circle-key-id': keyId,
    'content-type': 'application/json',
  };
}

describe('POST /webhooks/circle', () => {
  it('returns 400 when Circle headers are missing', async () => {
    const res = await request(app)
      .post('/webhooks/circle')
      .set('Content-Type', 'application/json')
      .send('{"notificationType":"payments"}');
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = JSON.stringify({
      notificationType: 'payments',
      payment: { id: 'pay_1', status: 'paid' },
    });
    const headers = signCircleRequest(payload);
    headers['x-circle-signature'] = Buffer.from('not-the-real-signature').toString('base64');

    const res = await request(app)
      .post('/webhooks/circle')
      .set(headers)
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 if the body is tampered after signing', async () => {
    const original = JSON.stringify({
      notificationType: 'payments',
      payment: { id: 'pay_2', status: 'paid', amount: '10.00' },
    });
    const headers = signCircleRequest(original);
    const tampered = JSON.stringify({
      notificationType: 'payments',
      payment: { id: 'pay_2', status: 'paid', amount: '999.00' },
    });

    const res = await request(app)
      .post('/webhooks/circle')
      .set(headers)
      .send(tampered);

    expect(res.status).toBe(400);
  });

  it('returns 400 when signed with an unknown key id', async () => {
    const payload = JSON.stringify({
      notificationType: 'payments',
      payment: { id: 'pay_3', status: 'paid' },
    });
    // Sign correctly but reference a key id that is not in the cache and
    // cannot be fetched (no CIRCLE_API_KEY set) — verification must fail closed.
    const headers = signCircleRequest(payload, { keyId: 'unknown-key-id' });

    const res = await request(app)
      .post('/webhooks/circle')
      .set(headers)
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({
      notificationType: 'payments',
      version: 1,
      payment: { id: 'pay_5', status: 'paid' },
    });
    const headers = signCircleRequest(payload);

    const res = await request(app)
      .post('/webhooks/circle')
      .set(headers)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('responds 200 to the HEAD validation request', async () => {
    const res = await request(app).head('/webhooks/circle');
    expect(res.status).toBe(200);
  });

  it.each([
    ['paymentIntents', { paymentIntent: { id: 'pi_1', timeline: [{ status: 'active' }, { status: 'created' }] } }],
    ['payments', { payment: { id: 'pay_x', status: 'paid' } }],
    ['transfers', { transfer: { id: 'tr_1', status: 'complete' } }],
    ['payouts', { payout: { id: 'po_1', status: 'complete' } }],
    ['unknownType', { foo: 'bar' }],
  ])('handles notificationType %s', async (notificationType, extra) => {
    const payload = JSON.stringify({ notificationType, version: 1, ...extra });
    const headers = signCircleRequest(payload);

    const res = await request(app)
      .post('/webhooks/circle')
      .set(headers)
      .send(payload);

    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('responds 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
