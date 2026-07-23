import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/smartcar/route';

const AMT = 'test-application-management-token';

beforeAll(() => {
  process.env.SMARTCAR_MANAGEMENT_TOKEN = AMT;
});

/**
 * Sign a raw body exactly like Smartcar: hex-encoded HMAC-SHA256 of the raw
 * request body, keyed with the Application Management Token.
 */
function sign(rawBody: string): string {
  return crypto.createHmac('sha256', AMT).update(rawBody).digest('hex');
}

function post(rawBody: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/webhooks/smartcar', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: rawBody,
  });
}

const vehicleState = {
  eventId: '550e8400-e29b-41d4-a716-446655440000',
  eventType: 'VEHICLE_STATE',
  vehicleId: '9af13248-3b73-4c9d-9a4b-d937ce6bc8e2',
  data: {
    triggers: [{ code: 'tractionbattery-stateofcharge', name: 'StateOfCharge', group: 'TractionBattery' }],
    signals: [
      { code: 'tractionbattery-stateofcharge', name: 'StateOfCharge', group: 'TractionBattery', body: { unit: 'percent', value: 78 } },
    ],
  },
  meta: { version: '4.0', deliveryId: '48b25f8f-9fea-42e1-9085-81043682cbb8', mode: 'LIVE' },
};

describe('Smartcar Webhook Route', () => {
  it('responds to VERIFY with the hashed challenge', async () => {
    const challenge = '3a5c8f72-e6d9-4b1a-9f2e-8c7d6a5b4e3f';
    const body = JSON.stringify({ eventId: 'evt_verify', eventType: 'VERIFY', data: { challenge }, meta: { version: '4.0' } });

    const res = await POST(post(body));
    const json = await res.json();

    const expected = crypto.createHmac('sha256', AMT).update(challenge).digest('hex');
    expect(res.status).toBe(200);
    expect(json).toEqual({ challenge: expected });
  });

  it('returns 200 for a valid VEHICLE_STATE signature', async () => {
    const body = JSON.stringify(vehicleState);

    const res = await POST(post(body, { 'sc-signature': sign(body) }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ received: true });
  });

  it('returns 401 when the signature header is missing', async () => {
    const body = JSON.stringify(vehicleState);
    const res = await POST(post(body));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const body = JSON.stringify(vehicleState);
    const res = await POST(post(body, { 'sc-signature': 'deadbeef' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered payload', async () => {
    const signature = sign(JSON.stringify(vehicleState));
    const tampered = JSON.stringify({ ...vehicleState, vehicleId: 'attacker-controlled-id' });

    const res = await POST(post(tampered, { 'sc-signature': signature }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(post('not json'));
    expect(res.status).toBe(400);
  });
});
