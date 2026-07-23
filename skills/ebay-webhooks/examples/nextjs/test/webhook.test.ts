import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

beforeAll(() => {
  process.env.EBAY_VERIFICATION_TOKEN = 'test_verification_token_abcdef0123456789';
  process.env.EBAY_ENDPOINT = 'https://example.com/webhooks/ebay';
  process.env.EBAY_ENV = 'production';
});

// Import after env is set.
const routeModulePromise = import('../app/webhooks/ebay/route');

// One ECDSA (P-256) key pair for the suite. eBay signs ECDSA + SHA-1 and serves
// the public key via getPublicKey; we preload the cache to avoid any network.
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_KID = 'test-public-key-id-0001';

function signEbay(
  rawBody: string,
  { kid = TEST_KID, key = privateKey }: { kid?: string; key?: crypto.KeyObject } = {}
): string {
  const signer = crypto.createSign('sha1');
  signer.update(Buffer.from(rawBody));
  signer.end();
  const signature = signer.sign(key, 'base64');
  const header = { alg: 'ecdsa', kid, signature, digest: 'SHA1' };
  return Buffer.from(JSON.stringify(header)).toString('base64');
}

function accountDeletionPayload(): string {
  return JSON.stringify({
    metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION', schemaVersion: '1.0' },
    notification: {
      notificationId: 'ntf_1',
      data: { username: 'test_user', userId: 'ma8vp1jySJC', eiasToken: 'tok' },
    },
  });
}

function postRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['x-ebay-signature'] = signature;
  return new NextRequest('http://localhost/webhooks/ebay', {
    method: 'POST',
    headers,
    body,
  });
}

describe('GET /webhooks/ebay (endpoint challenge)', () => {
  it('returns 200 with the SHA-256 challengeResponse', async () => {
    const { GET } = await routeModulePromise;
    const challengeCode = 'abc123challenge';
    const expected = crypto
      .createHash('sha256')
      .update(challengeCode)
      .update(process.env.EBAY_VERIFICATION_TOKEN!)
      .update(process.env.EBAY_ENDPOINT!)
      .digest('hex');

    const req = new NextRequest(
      `http://localhost/webhooks/ebay?challenge_code=${challengeCode}`
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challengeResponse: expected });
  });

  it('returns 400 when challenge_code is missing', async () => {
    const { GET } = await routeModulePromise;
    const res = await GET(new NextRequest('http://localhost/webhooks/ebay'));
    expect(res.status).toBe(400);
  });
});

describe('POST /webhooks/ebay (notifications)', () => {
  it('returns 412 when the signature header is missing', async () => {
    const { POST } = await routeModulePromise;
    const res = await POST(postRequest(accountDeletionPayload()));
    expect(res.status).toBe(412);
  });

  it('returns 412 for an invalid signature', async () => {
    const { POST, keyCache } = await routeModulePromise;
    keyCache.set(TEST_KID, { pem: publicKey, expires: Date.now() + 60 * 60 * 1000 });

    const badHeader = Buffer.from(
      JSON.stringify({ alg: 'ecdsa', kid: TEST_KID, signature: 'bogus', digest: 'SHA1' })
    ).toString('base64');
    const res = await POST(postRequest(accountDeletionPayload(), badHeader));
    expect(res.status).toBe(412);
  });

  it('returns 412 when the body is tampered after signing', async () => {
    const { POST, keyCache } = await routeModulePromise;
    keyCache.set(TEST_KID, { pem: publicKey, expires: Date.now() + 60 * 60 * 1000 });

    const header = signEbay(accountDeletionPayload());
    const tampered = JSON.stringify({
      metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION' },
      notification: { notificationId: 'evil' },
    });
    const res = await POST(postRequest(tampered, header));
    expect(res.status).toBe(412);
  });

  it('returns 412 when signed with a different (unknown) key', async () => {
    const { POST, keyCache } = await routeModulePromise;
    keyCache.set(TEST_KID, { pem: publicKey, expires: Date.now() + 60 * 60 * 1000 });

    const other = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const payload = accountDeletionPayload();
    const header = signEbay(payload, { key: other.privateKey });
    const res = await POST(postRequest(payload, header));
    expect(res.status).toBe(412);
  });

  it('returns 204 for a valid signature', async () => {
    const { POST, keyCache } = await routeModulePromise;
    keyCache.set(TEST_KID, { pem: publicKey, expires: Date.now() + 60 * 60 * 1000 });

    const payload = accountDeletionPayload();
    const res = await POST(postRequest(payload, signEbay(payload)));
    expect(res.status).toBe(204);
  });

  it.each([
    'MARKETPLACE_ACCOUNT_DELETION',
    'ITEM_AVAILABILITY',
    'ITEM_PRICE_REVISION',
    'PRIORITY_LISTING_REVISION',
    'SOME_UNHANDLED_TOPIC',
  ])('handles topic %s', async (topic) => {
    const { POST, keyCache } = await routeModulePromise;
    keyCache.set(TEST_KID, { pem: publicKey, expires: Date.now() + 60 * 60 * 1000 });

    const payload = JSON.stringify({
      metadata: { topic },
      notification: { notificationId: `ntf_${topic}`, data: { userId: 'u', itemId: 'i', listingId: 'l' } },
    });
    const res = await POST(postRequest(payload, signEbay(payload)));
    expect(res.status).toBe(204);
  });
});
