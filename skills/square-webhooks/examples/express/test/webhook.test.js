const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app.
// The notification URL is part of the signed content, so tests must sign with
// the same value the app verifies against.
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'test_signature_key';
process.env.SQUARE_WEBHOOK_URL = 'https://example.com/webhooks/square';

const { app, verifySquareSignature } = require('../src/index');

const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
const notificationUrl = process.env.SQUARE_WEBHOOK_URL;

/**
 * Generate a valid Square signature for testing:
 * base64(HMAC-SHA256(notificationUrl + body, signatureKey)).
 */
function generateSquareSignature(body, key = signatureKey, url = notificationUrl) {
  return crypto
    .createHmac('sha256', key)
    .update(url + body)
    .digest('base64');
}

describe('verifySquareSignature', () => {
  it('returns true for a valid signature', async () => {
    const body = JSON.stringify({ type: 'payment.created', event_id: 'evt_1' });
    const signature = generateSquareSignature(body);

    await expect(verifySquareSignature(body, signature)).resolves.toBe(true);
  });

  it('returns false for an invalid signature', async () => {
    const body = JSON.stringify({ type: 'payment.created' });

    await expect(verifySquareSignature(body, 'invalid_signature')).resolves.toBe(false);
  });

  it('returns false when the body is tampered with', async () => {
    const original = JSON.stringify({ type: 'payment.updated', amount: 100 });
    const signature = generateSquareSignature(original);
    const tampered = JSON.stringify({ type: 'payment.updated', amount: 999 });

    await expect(verifySquareSignature(tampered, signature)).resolves.toBe(false);
  });

  it('returns false when signed with the wrong notification URL', async () => {
    const body = JSON.stringify({ type: 'payment.created' });
    const signature = generateSquareSignature(body, signatureKey, 'https://evil.com/webhooks/square');

    await expect(verifySquareSignature(body, signature)).resolves.toBe(false);
  });

  // Known-answer test: locks the exact signing construction — HMAC-SHA256 over
  // (notificationUrl + rawBody), base64, key used verbatim. The digest is
  // self-computed (not a Square-produced signature; the ordering and encoding
  // were confirmed against a live delivery and the official SDK, 2026-08). This
  // guards against a regression that flips the order to (body + url) or decodes
  // the key, which a round-trip test using the same helper could otherwise mask.
  it('accepts a fixed known-answer signature (URL + body, base64)', async () => {
    const kaKey = 'test_signature_key';
    const kaUrl = 'https://example.com/webhooks/square';
    const kaBody =
      '{"merchant_id":"6SSW7HV8K2ST5","type":"order.updated",' +
      '"event_id":"11111111-2222-3333-4444-555555555555",' +
      '"created_at":"2026-08-04T12:00:00.000Z","data":{"type":"order_updated",' +
      '"id":"ORDER123","object":{"order_updated":{"order_id":"ORDER123",' +
      '"state":"OPEN","version":2}}}}';
    const expected = 'ti2bYNj+FEJ+f3yjR4wIWQZaNkVBPfOCNkZzUuc7SrE=';

    // The env key/url match kaKey/kaUrl, so the app verifies this directly.
    expect(kaKey).toBe(signatureKey);
    expect(kaUrl).toBe(notificationUrl);
    await expect(verifySquareSignature(kaBody, expected)).resolves.toBe(true);
  });
});

describe('POST /webhooks/square', () => {
  it('returns 400 when the signature header is missing', async () => {
    const response = await request(app)
      .post('/webhooks/square')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'payment.created' }));

    expect(response.status).toBe(400);
    expect(response.text).toBe('Missing signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify({ type: 'payment.created' });

    const response = await request(app)
      .post('/webhooks/square')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'invalid_signature')
      .send(body);

    expect(response.status).toBe(400);
    expect(response.text).toBe('Invalid signature');
  });

  it('returns 200 for a valid signature', async () => {
    const body = JSON.stringify({
      type: 'payment.updated',
      event_id: 'evt_123',
      data: { id: 'pay_abc' },
    });
    const signature = generateSquareSignature(body);

    const response = await request(app)
      .post('/webhooks/square')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', signature)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  it('handles the common Square event types', async () => {
    const types = [
      'payment.created',
      'payment.updated',
      'refund.created',
      'refund.updated',
      'invoice.payment_made',
      'order.created',
      'order.updated',
      'customer.created',
    ];

    for (const type of types) {
      const body = JSON.stringify({ type, event_id: `evt_${type}`, data: { id: 'obj_1' } });
      const signature = generateSquareSignature(body);

      const response = await request(app)
        .post('/webhooks/square')
        .set('Content-Type', 'application/json')
        .set('x-square-hmacsha256-signature', signature)
        .send(body);

      expect(response.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
