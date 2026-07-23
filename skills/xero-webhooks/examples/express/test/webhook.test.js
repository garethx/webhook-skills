const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.XERO_WEBHOOK_KEY = 'test_xero_signing_key';

const { app, verifyXeroSignature } = require('../src/index');

/**
 * Generate a valid Xero signature for testing:
 * base64( HMAC-SHA256(rawBody, signingKey) )
 */
function generateXeroSignature(payload, signingKey) {
  return crypto
    .createHmac('sha256', signingKey)
    .update(payload)
    .digest('base64');
}

function samplePayload(overrides = {}) {
  return JSON.stringify({
    events: [
      {
        resourceUrl: 'https://api.xero.com/api.xro/2.0/Contacts/abc-123',
        resourceId: 'abc-123',
        eventDateUtc: '2024-05-01T12:00:00.000',
        eventType: 'CREATE',
        eventCategory: 'CONTACT',
        tenantId: 'tenant-1',
        tenantType: 'ORGANISATION',
        ...overrides,
      },
    ],
    firstEventSequence: 1,
    lastEventSequence: 1,
    entropy: 'abc',
  });
}

describe('Xero Webhook Endpoint', () => {
  const signingKey = process.env.XERO_WEBHOOK_KEY;

  describe('verifyXeroSignature', () => {
    it('returns true for a valid signature', () => {
      const payload = Buffer.from(samplePayload());
      const signature = generateXeroSignature(payload, signingKey);
      expect(verifyXeroSignature(payload, signature, signingKey)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      const payload = Buffer.from(samplePayload());
      expect(verifyXeroSignature(payload, 'not-a-valid-signature', signingKey)).toBe(false);
    });

    it('returns false when the signature header is missing', () => {
      const payload = Buffer.from(samplePayload());
      expect(verifyXeroSignature(payload, undefined, signingKey)).toBe(false);
    });

    it('returns false for a tampered body', () => {
      const payload = Buffer.from(samplePayload());
      const signature = generateXeroSignature(payload, signingKey);
      const tampered = Buffer.from(samplePayload({ resourceId: 'evil-999' }));
      expect(verifyXeroSignature(tampered, signature, signingKey)).toBe(false);
    });

    it('returns false when the key is wrong', () => {
      const payload = Buffer.from(samplePayload());
      const signature = generateXeroSignature(payload, signingKey);
      expect(verifyXeroSignature(payload, signature, 'wrong_key')).toBe(false);
    });
  });

  describe('POST /webhooks/xero', () => {
    it('returns 401 when the signature header is missing', async () => {
      const response = await request(app)
        .post('/webhooks/xero')
        .set('Content-Type', 'application/json')
        .send(samplePayload());

      expect(response.status).toBe(401);
    });

    it('returns 401 for an invalid signature (ITR bad-signature probe)', async () => {
      const payload = samplePayload();
      const response = await request(app)
        .post('/webhooks/xero')
        .set('Content-Type', 'application/json')
        .set('x-xero-signature', 'invalid-signature')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('returns 200 for a valid signature (ITR good-signature probe)', async () => {
      const payload = samplePayload();
      const signature = generateXeroSignature(Buffer.from(payload), signingKey);

      const response = await request(app)
        .post('/webhooks/xero')
        .set('Content-Type', 'application/json')
        .set('x-xero-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('returns 200 for a valid signature with an empty ITR-style body', async () => {
      const payload = JSON.stringify({ events: [], firstEventSequence: 0, lastEventSequence: 0, entropy: 'x' });
      const signature = generateXeroSignature(Buffer.from(payload), signingKey);

      const response = await request(app)
        .post('/webhooks/xero')
        .set('Content-Type', 'application/json')
        .set('x-xero-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('handles all event category/type combinations', async () => {
      const combos = [
        ['CONTACT', 'CREATE'],
        ['CONTACT', 'UPDATE'],
        ['INVOICE', 'CREATE'],
        ['INVOICE', 'UPDATE'],
        ['CREDITNOTE', 'CREATE'],
        ['CREDITNOTE', 'UPDATE'],
        ['SUBSCRIPTION', 'CREATE'],
        ['SUBSCRIPTION', 'UPDATE'],
      ];

      for (const [eventCategory, eventType] of combos) {
        const payload = samplePayload({ eventCategory, eventType });
        const signature = generateXeroSignature(Buffer.from(payload), signingKey);

        const response = await request(app)
          .post('/webhooks/xero')
          .set('Content-Type', 'application/json')
          .set('x-xero-signature', signature)
          .send(payload);

        expect(response.status).toBe(200);
      }
    });

    it('handles a batch of multiple events in one delivery', async () => {
      const payload = JSON.stringify({
        events: [
          { resourceUrl: 'u1', resourceId: 'r1', eventDateUtc: '2024-05-01T12:00:00.000', eventType: 'CREATE', eventCategory: 'CONTACT', tenantId: 't1', tenantType: 'ORGANISATION' },
          { resourceUrl: 'u2', resourceId: 'r2', eventDateUtc: '2024-05-01T12:00:01.000', eventType: 'UPDATE', eventCategory: 'INVOICE', tenantId: 't1', tenantType: 'ORGANISATION' },
        ],
        firstEventSequence: 1,
        lastEventSequence: 2,
        entropy: 'xyz',
      });
      const signature = generateXeroSignature(Buffer.from(payload), signingKey);

      const response = await request(app)
        .post('/webhooks/xero')
        .set('Content-Type', 'application/json')
        .set('x-xero-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
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
