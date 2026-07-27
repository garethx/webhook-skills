import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables.
beforeAll(() => {
  process.env.AIPRISE_API_KEY = 'abcdef12-pqrs-abcd-pqrs-abcde0123456';
});

const apiKey = 'abcdef12-pqrs-abcd-pqrs-abcde0123456';

/**
 * Generate a valid AiPrise signature for testing — lowercase hex HMAC-SHA256
 * over the raw body, keyed with the API private key.
 */
function generateAiPriseSignature(payload: string, key: string): string {
  return crypto
    .createHmac('sha256', key)
    .update(payload)
    .digest('hex')
    .toLowerCase();
}

/**
 * Verify AiPrise callback signature (same logic as in route.ts).
 */
function verifyAiPriseWebhook(
  body: string,
  signatureHeader: string | null,
  key: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', key)
    .update(body)
    .digest('hex')
    .toLowerCase();

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.toLowerCase(), 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

function approvedPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    verification_session_id: '123408f2-2bbb-415f-aafc-92212341234',
    template_id: '123456-3434-2342-3453-b4218a4fb333',
    client_reference_id: null,
    aiprise_summary: {
      tags: [],
      reasons: [],
      notes: [],
      verification_result: 'APPROVED',
    },
    created_at: 1668974142818,
    ...overrides,
  });
}

describe('AiPrise Signature Verification', () => {
  it('should validate a correct signature', () => {
    const payload = approvedPayload();
    const signature = generateAiPriseSignature(payload, apiKey);

    expect(verifyAiPriseWebhook(payload, signature, apiKey)).toBe(true);
  });

  it('should accept an uppercase signature header', () => {
    const payload = approvedPayload();
    const signature = generateAiPriseSignature(payload, apiKey).toUpperCase();

    expect(verifyAiPriseWebhook(payload, signature, apiKey)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = approvedPayload();

    expect(verifyAiPriseWebhook(payload, 'deadbeef', apiKey)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = approvedPayload();

    expect(verifyAiPriseWebhook(payload, null, apiKey)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const payload = approvedPayload();
    const signature = generateAiPriseSignature(payload, apiKey);
    const tampered = approvedPayload({ verification_session_id: 'other' });

    expect(verifyAiPriseWebhook(tampered, signature, apiKey)).toBe(false);
  });

  it('should reject the wrong key', () => {
    const payload = approvedPayload();
    const signature = generateAiPriseSignature(payload, apiKey);

    expect(verifyAiPriseWebhook(payload, signature, 'wrong-key')).toBe(false);
  });
});

describe('AiPrise Signature Generation', () => {
  it('should generate lowercase hex signatures', () => {
    const signature = generateAiPriseSignature('{"test":true}', apiKey);

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = approvedPayload();

    expect(generateAiPriseSignature(payload, apiKey)).toBe(
      generateAiPriseSignature(payload, apiKey)
    );
  });

  it('should generate different signatures for different payloads', () => {
    const sig1 = generateAiPriseSignature('{"id":1}', apiKey);
    const sig2 = generateAiPriseSignature('{"id":2}', apiKey);

    expect(sig1).not.toBe(sig2);
  });
});
