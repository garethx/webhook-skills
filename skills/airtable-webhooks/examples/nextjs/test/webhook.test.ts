import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, verifyAirtableSignature, summarizeChanges } from '../app/webhooks/airtable/route';

// macSecretBase64 is base64 — here it decodes to the bytes "test_secret_key".
const secret = Buffer.from('test_secret_key').toString('base64');

beforeAll(() => {
  process.env.AIRTABLE_MAC_SECRET_BASE64 = secret;
  // Leave the PAT unset so the handler skips the network fetch during tests.
  delete process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
});

/**
 * Generate a valid X-Airtable-Content-MAC value for testing (same algorithm as Airtable).
 */
function generateAirtableMac(rawBody: string, macSecretBase64: string): string {
  const key = Buffer.from(macSecretBase64, 'base64');
  return 'hmac-sha256=' + crypto.createHmac('sha256', key).update(rawBody, 'utf8').digest('hex');
}

function makeRequest(body: string, mac?: string): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (mac) headers.set('x-airtable-content-mac', mac);
  return new NextRequest('http://localhost/webhooks/airtable', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyAirtableSignature', () => {
  it('validates a correct signature', () => {
    const body = JSON.stringify({ base: { id: 'app1' } });
    expect(verifyAirtableSignature(body, generateAirtableMac(body, secret), secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyAirtableSignature('{"a":1}', 'hmac-sha256=deadbeef', secret)).toBe(false);
  });

  it('rejects a null header', () => {
    expect(verifyAirtableSignature('{}', null, secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const mac = generateAirtableMac('{"amount":100}', secret);
    expect(verifyAirtableSignature('{"amount":999}', mac, secret)).toBe(false);
  });

  it('rejects when the secret is not base64-decoded', () => {
    const body = '{"a":1}';
    const wrong = 'hmac-sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyAirtableSignature(body, wrong, secret)).toBe(false);
  });
});

describe('summarizeChanges', () => {
  it('counts created, changed, and destroyed records per table', () => {
    expect(
      summarizeChanges({
        baseTransactionNumber: 7,
        actionMetadata: { source: 'formSubmission' },
        changedTablesById: {
          tblABC: {
            createdRecordsById: { rec1: {}, rec2: {} },
            changedRecordsById: { rec3: {} },
            destroyedRecordIds: ['rec4'],
          },
        },
      })
    ).toEqual({
      transactionNumber: 7,
      source: 'formSubmission',
      tables: { tblABC: { created: 2, changed: 1, destroyed: 1 } },
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
    const res = await POST(makeRequest(ping));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(ping, 'hmac-sha256=notvalid'));
    expect(res.status).toBe(400);
  });

  it('returns 200 with an empty body for a valid signature', async () => {
    const res = await POST(makeRequest(ping, generateAirtableMac(ping, secret)));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});
