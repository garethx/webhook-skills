import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { ackBody, eventCategory, POST } from '../app/webhooks/zift/route';

const NOTIFICATION = {
  notificationId: 272638,
  eventCode: 'billing.subscription-created',
  eventDate: 1753670400000,
  dataType: 'subscription',
  data: { subscriptionId: 'sub_123' },
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/zift', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

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
  it('classifies billing and processing events', () => {
    expect(eventCategory('billing.subscription-created')).toBe('billing');
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
    const res = await POST(makeRequest(NOTIFICATION));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notificationId: 272638 });
  });

  it('preserves a string notificationId in the acknowledgement', async () => {
    const res = await POST(makeRequest({ ...NOTIFICATION, notificationId: '272638' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notificationId: '272638' });
  });

  it('returns 400 when notificationId is missing (cannot acknowledge)', async () => {
    const { notificationId, ...withoutId } = NOTIFICATION;
    const res = await POST(makeRequest(withoutId));
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
      const res = await POST(makeRequest({ ...NOTIFICATION, eventCode }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ notificationId: 272638 });
    }
  });
});
