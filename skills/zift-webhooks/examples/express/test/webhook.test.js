const request = require('supertest');

const { app, ackBody, eventCategory } = require('../src/index');

const NOTIFICATION = {
  notificationId: 272638,
  eventCode: 'billing.subscription-created',
  eventDate: 1753670400000,
  dataType: 'subscription',
  data: { subscriptionId: 'sub_123' },
};

describe('ackBody', () => {
  it('echoes an integer notificationId, preserving its type', () => {
    const body = ackBody({ notificationId: 272638 });
    expect(body).toEqual({ notificationId: 272638 });
    expect(typeof body.notificationId).toBe('number');
  });

  it('echoes a string notificationId, preserving its type', () => {
    const body = ackBody({ notificationId: '272638' });
    expect(body).toEqual({ notificationId: '272638' });
    expect(typeof body.notificationId).toBe('string');
  });
});

describe('eventCategory', () => {
  it('classifies billing events', () => {
    expect(eventCategory('billing.subscription-created')).toBe('billing');
    expect(eventCategory('billing.payment-processed')).toBe('billing');
  });

  it('classifies processing events', () => {
    expect(eventCategory('processing.chargeback')).toBe('processing');
    expect(eventCategory('processing.noc')).toBe('processing');
  });

  it('returns unknown for other or non-string codes', () => {
    expect(eventCategory('other.thing')).toBe('unknown');
    expect(eventCategory(undefined)).toBe('unknown');
    expect(eventCategory(42)).toBe('unknown');
  });
});

describe('POST /webhooks/zift', () => {
  it('acknowledges by echoing the notificationId', async () => {
    const res = await request(app).post('/webhooks/zift').send(NOTIFICATION);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ notificationId: 272638 });
  });

  it('preserves a string notificationId in the acknowledgement', async () => {
    const res = await request(app)
      .post('/webhooks/zift')
      .send({ ...NOTIFICATION, notificationId: '272638' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ notificationId: '272638' });
  });

  it('returns 400 when notificationId is missing (cannot acknowledge)', async () => {
    const { notificationId, ...withoutId } = NOTIFICATION;
    const res = await request(app).post('/webhooks/zift').send(withoutId);
    expect(res.status).toBe(400);
  });

  it('handles billing and processing events', async () => {
    for (const eventCode of [
      'billing.subscription-created',
      'billing.payment-option-created',
      'processing.chargeback',
      'processing.return',
      'processing.noc',
    ]) {
      const res = await request(app)
        .post('/webhooks/zift')
        .send({ ...NOTIFICATION, eventCode });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ notificationId: 272638 });
    }
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
