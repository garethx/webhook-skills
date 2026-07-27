const crypto = require('crypto');
const request = require('supertest');

// Realistic test secret (any string works; Paymob's is an opaque key)
process.env.PAYMOB_HMAC_SECRET = 'test_hmac_secret';

const { app, buildSignedString, transactionState } = require('../src/index');

const SECRET = process.env.PAYMOB_HMAC_SECRET;

// A representative Transaction Processed Callback transaction object.
function makeObj(overrides = {}) {
  return {
    id: 123456789,
    amount_cents: 10000,
    created_at: '2026-07-27T10:15:30.123456',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    integration_id: 987654,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    pending: false,
    success: true,
    owner: 543210,
    order: { id: 222333444 },
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
    ...overrides,
  };
}

// Generate a valid HMAC exactly as Paymob does: SHA512 hex over the ordered fields.
function sign(obj, secret = SECRET) {
  return crypto
    .createHmac('sha512', secret)
    .update(buildSignedString(obj))
    .digest('hex');
}

function post(obj, hmac) {
  return request(app)
    .post('/webhooks/paymob')
    .query({ hmac })
    .set('Content-Type', 'application/json')
    .send({ type: 'TRANSACTION', obj });
}

describe('Paymob webhook handler', () => {
  it('accepts a callback with a valid HMAC', async () => {
    const obj = makeObj();
    const res = await post(obj, sign(obj));
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('rejects a callback with an invalid HMAC', async () => {
    const obj = makeObj();
    const res = await post(obj, 'deadbeef');
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('rejects a callback when the hmac param is missing', async () => {
    const obj = makeObj();
    const res = await request(app)
      .post('/webhooks/paymob')
      .set('Content-Type', 'application/json')
      .send({ type: 'TRANSACTION', obj });
    expect(res.status).toBe(400);
  });

  it('rejects a tampered payload (amount changed after signing)', async () => {
    const obj = makeObj();
    const hmac = sign(obj); // sign the original
    const tampered = { ...obj, amount_cents: 1 }; // attacker lowers the amount
    const res = await post(tampered, hmac);
    expect(res.status).toBe(400);
  });

  it('rejects a non-transaction payload', async () => {
    const res = await request(app)
      .post('/webhooks/paymob')
      .query({ hmac: 'abc' })
      .set('Content-Type', 'application/json')
      .send({ type: 'SOMETHING_ELSE' });
    expect(res.status).toBe(400);
  });

  it('uses SHA512 (128-char hex digest)', () => {
    expect(sign(makeObj())).toHaveLength(128);
  });

  it('derives the transaction state from boolean fields', () => {
    expect(transactionState(makeObj())).toBe('succeeded');
    expect(transactionState(makeObj({ success: false, error_occured: true }))).toBe('failed');
    expect(transactionState(makeObj({ pending: true }))).toBe('pending');
    expect(transactionState(makeObj({ is_auth: true, is_capture: false }))).toBe('authorized');
    expect(transactionState(makeObj({ is_refunded: true }))).toBe('refunded');
    expect(transactionState(makeObj({ is_voided: true }))).toBe('voided');
  });
});
