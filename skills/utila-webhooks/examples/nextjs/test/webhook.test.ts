import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

// Generate one RSA key pair for the whole suite. Utila signs with RSA-4096 +
// SHA-512 + PSS; a 2048-bit key exercises the identical verification path and
// keeps the test fast. The PUBLIC key stands in for the one from the Console.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

// Set the env var before the route handler reads it (it loads the key lazily).
process.env.UTILA_WEBHOOK_PUBLIC_KEY = publicKey.export({
  type: 'spki',
  format: 'pem',
}) as string;

const routeModulePromise = import('../app/webhooks/utila/route');

// Sign the raw body exactly the way Utila does: SHA-512 + PSS, base64-encoded.
function signUtilaRequest(rawBody: string): string {
  return crypto
    .sign('sha512', Buffer.from(rawBody), {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    })
    .toString('base64');
}

function makeRequest(body: string, headers: Record<string, string>): Request {
  return new Request('http://localhost/webhooks/utila', {
    method: 'POST',
    headers,
    body,
  });
}

describe('Utila webhook route', () => {
  it('returns 400 when the signature header is missing', async () => {
    const { POST } = await routeModulePromise;
    const req = makeRequest(
      JSON.stringify({ id: 'evt_1', type: 'WALLET_CREATED' }),
      { 'content-type': 'application/json' }
    );
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const { POST } = await routeModulePromise;
    const body = JSON.stringify({ id: 'evt_2', type: 'WALLET_CREATED' });
    const req = makeRequest(body, {
      'content-type': 'application/json',
      'x-utila-signature': Buffer.from('nope').toString('base64'),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 if the body is tampered after signing', async () => {
    const { POST } = await routeModulePromise;
    const original = JSON.stringify({
      id: 'evt_3',
      type: 'TRANSACTION_STATE_UPDATED',
      resource: 'vaults/v1/transactions/tx_1',
    });
    const signature = signUtilaRequest(original);
    const tampered = JSON.stringify({
      id: 'evt_3',
      type: 'TRANSACTION_STATE_UPDATED',
      resource: 'vaults/v1/transactions/tx_EVIL',
    });
    const req = makeRequest(tampered, {
      'content-type': 'application/json',
      'x-utila-signature': signature,
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a valid signature but invalid JSON', async () => {
    const { POST } = await routeModulePromise;
    const raw = 'this is not json';
    const req = makeRequest(raw, {
      'content-type': 'application/json',
      'x-utila-signature': signUtilaRequest(raw),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const { POST } = await routeModulePromise;
    const body = JSON.stringify({
      id: 'evt_4',
      vault: 'vaults/v1',
      type: 'TRANSACTION_CREATED',
      resourceType: 'TRANSACTION',
      resource: 'vaults/v1/transactions/tx_2',
    });
    const req = makeRequest(body, {
      'content-type': 'application/json',
      'x-utila-signature': signUtilaRequest(body),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it.each([
    ['TRANSACTION_CREATED', 'TRANSACTION', 'vaults/v1/transactions/tx_a'],
    ['TRANSACTION_STATE_UPDATED', 'TRANSACTION', 'vaults/v1/transactions/tx_b'],
    ['WALLET_CREATED', 'WALLET', 'vaults/v1/wallets/w_a'],
    ['WALLET_ADDRESS_CREATED', 'WALLET_ADDRESS', 'vaults/v1/wallets/w_a/addresses/0x1'],
    ['TRANSACTION_AML_SCREENING_RESULT_READY', 'TRANSACTION', 'vaults/v1/transactions/tx_c'],
    ['SOMETHING_ELSE', 'TRANSACTION', 'vaults/v1/transactions/tx_d'],
  ])('handles event type %s', async (type, resourceType, resource) => {
    const { POST } = await routeModulePromise;
    const body = JSON.stringify({
      id: `evt_${type}`,
      vault: 'vaults/v1',
      type,
      resourceType,
      resource,
    });
    const req = makeRequest(body, {
      'content-type': 'application/json',
      'x-utila-signature': signUtilaRequest(body),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });
});
