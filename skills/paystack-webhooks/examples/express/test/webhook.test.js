const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app.
// Paystack signs with your secret key; any string works for the HMAC in tests.
process.env.PAYSTACK_SECRET_KEY = 'sk_test_paystack_secret';

const { app, verifyPaystackWebhook } = require('../src/index');

/**
 * Generate a valid Paystack signature for testing.
 * Matches Paystack's scheme: HMAC-SHA512 (hex) over the raw body.
 */
function generatePaystackSignature(payload, secret) {
  return crypto
    .createHmac('sha512', secret)
    .update(payload)
    .digest('hex');
}

describe('Paystack Webhook Endpoint', () => {
  const secret = process.env.PAYSTACK_SECRET_KEY;

  describe('verifyPaystackWebhook', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"event":"charge.success"}');
      const signature = generatePaystackSignature(payload, secret);

      expect(verifyPaystackWebhook(payload, signature, secret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"event":"charge.success"}');

      expect(verifyPaystackWebhook(payload, 'deadbeef', secret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"event":"charge.success"}');

      expect(verifyPaystackWebhook(payload, undefined, secret)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = Buffer.from('{"event":"charge.success","amount":100}');
      const signature = generatePaystackSignature(original, secret);
      const tampered = Buffer.from('{"event":"charge.success","amount":999}');

      expect(verifyPaystackWebhook(tampered, signature, secret)).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from('{"event":"charge.success"}');
      const signature = generatePaystackSignature(payload, secret);

      expect(verifyPaystackWebhook(payload, signature, 'sk_test_wrong')).toBe(false);
    });
  });

  describe('POST /webhooks/paystack', () => {
    function buildEvent(event, data) {
      return JSON.stringify({ event, data });
    }

    it('should return 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/paystack')
        .set('Content-Type', 'application/json')
        .send(buildEvent('charge.success', { reference: 'ref_1' }));

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for an invalid signature', async () => {
      const payload = buildEvent('charge.success', { reference: 'ref_1' });

      const response = await request(app)
        .post('/webhooks/paystack')
        .set('Content-Type', 'application/json')
        .set('X-Paystack-Signature', 'deadbeef')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid charge.success event', async () => {
      const payload = buildEvent('charge.success', {
        id: 302961,
        reference: 'qTPrJoy9Bx',
        amount: 10000,
        currency: 'NGN',
        status: 'success',
      });
      const signature = generatePaystackSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/paystack')
        .set('Content-Type', 'application/json')
        .set('X-Paystack-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle a transfer.success event', async () => {
      const payload = buildEvent('transfer.success', {
        reference: 'trf_ref_1',
        transfer_code: 'TRF_xxxx',
        amount: 5000,
      });
      const signature = generatePaystackSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/paystack')
        .set('Content-Type', 'application/json')
        .set('X-Paystack-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle a transfer.failed event', async () => {
      const payload = buildEvent('transfer.failed', {
        reference: 'trf_ref_2',
        transfer_code: 'TRF_yyyy',
      });
      const signature = generatePaystackSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/paystack')
        .set('Content-Type', 'application/json')
        .set('X-Paystack-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle a refund.processed event', async () => {
      const payload = buildEvent('refund.processed', {
        transaction_reference: 'qTPrJoy9Bx',
        amount: 10000,
        status: 'processed',
      });
      const signature = generatePaystackSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/paystack')
        .set('Content-Type', 'application/json')
        .set('X-Paystack-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle a subscription.create event', async () => {
      const payload = buildEvent('subscription.create', {
        subscription_code: 'SUB_xxxx',
        status: 'active',
      });
      const signature = generatePaystackSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/paystack')
        .set('Content-Type', 'application/json')
        .set('X-Paystack-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle an invoice.payment_failed event', async () => {
      const payload = buildEvent('invoice.payment_failed', {
        invoice_code: 'INV_xxxx',
        subscription: { subscription_code: 'SUB_xxxx' },
      });
      const signature = generatePaystackSignature(payload, secret);

      const response = await request(app)
        .post('/webhooks/paystack')
        .set('Content-Type', 'application/json')
        .set('X-Paystack-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
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
