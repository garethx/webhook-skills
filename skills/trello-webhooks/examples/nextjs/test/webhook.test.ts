import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

const CALLBACK_URL = 'https://example.com/webhooks/trello';
const SECRET = 'test_trello_secret';

beforeAll(() => {
  process.env.TRELLO_SECRET = SECRET;
  process.env.TRELLO_CALLBACK_URL = CALLBACK_URL;
});

/**
 * Generate a valid Trello signature for testing:
 * base64(HMAC-SHA1(rawBody + callbackURL, secret))
 */
function generateTrelloSignature(payload: string, secret: string, callbackURL: string): string {
  return crypto
    .createHmac('sha1', secret)
    .update(Buffer.concat([Buffer.from(payload), Buffer.from(callbackURL)]))
    .digest('base64');
}

/**
 * Verify a Trello webhook signature (same logic as in route.ts).
 */
function verifyTrelloWebhook(
  rawBody: string,
  signature: string | null,
  secret: string,
  callbackURL: string
): boolean {
  if (!signature) return false;
  const content = Buffer.concat([Buffer.from(rawBody), Buffer.from(callbackURL)]);
  const expected = crypto.createHmac('sha1', secret).update(content).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

describe('Trello Signature Verification', () => {
  it('should validate a correct signature', () => {
    const payload = JSON.stringify({ action: { type: 'createCard' } });
    const signature = generateTrelloSignature(payload, SECRET, CALLBACK_URL);

    expect(verifyTrelloWebhook(payload, signature, SECRET, CALLBACK_URL)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ action: { type: 'createCard' } });

    expect(verifyTrelloWebhook(payload, 'invalid_signature', SECRET, CALLBACK_URL)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = JSON.stringify({ action: { type: 'createCard' } });

    expect(verifyTrelloWebhook(payload, null, SECRET, CALLBACK_URL)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ action: { type: 'updateCard', data: { amount: 100 } } });
    const signature = generateTrelloSignature(original, SECRET, CALLBACK_URL);
    const tampered = JSON.stringify({ action: { type: 'updateCard', data: { amount: 999 } } });

    expect(verifyTrelloWebhook(tampered, signature, SECRET, CALLBACK_URL)).toBe(false);
  });

  it('should reject a mismatched callback URL', () => {
    const payload = JSON.stringify({ action: { type: 'createCard' } });
    const signature = generateTrelloSignature(payload, SECRET, CALLBACK_URL);

    expect(
      verifyTrelloWebhook(payload, signature, SECRET, 'https://evil.example.com/webhooks/trello')
    ).toBe(false);
  });

  it('should reject a wrong secret', () => {
    const payload = JSON.stringify({ action: { type: 'createCard' } });
    const signature = generateTrelloSignature(payload, SECRET, CALLBACK_URL);

    expect(verifyTrelloWebhook(payload, signature, 'wrong_secret', CALLBACK_URL)).toBe(false);
  });
});

describe('Trello Signature Generation', () => {
  it('should produce a base64-encoded signature', () => {
    const payload = JSON.stringify({ action: { type: 'createCard' } });
    const signature = generateTrelloSignature(payload, SECRET, CALLBACK_URL);

    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('should include the callback URL in the signed content', () => {
    const payload = JSON.stringify({ action: { type: 'createCard' } });

    const sig1 = generateTrelloSignature(payload, SECRET, CALLBACK_URL);
    const sig2 = generateTrelloSignature(payload, SECRET, 'https://other.example.com/webhooks/trello');

    expect(sig1).not.toBe(sig2);
  });
});
