import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, verifyDocuSignWebhook } from '../app/webhooks/docusign/route';

const SECRET = 'test_docusign_hmac_secret';

beforeAll(() => {
  process.env.DOCUSIGN_HMAC_SECRET = SECRET;
});

/**
 * Generate a valid DocuSign HMAC signature for testing.
 * HMAC-SHA256 over the raw body, base64-encoded.
 */
function generateDocuSignSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/webhooks/docusign', {
    method: 'POST',
    body,
    headers,
  });
}

describe('verifyDocuSignWebhook', () => {
  it('validates a correct signature in X-DocuSign-Signature-1', () => {
    const payload = JSON.stringify({ event: 'envelope-completed' });
    const signature = generateDocuSignSignature(payload, SECRET);

    expect(
      verifyDocuSignWebhook(payload, { 'x-docusign-signature-1': signature }, SECRET)
    ).toBe(true);
  });

  it('validates when any numbered header matches (key rotation)', () => {
    const payload = JSON.stringify({ event: 'envelope-sent' });
    const signature = generateDocuSignSignature(payload, SECRET);

    expect(
      verifyDocuSignWebhook(
        payload,
        {
          'x-docusign-signature-1': 'wrong_key_signature',
          'x-docusign-signature-2': signature,
        },
        SECRET
      )
    ).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const payload = JSON.stringify({ event: 'envelope-completed' });
    expect(
      verifyDocuSignWebhook(payload, { 'x-docusign-signature-1': 'invalid' }, SECRET)
    ).toBe(false);
  });

  it('rejects when no signature header is present', () => {
    const payload = JSON.stringify({ event: 'envelope-completed' });
    expect(verifyDocuSignWebhook(payload, {}, SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const original = JSON.stringify({ event: 'envelope-completed', amount: 100 });
    const signature = generateDocuSignSignature(original, SECRET);
    const tampered = JSON.stringify({ event: 'envelope-completed', amount: 999 });

    expect(
      verifyDocuSignWebhook(tampered, { 'x-docusign-signature-1': signature }, SECRET)
    ).toBe(false);
  });

  it('rejects with the wrong secret', () => {
    const payload = JSON.stringify({ event: 'envelope-completed' });
    const signature = generateDocuSignSignature(payload, SECRET);

    expect(
      verifyDocuSignWebhook(payload, { 'x-docusign-signature-1': signature }, 'wrong_secret')
    ).toBe(false);
  });
});

describe('POST /webhooks/docusign', () => {
  it('returns 400 for a missing signature', async () => {
    const payload = JSON.stringify({ event: 'envelope-completed' });
    const response = await POST(makeRequest(payload, { 'content-type': 'application/json' }));

    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = JSON.stringify({ event: 'envelope-completed' });
    const response = await POST(
      makeRequest(payload, { 'x-docusign-signature-1': 'invalid_signature' })
    );

    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({
      event: 'envelope-completed',
      data: { envelopeId: 'abc-123' },
    });
    const signature = generateDocuSignSignature(payload, SECRET);
    const response = await POST(
      makeRequest(payload, { 'x-docusign-signature-1': signature })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ received: true });
  });

  it('handles different DocuSign events', async () => {
    const events = [
      'envelope-sent',
      'envelope-delivered',
      'envelope-completed',
      'envelope-declined',
      'envelope-voided',
      'recipient-sent',
      'recipient-delivered',
      'recipient-completed',
      'recipient-declined',
      'recipient-authenticationfailed',
    ];

    for (const event of events) {
      const payload = JSON.stringify({ event, data: { envelopeId: 'abc-123' } });
      const signature = generateDocuSignSignature(payload, SECRET);
      const response = await POST(
        makeRequest(payload, { 'x-docusign-signature-1': signature })
      );

      expect(response.status).toBe(200);
    }
  });
});
