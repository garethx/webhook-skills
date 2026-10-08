const request = require('supertest');

const PAYMENT_SUB = '6289db02-d422-4e93-b65c-30fa973bd341';
const BUNDLE_SUB = '5505d055-89e9-48b7-913d-8414d9f8d3cd';

// Both subscriptions point at this endpoint, so both ids are allowed.
process.env.TIKKIE_SUBSCRIPTION_ID = `${PAYMENT_SUB},${BUNDLE_SUB}`;
// Re-fetch stays off unless a test turns it on (no network in tests).
delete process.env.TIKKIE_API_KEY;
delete process.env.TIKKIE_APP_TOKEN;

const { app, parseNotification, checkSubscriptionId, recordPath } = require('../src/index');

// Verbatim examples from the Tikkie API v2.3 OpenAPI spec.
const PAYMENT = {
  subscriptionId: PAYMENT_SUB,
  notificationType: 'PAYMENT',
  paymentRequestToken: 'qzdnzr8hnVWTgXXcFRLUMc',
  paymentToken: '21ef7413-cc3c-4c80-9272-6710fada28e4',
};
const REFUND = { ...PAYMENT, notificationType: 'REFUND', refundToken: 'abcdzr8hnVWTgXXcFRLUMc' };
const BUNDLE = {
  subscriptionId: BUNDLE_SUB,
  notificationType: 'BUNDLE',
  bundleId: 'af8fa035-3275-44fc-9a9b-a38c02efa114',
};

const post = (body) =>
  request(app).post('/webhooks/tikkie').set('Content-Type', 'application/json').send(body);

describe('parseNotification', () => {
  it.each([PAYMENT, REFUND, BUNDLE])('accepts a $notificationType notification', (n) => {
    expect(parseNotification(n)).toEqual({ ok: true, notification: n, known: true });
  });

  it('rejects a REFUND without refundToken', () => {
    const { refundToken, ...rest } = REFUND;
    expect(parseNotification(rest).ok).toBe(false);
  });

  it('rejects a missing subscriptionId', () => {
    const { subscriptionId, ...rest } = PAYMENT;
    expect(parseNotification(rest)).toEqual({ ok: false, error: 'Missing subscriptionId' });
  });

  it('marks unknown notificationType as known=false', () => {
    expect(parseNotification({ subscriptionId: PAYMENT_SUB, notificationType: 'NEW_THING' }).known).toBe(false);
  });
});

describe('checkSubscriptionId', () => {
  it('matches a configured id', () => {
    expect(checkSubscriptionId(PAYMENT_SUB, [PAYMENT_SUB])).toBe(true);
  });
  it('rejects an unknown id', () => {
    expect(checkSubscriptionId('00000000-0000-0000-0000-000000000000', [PAYMENT_SUB])).toBe(false);
  });
  it('skips the check when nothing is configured', () => {
    expect(checkSubscriptionId('anything', [])).toBe(true);
  });
});

describe('recordPath', () => {
  it('maps each type to its Tikkie API GET path', () => {
    expect(recordPath(PAYMENT)).toBe(
      '/paymentrequests/qzdnzr8hnVWTgXXcFRLUMc/payments/21ef7413-cc3c-4c80-9272-6710fada28e4'
    );
    expect(recordPath(REFUND)).toBe(
      '/paymentrequests/qzdnzr8hnVWTgXXcFRLUMc/payments/21ef7413-cc3c-4c80-9272-6710fada28e4/refunds/abcdzr8hnVWTgXXcFRLUMc'
    );
    expect(recordPath(BUNDLE)).toBe('/transactionbundles/af8fa035-3275-44fc-9a9b-a38c02efa114');
  });
});

describe('POST /webhooks/tikkie', () => {
  it.each([PAYMENT, REFUND, BUNDLE])('returns 200 for $notificationType', async (n) => {
    const res = await post(n);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 403 for an unknown subscriptionId', async () => {
    const res = await post({ ...PAYMENT, subscriptionId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await request(app)
      .post('/webhooks/tikkie')
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await post({ subscriptionId: PAYMENT_SUB, notificationType: 'PAYMENT' });
    expect(res.status).toBe(400);
  });

  it('returns 200 and ignores an unknown notificationType', async () => {
    const res = await post({ subscriptionId: PAYMENT_SUB, notificationType: 'SOMETHING_NEW' });
    expect(res.status).toBe(200);
  });

  it('ignores unknown extra fields', async () => {
    const res = await post({ ...PAYMENT, futureField: 'x' });
    expect(res.status).toBe(200);
  });
});

describe('re-fetch from the Tikkie API (mocked fetch)', () => {
  let fetchSpy;

  beforeEach(() => {
    process.env.TIKKIE_API_KEY = 'test_api_key';
    process.env.TIKKIE_APP_TOKEN = 'test_app_token';
    process.env.TIKKIE_API_BASE_URL = 'https://api-sandbox.abnamro.com/v2/tikkie';
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.TIKKIE_API_KEY;
    delete process.env.TIKKIE_APP_TOKEN;
    delete process.env.TIKKIE_API_BASE_URL;
  });

  it('fetches the payment with API-Key and X-App-Token and returns 200', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ paymentToken: PAYMENT.paymentToken, amountInCents: 1250 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const res = await post(PAYMENT);
    expect(res.status).toBe(200);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://api-sandbox.abnamro.com/v2/tikkie/paymentrequests/qzdnzr8hnVWTgXXcFRLUMc/payments/21ef7413-cc3c-4c80-9272-6710fada28e4'
    );
    expect(init.headers['API-Key']).toBe('test_api_key');
    expect(init.headers['X-App-Token']).toBe('test_app_token');
  });

  it('returns 403 when Tikkie 404s (forged tokens)', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 404 }));
    const res = await post(PAYMENT);
    expect(res.status).toBe(403);
  });

  it('returns 502 when the Tikkie API fails, so Tikkie retries', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 500 }));
    const res = await post(BUNDLE);
    expect(res.status).toBe(502);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
