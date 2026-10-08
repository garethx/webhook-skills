// Generated with: volume-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, test, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { PUT, POST } from '../app/webhooks/volume/route';
import {
  verifyVolumeSignature,
  parsePublicKey,
  clearKeyCache,
  reconcile,
  payments,
  processed,
} from '../lib/volume';

/*
 * Fixtures 1 and 2 are the two signed test calls published in Volume's
 * webhook docs (https://docs.getvolume.com/payments/payment-resources/webhooks),
 * signed with Volume's SANDBOX private key. They verify against the key served
 * by https://api.sandbox.volumepay.io/.well-known/signature/pem (embedded below
 * as served: bare base64 SPKI, no BEGIN/END lines). LIVE_PUBLIC_KEY is the key
 * served by the live URL — a different key.
 */
const SANDBOX_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsGNLZsbc2TJL1m6q4WVxexNoVxLoBkCVPKj38OdNrHTojKXG1nq0npuEJcIcknO0T+8tntbjxk34ouWlypNkTJOXuc6MGrlqSkHKMMJ1oWOrTvk4YcYaTaTnxQ4siI9evORAv/GqtYpVeILfIN8Z1TqoPJdH9XbgltD20s7bG4tdCYBdVqxcd2MqXOnuEU9qRrGegGqfFV2U8epw43drBwG81DI/4XgYV5bJFoSI6wLNUua4dEIDYonS+KWb6Hy9EwDgKHQTYSekVGu2O8NId2HybbRQ32C1qyussOlIMKsnUMTdUGm2FCRCFbMGPFduczdezZ/O+pFMcfgCFKs4mQIDAQAB';
const LIVE_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzVEMT+v6MpSwXElcrAlgyk/xlRPFHfhMP7Q/IGj9iN47pKNy8vWCm6v3rz1zT0T/0znnGJ4sU9eEMqbYVIghYcq4JBDIwXFyC5Jgc7xXXrtv4M3360Y7LI45UzbWvIIsNnIQg48V1S5DFtmGPxgt7FxppX/9aJHClVPCDBJ0WwfmMiuh3M50Xp3DXCEOKXhGrgRLejQouab2WGvPpunkgTY0z8wuLBJgtVHOo3yW1w7ZDGzDe0+ixL9JcCr/vmqmWMA+J7Kg4/9FIMGRXyNBPoPj5+lrY24/GAjakvDbw79KpUE7KgoKWrlTsuVLPjQ16uYiZKrDNeRZ0ASj/T8G3QIDAQAB';

const DOCS_COMPLETED = {
  body: '{"paymentId":"3f2a2b69-6d42-4050-9c4f-7e8849bf683c","merchantPaymentId":"806","paymentStatus":"COMPLETED","errorDescription":null,"paymentRequest":{"amount":24.23,"currency":"GBP","reference":"payment-reference"},"paymentRefundData":null,"paymentMetadata":{"some-data":"some-value"}}',
  authorization:
    'SHA256withRSA hnHI6qoo7p37NwtBFj332TWC9UUHFiMlwgKsI2XV+L1xKbIK4Vp+3b3bczrdM+8bLXNTRMvJJJ+5zr5uBXBhl9enN3Sfq/4q3gmdq1pGd0Gz0YaRUZxhNG2tkVq7LGtKeeWzg5PxfCy7PeD3D71C+SnUYa7fwT+KzKyPCMqk+uWjLws6pKysinOzh3aYmVhaW9DhH6gZtV2LLGQFHUsqtYClzOkQRxDePhJU8kf8tu8FyTYxJgN4+CZ7vXrD162L0zrcsHXZX1VvVS0GbguHz/JHIFRzqu+o3QpHoidnU+reXPoCQOBV420NaWwVy3Op5o3rFSAZvSwjwAczoQRfnw==',
};
const DOCS_FAILED = {
  body: '{"paymentId":"183b5eee-0fbf-4863-b55a-7a72af84db1a","merchantPaymentId":"937","paymentStatus":"FAILED","errorDescription":"Payment was rejected","paymentRequest":{"amount":24.23,"currency":"GBP","reference":"payment-reference"},"paymentRefundData":null,"paymentMetadata":{"some-data":"some-value"}}',
  authorization:
    'SHA256withRSA Th+qWdYLLh436/L0pZOgFgjfNa8jcLE5VTMM4IYEQz1yVkljudt0XMgShhWjqhy2+f0puV+FXfh3PWP3DMAV8FlgYdciyPpLqijy5Ruo2ALz0LPgunT/o6Y+7NAfWCnVDfWT17yqokeN+70QCX/Waq+2Ox8nu8a7bJVj6noiiMUfq5pLKKiQMqb1t7ebznrKGGvt0IUdQzIxfFQz/lT4V5Oar4lQZ3hNhjm/Rmde8ctJ3g2sVuY6Mqt5OiUZzWQl/zqEl5OR4zlzTrxCzlqyep9Yu5E3TRgz1J82gZMeZVFY7yxt/wj5Fre/zK6SWJmpShbqzK5fJ5D++4CS8nY+GA==',
};

// A local RSA-2048 keypair for sign/verify round trips — signs exactly the way
// Volume does: SHA256withRSA (PKCS#1 v1.5) over the raw body, standard base64.
const { publicKey: TEST_PUBLIC_PEM, privateKey: TEST_PRIVATE_KEY } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function sign(body: string, privateKey: crypto.KeyLike = TEST_PRIVATE_KEY) {
  return crypto.sign('sha256', Buffer.from(body), privateKey).toString('base64');
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    paymentId: crypto.randomUUID(),
    merchantPaymentId: 'order-1001',
    paymentStatus: 'COMPLETED',
    errorDescription: null,
    paymentRequest: { amount: 100.0, currency: 'GBP', reference: 'REF123' },
    paymentRefundData: null,
    paymentMetadata: { email: 'email@mail.com' },
    applicationId: '41f75930-ef98-40d8-b6f7-5ee2b01bd3b3',
    isExternal: false,
    ...overrides,
  };
}

async function send(body: string, authorization?: string, method: 'put' | 'post' = 'put') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authorization !== undefined) headers.Authorization = authorization;
  const req = new NextRequest('http://localhost:3000/webhooks/volume', {
    method: method.toUpperCase(),
    headers,
    body,
  });
  const res = await (method === 'put' ? PUT : POST)(req);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  delete process.env.VOLUME_PEM_URL;
  delete process.env.VOLUME_ENV;
  process.env.VOLUME_PUBLIC_KEY = TEST_PUBLIC_PEM;
  clearKeyCache();
  payments.clear();
  processed.clear();
  vi.restoreAllMocks();
});

describe('Volume docs fixtures (sandbox key)', () => {
  const sandboxKey = parsePublicKey(SANDBOX_PUBLIC_KEY);
  const sig = (f: { authorization: string }) => f.authorization.split(' ')[1];

  test('COMPLETED and FAILED fixtures verify with RSA PKCS#1 v1.5 + SHA-256', () => {
    expect(verifyVolumeSignature(Buffer.from(DOCS_COMPLETED.body), DOCS_COMPLETED.authorization, sandboxKey)).toBe(true);
    expect(verifyVolumeSignature(Buffer.from(DOCS_FAILED.body), DOCS_FAILED.authorization, sandboxKey)).toBe(true);
  });

  test('PSS padding rejects the real signature (the scheme is PKCS#1 v1.5)', () => {
    const ok = crypto.verify(
      'sha256',
      Buffer.from(DOCS_COMPLETED.body),
      { key: sandboxKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
      Buffer.from(sig(DOCS_COMPLETED), 'base64')
    );
    expect(ok).toBe(false);
  });

  test('changing one byte of the body fails', () => {
    const tampered = DOCS_COMPLETED.body.replace('24.23', '24.24');
    expect(verifyVolumeSignature(Buffer.from(tampered), DOCS_COMPLETED.authorization, sandboxKey)).toBe(false);
  });

  test('re-serialised JSON fails (verify raw bytes, not a parsed object)', () => {
    const reserialised = JSON.stringify(JSON.parse(DOCS_COMPLETED.body), null, 2);
    expect(verifyVolumeSignature(Buffer.from(reserialised), DOCS_COMPLETED.authorization, sandboxKey)).toBe(false);
  });

  test('a sandbox signature does not verify against the live key', () => {
    const liveKey = parsePublicKey(LIVE_PUBLIC_KEY);
    expect(verifyVolumeSignature(Buffer.from(DOCS_COMPLETED.body), DOCS_COMPLETED.authorization, liveKey)).toBe(false);
  });

  test('a signature swapped between fixtures fails', () => {
    expect(verifyVolumeSignature(Buffer.from(DOCS_COMPLETED.body), DOCS_FAILED.authorization, sandboxKey)).toBe(false);
  });

  test('end to end: the docs curl call is accepted with VOLUME_PUBLIC_KEY set to the sandbox key', async () => {
    process.env.VOLUME_PUBLIC_KEY = SANDBOX_PUBLIC_KEY;
    payments.set('3f2a2b69-6d42-4050-9c4f-7e8849bf683c', { merchantPaymentId: '806', amountMinor: 2423, currency: 'GBP' });
    const res = await send(DOCS_COMPLETED.body, DOCS_COMPLETED.authorization);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, processed: true });
  });
});

describe('Authorization header parsing', () => {
  const key = parsePublicKey(TEST_PUBLIC_PEM);
  const body = JSON.stringify(payload());

  test('accepts SHA256withRSA <base64>', () => {
    expect(verifyVolumeSignature(Buffer.from(body), `SHA256withRSA ${sign(body)}`, key)).toBe(true);
  });

  test('rejects a missing header', () => {
    expect(verifyVolumeSignature(Buffer.from(body), undefined, key)).toBe(false);
  });

  test('rejects any other scheme token', () => {
    expect(verifyVolumeSignature(Buffer.from(body), `Bearer ${sign(body)}`, key)).toBe(false);
    expect(verifyVolumeSignature(Buffer.from(body), `RSA-SHA256 ${sign(body)}`, key)).toBe(false);
  });

  test('rejects a bare signature with no scheme', () => {
    expect(verifyVolumeSignature(Buffer.from(body), sign(body), key)).toBe(false);
  });

  test('rejects base64url and hex encodings', () => {
    const raw = crypto.sign('sha256', Buffer.from(body), TEST_PRIVATE_KEY);
    expect(verifyVolumeSignature(Buffer.from(body), `SHA256withRSA ${raw.toString('base64url')}`, key)).toBe(false);
    expect(verifyVolumeSignature(Buffer.from(body), `SHA256withRSA ${raw.toString('hex')}`, key)).toBe(false);
  });

  test('rejects an HMAC "signature" (there is no shared secret)', () => {
    const hmac = crypto.createHmac('sha256', 'secret').update(body).digest('base64');
    expect(verifyVolumeSignature(Buffer.from(body), `SHA256withRSA ${hmac}`, key)).toBe(false);
  });

  test('rejects a signature from a different private key', () => {
    const { privateKey: other } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(verifyVolumeSignature(Buffer.from(body), `SHA256withRSA ${sign(body, other)}`, key)).toBe(false);
  });
});

describe('PUT /webhooks/volume', () => {
  test('accepts a valid COMPLETED webhook', async () => {
    const p = payload();
    payments.set(p.paymentId, { merchantPaymentId: 'order-1001', amountMinor: 10000, currency: 'GBP' });
    const body = JSON.stringify(p);
    const res = await send(body, `SHA256withRSA ${sign(body)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, processed: true });
  });

  test('also accepts POST', async () => {
    const p = payload({ paymentStatus: 'FAILED', errorDescription: 'Payment was rejected' });
    payments.set(p.paymentId, { amountMinor: 10000, currency: 'GBP' });
    const body = JSON.stringify(p);
    const res = await send(body, `SHA256withRSA ${sign(body)}`, 'post');
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(true);
  });

  test('handles COMPLETED then SETTLED for the same payment, deduping retries', async () => {
    const p = payload();
    payments.set(p.paymentId, { merchantPaymentId: 'order-1001', amountMinor: 10000, currency: 'GBP' });
    const completed = JSON.stringify(p);
    const settled = JSON.stringify({ ...p, paymentStatus: 'SETTLED' });

    expect((await send(completed, `SHA256withRSA ${sign(completed)}`)).body.processed).toBe(true);
    expect((await send(completed, `SHA256withRSA ${sign(completed)}`)).body.duplicate).toBe(true);
    expect((await send(settled, `SHA256withRSA ${sign(settled)}`)).body.processed).toBe(true);
  });

  test('acknowledges but does not process an amount mismatch', async () => {
    const p = payload({ paymentRequest: { amount: 1.0, currency: 'GBP' } });
    payments.set(p.paymentId, { amountMinor: 10000, currency: 'GBP' });
    const body = JSON.stringify(p);
    const res = await send(body, `SHA256withRSA ${sign(body)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, processed: false });
  });

  test('returns 400 for a missing Authorization header', async () => {
    const res = await send(JSON.stringify(payload()), undefined);
    expect(res.status).toBe(400);
  });

  test('returns 400 for a tampered body', async () => {
    const body = JSON.stringify(payload());
    const res = await send(body.replace('100', '999'), `SHA256withRSA ${sign(body)}`);
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid JSON with a valid signature', async () => {
    const body = 'not json';
    const res = await send(body, `SHA256withRSA ${sign(body)}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('returns 200 for an unknown paymentStatus (ignore what you do not handle)', async () => {
    const p = payload({ paymentStatus: 'SOMETHING_NEW' });
    payments.set(p.paymentId, { merchantPaymentId: 'order-1001', amountMinor: 10000, currency: 'GBP' });
    const body = JSON.stringify(p);
    expect((await send(body, `SHA256withRSA ${sign(body)}`)).status).toBe(200);
  });
});

describe('Public key resolution', () => {
  test('fetches the bare base64 key from VOLUME_PEM_URL and caches it', async () => {
    delete process.env.VOLUME_PUBLIC_KEY;
    process.env.VOLUME_PEM_URL = 'https://keys.example.test/pem';
    const bareKey = TEST_PUBLIC_PEM.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(bareKey, { status: 200 }));

    for (let i = 0; i < 2; i++) {
      const p = payload();
      payments.set(p.paymentId, { amountMinor: 10000, currency: 'GBP' });
      const body = JSON.stringify(p);
      expect((await send(body, `SHA256withRSA ${sign(body)}`)).status).toBe(200);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://keys.example.test/pem');
  });

  test('uses the sandbox URL by default and the live URL for VOLUME_ENV=live', async () => {
    delete process.env.VOLUME_PUBLIC_KEY;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(SANDBOX_PUBLIC_KEY));
    await send(DOCS_COMPLETED.body, DOCS_COMPLETED.authorization);
    expect(fetchMock.mock.lastCall?.[0]).toBe('https://api.sandbox.volumepay.io/.well-known/signature/pem');

    process.env.VOLUME_ENV = 'live';
    fetchMock.mockResolvedValue(new Response(LIVE_PUBLIC_KEY));
    const res = await send(DOCS_COMPLETED.body, DOCS_COMPLETED.authorization);
    expect(fetchMock.mock.lastCall?.[0]).toBe('https://api.volumepay.io/.well-known/signature/pem');
    expect(res.status).toBe(400); // sandbox-signed call rejected by the live key
  });

  test('fails closed (503) when the key cannot be fetched', async () => {
    delete process.env.VOLUME_PUBLIC_KEY;
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await send(DOCS_COMPLETED.body, DOCS_COMPLETED.authorization);
    expect(res.status).toBe(503);
  });

  test('fails closed (503) on a non-200 key response', async () => {
    delete process.env.VOLUME_PUBLIC_KEY;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await send(DOCS_COMPLETED.body, DOCS_COMPLETED.authorization);
    expect(res.status).toBe(503);
  });
});

describe('reconcile', () => {
  const record = { merchantPaymentId: 'order-1001', amountMinor: 10000, currency: 'GBP' };

  test('matches a consistent record', () => {
    expect(reconcile(payload() as any, record)).toEqual([]);
  });

  test('treats amount as major units', () => {
    expect(reconcile(payload({ paymentRequest: { amount: 24.23, currency: 'GBP' } }) as any, { amountMinor: 2423, currency: 'GBP' })).toEqual([]);
  });

  test('flags each mismatch', () => {
    const p = payload({ merchantPaymentId: 'other', paymentRequest: { amount: 99, currency: 'EUR' } });
    expect(reconcile(p as any, record)).toEqual(['amount mismatch', 'currency mismatch', 'merchantPaymentId mismatch']);
  });

  test('flags a missing record', () => {
    expect(reconcile(payload() as any, undefined)).toEqual(['no matching payment record']);
  });
});
