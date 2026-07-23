const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.USPS_WEBHOOK_SECRET = 'test_usps_secret_32_chars_000000';

const { app, verifyUspsSignature } = require('../src/index');

/**
 * Build a USPS notification envelope and its X-HMAC signature.
 * USPS signs `timestamp + payload` where `payload` is the raw stringified JSON.
 */
function buildNotification(trackingObj, secret, { subscriptionType = 'TRACKING' } = {}) {
  const timestamp = '2026-07-23T14:32:00Z';
  const payload = JSON.stringify(trackingObj);
  const envelope = {
    subscriptionId: 'a1b2c3d4-0000-0000-0000-000000000000',
    subscriptionType,
    timestamp,
    payload,
    links: [],
  };
  const signature = crypto
    .createHmac('sha256', secret)
    .update(timestamp + payload)
    .digest('base64');
  return { body: JSON.stringify(envelope), signature };
}

describe('USPS Webhook Endpoint', () => {
  const secret = process.env.USPS_WEBHOOK_SECRET;

  describe('verifyUspsSignature', () => {
    it('should return true for a valid signature', () => {
      const timestamp = '2026-07-23T14:32:00Z';
      const payload = '{"trackingNumber":"940010","status":"Delivered"}';
      const sig = crypto.createHmac('sha256', secret).update(timestamp + payload).digest('base64');

      expect(verifyUspsSignature(timestamp, payload, sig, secret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      expect(verifyUspsSignature('t', 'p', 'invalid_signature', secret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      expect(verifyUspsSignature('t', 'p', undefined, secret)).toBe(false);
    });

    it('should return false when the payload is tampered', () => {
      const timestamp = '2026-07-23T14:32:00Z';
      const payload = '{"status":"Delivered"}';
      const sig = crypto.createHmac('sha256', secret).update(timestamp + payload).digest('base64');

      expect(verifyUspsSignature(timestamp, '{"status":"Alert"}', sig, secret)).toBe(false);
    });
  });

  describe('POST /webhooks/usps', () => {
    it('should return 400 for a missing signature', async () => {
      const { body } = buildNotification({ trackingNumber: '940010', status: 'Delivered' }, secret);

      const response = await request(app)
        .post('/webhooks/usps')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for an invalid signature', async () => {
      const { body } = buildNotification({ trackingNumber: '940010', status: 'Delivered' }, secret);

      const response = await request(app)
        .post('/webhooks/usps')
        .set('Content-Type', 'application/json')
        .set('X-HMAC', 'invalid_signature')
        .send(body);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid signature', async () => {
      const { body, signature } = buildNotification(
        { trackingNumber: '9400100000000000000000', status: 'Delivered' },
        secret
      );

      const response = await request(app)
        .post('/webhooks/usps')
        .set('Content-Type', 'application/json')
        .set('X-HMAC', signature)
        .send(body);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should accept the deprecated hmac-header alias', async () => {
      const { body, signature } = buildNotification(
        { trackingNumber: '9400100000000000000000', status: 'In Transit' },
        secret
      );

      const response = await request(app)
        .post('/webhooks/usps')
        .set('Content-Type', 'application/json')
        .set('hmac-header', signature)
        .send(body);

      expect(response.status).toBe(200);
    });

    it('should handle all tracking statuses', async () => {
      const statuses = [
        'Pre-Shipment',
        'Accepted',
        'In Transit',
        'Out for Delivery',
        'Delivered',
        'Available for Pickup',
        'Delivery Attempt',
        'Alert',
      ];

      for (const status of statuses) {
        const { body, signature } = buildNotification(
          { trackingNumber: '9400100000000000000000', status },
          secret
        );

        const response = await request(app)
          .post('/webhooks/usps')
          .set('Content-Type', 'application/json')
          .set('X-HMAC', signature)
          .send(body);

        expect(response.status).toBe(200);
      }
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
