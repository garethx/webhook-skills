import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

// Import after module load; the route reads env lazily inside handlers.
const routeModulePromise = import('../app/webhooks/circle/route');

// Generate one ECDSA P-256 key pair for the whole suite. Circle signs with
// ECDSA_SHA_256 and returns a base64 DER (SPKI) public key.
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});

const TEST_KEY_ID = '879dc113-5ca4-4ff7-a6b7-54652083fcf8';

function signCircleRequest(
  rawBody: string,
  { keyId = TEST_KEY_ID }: { keyId?: string } = {}
): Record<string, string> {
  const signer = crypto.createSign('SHA256');
  signer.update(Buffer.from(rawBody));
  signer.end();
  const signature = signer.sign(privateKey, 'base64');
  return {
    'x-circle-signature': signature,
    'x-circle-key-id': keyId,
    'content-type': 'application/json',
  };
}

function makeRequest(body: string, headers: Record<string, string>): Request {
  return new Request('http://localhost/webhooks/circle', {
    method: 'POST',
    headers,
    body,
  });
}

describe('Circle webhook route', () => {
  it('returns 400 when Circle headers are missing', async () => {
    const { POST } = await routeModulePromise;
    const req = makeRequest('{"notificationType":"cpn.payment.completed"}', {
      'content-type': 'application/json',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const { POST, publicKeyCache } = await routeModulePromise;
    publicKeyCache.set(TEST_KEY_ID, publicKey);

    const payload = JSON.stringify({
      notificationType: 'cpn.payment.completed',
      notification: { id: 'pay_1', status: 'completed' },
    });
    const headers = signCircleRequest(payload);
    headers['x-circle-signature'] = Buffer.from('garbage').toString('base64');

    const res = await POST(makeRequest(payload, headers) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is tampered after signing', async () => {
    const { POST, publicKeyCache } = await routeModulePromise;
    publicKeyCache.set(TEST_KEY_ID, publicKey);

    const original = JSON.stringify({
      notificationType: 'cpn.payment.completed',
      notification: { id: 'pay_2', status: 'completed', amount: '10.00' },
    });
    const headers = signCircleRequest(original);
    const tampered = JSON.stringify({
      notificationType: 'cpn.payment.completed',
      notification: { id: 'pay_2', status: 'completed', amount: '999.00' },
    });

    const res = await POST(makeRequest(tampered, headers) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when signed with an unknown key id', async () => {
    const { POST } = await routeModulePromise;
    const payload = JSON.stringify({
      notificationType: 'cpn.payment.completed',
      notification: { id: 'pay_3', status: 'completed' },
    });
    const headers = signCircleRequest(payload, { keyId: 'unknown-key-id' });

    const res = await POST(makeRequest(payload, headers) as any);
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const { POST, publicKeyCache } = await routeModulePromise;
    publicKeyCache.set(TEST_KEY_ID, publicKey);

    const payload = JSON.stringify({
      notificationId: '2a7f0c8e-6b1d-4f9a-8c3e-1e2d3c4b5a60',
      notificationType: 'cpn.payment.completed',
      version: 2,
      notification: { id: 'pay_5', status: 'completed' },
    });
    const headers = signCircleRequest(payload);

    const res = await POST(makeRequest(payload, headers) as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ received: true });
  });

  it('responds 200 to the HEAD validation request', async () => {
    const { HEAD } = await routeModulePromise;
    const res = await HEAD();
    expect(res.status).toBe(200);
  });

  it.each([
    ['cpn.payment.completed', { notification: { id: 'pay_x', status: 'completed' } }],
    ['cpn.payment.failed', { notification: { id: 'pay_y', status: 'failed' } }],
    ['cpn.transaction.completed', { notification: { id: 'tx_1', status: 'completed' } }],
    ['cpn.transaction.broadcasted', { notification: { id: 'tx_2', status: 'broadcasted' } }],
    ['cpn.rfi.approved', { notification: { id: 'rfi_1', status: 'approved' } }],
    ['cpn.rfi.rejected', { notification: { id: 'rfi_2', status: 'rejected' } }],
    ['cpn.payment.delayed', { notification: { id: 'pay_z', status: 'delayed' } }],
    ['unknownType', { notification: { foo: 'bar' } }],
  ])('handles notificationType %s', async (notificationType, extra) => {
    const { POST, publicKeyCache } = await routeModulePromise;
    publicKeyCache.set(TEST_KEY_ID, publicKey);

    const payload = JSON.stringify({ notificationType, version: 2, ...(extra as object) });
    const headers = signCircleRequest(payload);

    const res = await POST(makeRequest(payload, headers) as any);
    expect(res.status).toBe(200);
  });
});
