const request = require('supertest');
const crypto = require('crypto');

// Generate one RSA key pair for the whole suite. Utila signs with RSA-4096 +
// SHA-512 + PSS; a 2048-bit key exercises the identical verification path and
// keeps the test fast. The PUBLIC key stands in for the one from the Console.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

// Set the env var BEFORE requiring the app so loadPublicKey() picks it up.
process.env.UTILA_WEBHOOK_PUBLIC_KEY = publicKey.export({
  type: 'spki',
  format: 'pem',
});

const { app } = require('../src/index');

// Sign the raw body exactly the way Utila does: SHA-512 + PSS, base64-encoded.
function signUtilaRequest(rawBody) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  return crypto
    .sign('sha512', body, {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    })
    .toString('base64');
}

function post(payload, signature) {
  const req = request(app)
    .post('/webhooks/utila')
    .set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('x-utila-signature', signature);
  return req.send(payload);
}

describe('POST /webhooks/utila', () => {
  it('returns 400 when the signature header is missing', async () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'WALLET_CREATED' });
    const res = await post(payload);
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = JSON.stringify({ id: 'evt_2', type: 'WALLET_CREATED' });
    const bogus = Buffer.from('not-a-real-signature').toString('base64');
    const res = await post(payload, bogus);
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 if the body is tampered after signing', async () => {
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
    const res = await post(tampered, signature);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a valid signature but invalid JSON', async () => {
    const raw = 'this is not json';
    const signature = signUtilaRequest(raw);
    const res = await post(raw, signature);
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid JSON');
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({
      id: 'evt_4',
      vault: 'vaults/v1',
      type: 'TRANSACTION_CREATED',
      resourceType: 'TRANSACTION',
      resource: 'vaults/v1/transactions/tx_2',
    });
    const signature = signUtilaRequest(payload);
    const res = await post(payload, signature);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each([
    ['TRANSACTION_CREATED', 'TRANSACTION', 'vaults/v1/transactions/tx_a'],
    ['TRANSACTION_STATE_UPDATED', 'TRANSACTION', 'vaults/v1/transactions/tx_b'],
    ['WALLET_CREATED', 'WALLET', 'vaults/v1/wallets/w_a'],
    ['WALLET_ADDRESS_CREATED', 'WALLET_ADDRESS', 'vaults/v1/wallets/w_a/addresses/0x1'],
    ['TRANSACTION_AML_SCREENING_RESULT_READY', 'TRANSACTION', 'vaults/v1/transactions/tx_c'],
    ['SOMETHING_ELSE', 'TRANSACTION', 'vaults/v1/transactions/tx_d'],
  ])('handles event type %s', async (type, resourceType, resource) => {
    const payload = JSON.stringify({
      id: `evt_${type}`,
      vault: 'vaults/v1',
      type,
      resourceType,
      resource,
    });
    const signature = signUtilaRequest(payload);
    const res = await post(payload, signature);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});

describe('GET /health', () => {
  it('responds 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
