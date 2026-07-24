import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { verifyShoplineWebhook } from '../app/webhooks/shopline/route';

// Set test environment variables
beforeAll(() => {
  process.env.SHOPLINE_APP_SECRET = 'test_shopline_secret';
});

/**
 * Generate a valid SHOPLINE HMAC signature for testing.
 * SHOPLINE's documented encoding is base64 (Shopify-style).
 */
function generateShoplineSignature(
  payload: string,
  secret: string,
  encoding: 'base64' | 'hex' = 'base64'
): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest(encoding);
}

describe('SHOPLINE Signature Verification', () => {
  const appSecret = 'test_shopline_secret';

  it('should validate a correct base64 signature', () => {
    const payload = JSON.stringify({ id: 123, email: 'test@example.com' });
    const signature = generateShoplineSignature(payload, appSecret, 'base64');

    expect(verifyShoplineWebhook(payload, signature, appSecret)).toBe(true);
  });

  it('should validate a correct hex signature (fallback encoding)', () => {
    const payload = JSON.stringify({ id: 123 });
    const signature = generateShoplineSignature(payload, appSecret, 'hex');

    expect(verifyShoplineWebhook(payload, signature, appSecret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ id: 123 });

    expect(verifyShoplineWebhook(payload, 'invalid_signature', appSecret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = JSON.stringify({ id: 123 });

    expect(verifyShoplineWebhook(payload, null, appSecret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const originalPayload = JSON.stringify({ id: 123, amount: 100 });
    const signature = generateShoplineSignature(originalPayload, appSecret);
    const tamperedPayload = JSON.stringify({ id: 123, amount: 999 });

    expect(verifyShoplineWebhook(tamperedPayload, signature, appSecret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = JSON.stringify({ id: 123 });
    const signature = generateShoplineSignature(payload, appSecret);

    expect(verifyShoplineWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should handle an empty payload', () => {
    const payload = '';
    const signature = generateShoplineSignature(payload, appSecret);

    expect(verifyShoplineWebhook(payload, signature, appSecret)).toBe(true);
  });
});

describe('SHOPLINE Signature Generation', () => {
  it('should generate a base64-encoded signature', () => {
    const payload = '{"test":true}';
    const signature = generateShoplineSignature(payload, 'test_secret');

    // Base64 characters only
    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"id":123}';
    const secret = 'test_secret';

    expect(generateShoplineSignature(payload, secret)).toBe(
      generateShoplineSignature(payload, secret)
    );
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    expect(generateShoplineSignature('{"id":1}', secret)).not.toBe(
      generateShoplineSignature('{"id":2}', secret)
    );
  });
});
