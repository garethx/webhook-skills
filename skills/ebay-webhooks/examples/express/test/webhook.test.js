const request = require('supertest');
const crypto = require('crypto');

// Test env must be set before importing the app.
process.env.EBAY_VERIFICATION_TOKEN = 'test_verification_token_abcdef0123456789';
process.env.EBAY_ENDPOINT = 'https://example.com/webhooks/ebay';
process.env.EBAY_ENV = 'production';

const { app, keyCache } = require('../src/index');

// One ECDSA (P-256) key pair for the whole suite. eBay signs notifications with
// ECDSA + SHA-1 and exposes the matching public key via getPublicKey; here we
// preload the cache so no network/OAuth call is made.
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_KID = 'test-public-key-id-0001';
keyCache.set(TEST_KID, { pem: publicKey, expires: Date.now() + 60 * 60 * 1000 });

// Build a valid x-ebay-signature header for a raw body.
function signEbay(rawBody, { kid = TEST_KID, key = privateKey } = {}) {
  const signer = crypto.createSign('sha1');
  signer.update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody));
  signer.end();
  const signature = signer.sign(key, 'base64');
  const header = { alg: 'ecdsa', kid, signature, digest: 'SHA1' };
  return Buffer.from(JSON.stringify(header)).toString('base64');
}

function accountDeletionPayload(overrides = {}) {
  return JSON.stringify({
    metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION', schemaVersion: '1.0', deprecated: false },
    notification: {
      notificationId: 'ntf_1',
      eventDate: '2024-08-22T18:23:10.000Z',
      publishDate: '2024-08-22T18:23:10.100Z',
      publishAttemptCount: 1,
      data: { username: 'test_user', userId: 'ma8vp1jySJC', eiasToken: 'tok' },
    },
    ...overrides,
  });
}

describe('GET /webhooks/ebay (endpoint challenge)', () => {
  it('returns 200 with the SHA-256 challengeResponse', async () => {
    const challengeCode = 'abc123challenge';
    const expected = crypto
      .createHash('sha256')
      .update(challengeCode)
      .update(process.env.EBAY_VERIFICATION_TOKEN)
      .update(process.env.EBAY_ENDPOINT)
      .digest('hex');

    const res = await request(app)
      .get('/webhooks/ebay')
      .query({ challenge_code: challengeCode });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ challengeResponse: expected });
  });

  it('returns 400 when challenge_code is missing', async () => {
    const res = await request(app).get('/webhooks/ebay');
    expect(res.status).toBe(400);
  });
});

describe('POST /webhooks/ebay (notifications)', () => {
  it('returns 412 when the signature header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/ebay')
      .set('Content-Type', 'application/json')
      .send(accountDeletionPayload());
    expect(res.status).toBe(412);
  });

  it('returns 412 for an invalid signature', async () => {
    const payload = accountDeletionPayload();
    const badHeader = Buffer.from(
      JSON.stringify({ alg: 'ecdsa', kid: TEST_KID, signature: 'bogus', digest: 'SHA1' })
    ).toString('base64');

    const res = await request(app)
      .post('/webhooks/ebay')
      .set('x-ebay-signature', badHeader)
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(412);
  });

  it('returns 412 when the body is tampered after signing', async () => {
    const original = accountDeletionPayload();
    const header = signEbay(original);
    const tampered = accountDeletionPayload({ notification: { notificationId: 'evil' } });

    const res = await request(app)
      .post('/webhooks/ebay')
      .set('x-ebay-signature', header)
      .set('Content-Type', 'application/json')
      .send(tampered);
    expect(res.status).toBe(412);
  });

  it('returns 412 when signed with a different (unknown) key', async () => {
    const other = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const payload = accountDeletionPayload();
    // Same known kid (cache hit -> our public key) but signed by a foreign key.
    const header = signEbay(payload, { key: other.privateKey });

    const res = await request(app)
      .post('/webhooks/ebay')
      .set('x-ebay-signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(412);
  });

  it('returns 204 for a valid signature', async () => {
    const payload = accountDeletionPayload();
    const header = signEbay(payload);

    const res = await request(app)
      .post('/webhooks/ebay')
      .set('x-ebay-signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(204);
  });

  it.each([
    'MARKETPLACE_ACCOUNT_DELETION',
    'ITEM_AVAILABILITY',
    'ITEM_PRICE_REVISION',
    'PRIORITY_LISTING_REVISION',
    'SOME_UNHANDLED_TOPIC',
  ])('handles topic %s', async (topic) => {
    const payload = JSON.stringify({
      metadata: { topic },
      notification: { notificationId: `ntf_${topic}`, data: { userId: 'u', itemId: 'i', listingId: 'l' } },
    });
    const header = signEbay(payload);

    const res = await request(app)
      .post('/webhooks/ebay')
      .set('x-ebay-signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(204);
  });
});

describe('GET /health', () => {
  it('responds 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
