// Sets env before requiring the app so module-level config picks it up.
process.env.PRAXIS_MERCHANT_SECRET = 'test_merchant_secret';

const crypto = require('crypto');
const request = require('supertest');

const SECRET = process.env.PRAXIS_MERCHANT_SECRET;

// Mirror the provider's algorithm to generate real signatures in tests:
// SHA-384 over the concatenated field values + Merchant Secret (NOT an HMAC).
const PAYMENT_FIELDS = [
  'merchant_id', 'application_key', 'timestamp', 'customer.customer_token',
  'session.order_id', 'transaction.tid', 'transaction.currency', 'transaction.amount',
  'transaction.conversion_rate', 'transaction.processed_currency', 'transaction.processed_amount',
];
const SUBSCRIPTION_FIELDS = [
  'event', 'merchant_id', 'application_key', 'cid', 'plan_id',
  'subscription_id', 'subscription_status', 'timestamp',
];

const at = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

function sign(body, secret) {
  const fields = body.event ? SUBSCRIPTION_FIELDS : PAYMENT_FIELDS;
  const data = fields.map((p) => String(at(body, p) ?? '')).join('') + secret;
  return crypto.createHash('sha384').update(data, 'utf8').digest('hex');
}

// Amounts are STRINGS, exactly as Praxis sends them.
const PAYMENT = {
  merchant_id: '123456',
  application_key: 'app_key_abc',
  timestamp: 1700000000,
  customer: { customer_token: 'cust_abc' },
  session: { order_id: 'order_789' },
  transaction: {
    tid: 'tx_555',
    currency: 'USD',
    amount: '10.00',
    conversion_rate: '1.00',
    processed_currency: 'USD',
    processed_amount: '10.00',
    transaction_status: 'approved',
  },
};

const SUBSCRIPTION = {
  event: 'PaymentSucceeded',
  merchant_id: '123456',
  application_key: 'app_key_abc',
  cid: 'cust_abc',
  plan_id: 'plan_1',
  subscription_id: 'sub_1',
  subscription_status: 'active',
  timestamp: 1700000000,
};

function loadApp() {
  jest.resetModules();
  return require('../src/index.js');
}

describe('Praxis webhook receiver (Express)', () => {
  test('accepts a valid Payment Notification and returns a signed status:0 ack', async () => {
    const app = loadApp();
    const payload = JSON.stringify(PAYMENT);
    const res = await request(app)
      .post('/webhooks/praxis')
      .set('gt-authentication', sign(PAYMENT, SECRET))
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(0);

    // The acknowledgement must be signed over status + timestamp + secret.
    const expectedAck = crypto
      .createHash('sha384')
      .update(`0${res.body.timestamp}${SECRET}`, 'utf8')
      .digest('hex');
    expect(res.headers['external-request-signature']).toBe(expectedAck);
  });

  test('accepts a valid Subscription Notification (event field present)', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/praxis')
      .set('gt-authentication', sign(SUBSCRIPTION, SECRET))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(SUBSCRIPTION));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(0);
  });

  test('rejects an invalid signature with 400', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/praxis')
      .set('gt-authentication', 'a'.repeat(96))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(PAYMENT));

    expect(res.status).toBe(400);
  });

  test('rejects a signature made with the wrong secret with 400', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/praxis')
      .set('gt-authentication', sign(PAYMENT, 'wrong_secret'))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(PAYMENT));

    expect(res.status).toBe(400);
  });

  test('rejects a tampered amount with 400 (signature no longer matches)', async () => {
    const app = loadApp();
    const sig = sign(PAYMENT, SECRET);
    const tampered = { ...PAYMENT, transaction: { ...PAYMENT.transaction, amount: '9999.00' } };
    const res = await request(app)
      .post('/webhooks/praxis')
      .set('gt-authentication', sig)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(tampered));

    expect(res.status).toBe(400);
  });

  test('rejects a missing gt-authentication header with 400', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/praxis')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(PAYMENT));

    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid JSON', async () => {
    const app = loadApp();
    const res = await request(app)
      .post('/webhooks/praxis')
      .set('gt-authentication', 'a'.repeat(96))
      .set('Content-Type', 'application/json')
      .send('{not json');

    expect(res.status).toBe(400);
  });
});
