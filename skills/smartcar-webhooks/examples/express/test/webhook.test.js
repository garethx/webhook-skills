const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app
process.env.SMARTCAR_MANAGEMENT_TOKEN = 'test-application-management-token';

const app = require('../src/index');

const AMT = process.env.SMARTCAR_MANAGEMENT_TOKEN;

/**
 * Sign a raw body exactly like Smartcar: hex-encoded HMAC-SHA256 of the raw
 * request body, keyed with the Application Management Token.
 */
function sign(rawBody) {
  return crypto.createHmac('sha256', AMT).update(rawBody).digest('hex');
}

const vehicleStatePayload = {
  eventId: '550e8400-e29b-41d4-a716-446655440000',
  eventType: 'VEHICLE_STATE',
  vehicleId: '9af13248-3b73-4c9d-9a4b-d937ce6bc8e2',
  data: {
    triggers: [{ code: 'tractionbattery-stateofcharge', name: 'StateOfCharge', group: 'TractionBattery' }],
    signals: [
      {
        code: 'tractionbattery-stateofcharge',
        name: 'StateOfCharge',
        group: 'TractionBattery',
        body: { unit: 'percent', value: 78 },
      },
    ],
  },
  meta: { version: '4.0', deliveryId: '48b25f8f-9fea-42e1-9085-81043682cbb8', mode: 'LIVE' },
};

const vehicleErrorPayload = {
  eventId: '5a537912-9ad3-424b-ba33-65a1704567e9',
  eventType: 'VEHICLE_ERROR',
  vehicleId: '123e4567-e89b-12d3-a456-426614174000',
  data: {
    errors: [{ type: 'COMPATIBILITY', code: 'VEHICLE_NOT_CAPABLE', state: 'ERROR' }],
  },
  meta: { version: '4.0', deliveryId: '48b25f8f-9fea-42e1-9085-81043682cbb8', mode: 'LIVE' },
};

describe('Smartcar Webhook Endpoint', () => {
  describe('VERIFY challenge', () => {
    it('responds 200 with the hashed challenge', async () => {
      const challenge = '3a5c8f72-e6d9-4b1a-9f2e-8c7d6a5b4e3f';
      const payload = JSON.stringify({
        eventId: 'evt_verify',
        eventType: 'VERIFY',
        data: { challenge },
        meta: { version: '4.0' },
      });

      const response = await request(app)
        .post('/webhooks/smartcar')
        .set('Content-Type', 'application/json')
        .send(payload);

      const expected = crypto.createHmac('sha256', AMT).update(challenge).digest('hex');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ challenge: expected });
    });
  });

  describe('Data events', () => {
    it('returns 200 for a valid VEHICLE_STATE signature', async () => {
      const payload = JSON.stringify(vehicleStatePayload);

      const response = await request(app)
        .post('/webhooks/smartcar')
        .set('Content-Type', 'application/json')
        .set('SC-Signature', sign(payload))
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('returns 200 for a valid VEHICLE_ERROR signature', async () => {
      const payload = JSON.stringify(vehicleErrorPayload);

      const response = await request(app)
        .post('/webhooks/smartcar')
        .set('Content-Type', 'application/json')
        .set('SC-Signature', sign(payload))
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('returns 401 when the signature header is missing', async () => {
      const payload = JSON.stringify(vehicleStatePayload);

      const response = await request(app)
        .post('/webhooks/smartcar')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('returns 401 for an invalid signature', async () => {
      const payload = JSON.stringify(vehicleStatePayload);

      const response = await request(app)
        .post('/webhooks/smartcar')
        .set('Content-Type', 'application/json')
        .set('SC-Signature', 'deadbeef')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('returns 401 for a tampered payload', async () => {
      const signature = sign(JSON.stringify(vehicleStatePayload));
      const tampered = JSON.stringify({
        ...vehicleStatePayload,
        vehicleId: 'attacker-controlled-id',
      });

      const response = await request(app)
        .post('/webhooks/smartcar')
        .set('Content-Type', 'application/json')
        .set('SC-Signature', signature)
        .send(tampered);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /health', () => {
    it('returns health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
