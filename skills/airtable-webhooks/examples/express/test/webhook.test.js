const request = require('supertest');
const crypto = require('crypto');

// Set test environment before importing the app.
// macSecretBase64 is base64 — here it decodes to the bytes "test_secret_key".
process.env.AIRTABLE_MAC_SECRET_BASE64 = Buffer.from('test_secret_key').toString('base64');

const { app, verifyAirtableSignature, summarizeChanges } = require('../src/index');

/**
 * Generate a valid Airtable X-Airtable-Content-MAC value for testing.
 * Mirrors the provider: HMAC-SHA256 over the raw body, keyed on the
 * base64-DECODED secret, hex-encoded, prefixed with "hmac-sha256=".
 */
function generateAirtableMac(rawBody, macSecretBase64) {
  const key = Buffer.from(macSecretBase64, 'base64');
  return 'hmac-sha256=' + crypto.createHmac('sha256', key).update(rawBody).digest('hex');
}

const secret = process.env.AIRTABLE_MAC_SECRET_BASE64;

describe('verifyAirtableSignature', () => {
  it('returns true for a valid signature', () => {
    const body = Buffer.from(JSON.stringify({ base: { id: 'app1' } }));
    const mac = generateAirtableMac(body, secret);
    expect(verifyAirtableSignature(body, mac, secret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const body = Buffer.from('{"base":{"id":"app1"}}');
    expect(verifyAirtableSignature(body, 'hmac-sha256=deadbeef', secret)).toBe(false);
  });

  it('returns false when the header is missing', () => {
    const body = Buffer.from('{}');
    expect(verifyAirtableSignature(body, undefined, secret)).toBe(false);
  });

  it('returns false when the secret is not base64-decoded (wrong key usage)', () => {
    const body = Buffer.from('{"a":1}');
    // Sign using the raw base64 string as the key (a common mistake) ...
    const wrong = 'hmac-sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    // ... which must NOT verify against the correct base64-decoded key.
    expect(verifyAirtableSignature(body, wrong, secret)).toBe(false);
  });
});

describe('summarizeChanges', () => {
  it('counts created, changed, and destroyed records per table', () => {
    const payload = {
      baseTransactionNumber: 7,
      actionMetadata: { source: 'client' },
      changedTablesById: {
        tblABC: {
          createdRecordsById: { rec1: {}, rec2: {} },
          changedRecordsById: { rec3: {} },
          destroyedRecordIds: ['rec4'],
        },
      },
    };
    expect(summarizeChanges(payload)).toEqual({
      transactionNumber: 7,
      source: 'client',
      tables: { tblABC: { created: 2, changed: 1, destroyed: 1 } },
    });
  });

  it('handles a payload with no changed tables', () => {
    expect(summarizeChanges({ baseTransactionNumber: 1 })).toEqual({
      transactionNumber: 1,
      source: undefined,
      tables: {},
    });
  });
});

describe('POST /webhooks/airtable', () => {
  const ping = JSON.stringify({
    base: { id: 'appABC' },
    webhook: { id: 'achXYZ' },
    timestamp: '2022-02-01T21:25:05.663Z',
  });

  it('returns 400 for a missing signature', async () => {
    const res = await request(app)
      .post('/webhooks/airtable')
      .set('Content-Type', 'application/json')
      .send(ping);
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await request(app)
      .post('/webhooks/airtable')
      .set('Content-Type', 'application/json')
      .set('X-Airtable-Content-MAC', 'hmac-sha256=notvalid')
      .send(ping);
    expect(res.status).toBe(400);
  });

  it('returns 200 with an empty body for a valid signature', async () => {
    const mac = generateAirtableMac(Buffer.from(ping), secret);
    const res = await request(app)
      .post('/webhooks/airtable')
      .set('Content-Type', 'application/json')
      .set('X-Airtable-Content-MAC', mac)
      .send(ping);
    expect(res.status).toBe(200);
    expect(res.text).toBe('');
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
