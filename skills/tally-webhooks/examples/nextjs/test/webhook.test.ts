import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, verifyTallyWebhook } from '../app/webhooks/tally/route';

const signingSecret = 'test_tally_signing_secret';

beforeAll(() => {
  process.env.TALLY_SIGNING_SECRET = signingSecret;
});

/** Generate a valid Tally signature: base64(HMAC-SHA256(secret, rawBody)). */
function generateTallySignature(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
}

function samplePayload(): string {
  return JSON.stringify({
    eventId: 'evt_123',
    eventType: 'FORM_RESPONSE',
    createdAt: '2024-01-01T00:00:00.000Z',
    data: {
      responseId: 'resp_1',
      submissionId: 'sub_1',
      respondentId: 'rsp_1',
      formId: 'wMKq5R',
      formName: 'Contact form',
      fields: [
        { key: 'q1', label: 'Email', type: 'INPUT_EMAIL', value: 'ada@example.com' },
      ],
    },
  });
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature !== undefined) headers['Tally-Signature'] = signature;
  return new NextRequest('http://localhost/webhooks/tally', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyTallyWebhook', () => {
  it('validates a correct signature', () => {
    const body = samplePayload();
    const signature = generateTallySignature(body, signingSecret);
    expect(verifyTallyWebhook(body, signature, signingSecret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const body = samplePayload();
    expect(verifyTallyWebhook(body, 'invalid', signingSecret)).toBe(false);
  });

  it('rejects a missing signature', () => {
    const body = samplePayload();
    expect(verifyTallyWebhook(body, null, signingSecret)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const body = samplePayload();
    const signature = generateTallySignature(body, signingSecret);
    const tampered = body.replace('ada@example.com', 'evil@example.com');
    expect(verifyTallyWebhook(tampered, signature, signingSecret)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const body = samplePayload();
    const signature = generateTallySignature(body, signingSecret);
    expect(verifyTallyWebhook(body, signature, 'wrong_secret')).toBe(false);
  });
});

describe('POST /webhooks/tally (signing secret configured)', () => {
  it('returns 400 for a missing signature', async () => {
    const response = await POST(makeRequest(samplePayload()));
    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const response = await POST(makeRequest(samplePayload(), 'invalid_signature'));
    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const body = samplePayload();
    const signature = generateTallySignature(body, signingSecret);
    const response = await POST(makeRequest(body, signature));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });
});

describe('POST /webhooks/tally (no signing secret configured)', () => {
  beforeAll(() => {
    delete process.env.TALLY_SIGNING_SECRET;
  });

  afterAll(() => {
    process.env.TALLY_SIGNING_SECRET = signingSecret;
  });

  it('processes unsigned requests with a 200', async () => {
    const response = await POST(makeRequest(samplePayload()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });
});
