import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.UPOLLO_WEBHOOK_SECRET = 'test_upollo_webhook_secret';
});

/**
 * Build an Upollo-Signature header for testing.
 * Upollo: HMAC-SHA512 of the raw body, keyed with the webhook secret, sent as
 * the `s0` part alongside a `t` timestamp. Docs don't specify hex vs base64, so
 * the handler accepts either.
 */
function buildUpolloSignature(
  payload: string,
  secret: string,
  { encoding = 'hex' as 'hex' | 'base64', t = 1706352000 } = {}
): string {
  const s0 = crypto.createHmac('sha512', secret).update(payload).digest(encoding);
  return `t:${t},s0:${s0}`;
}

/**
 * Parse an Upollo-Signature header (same logic as route.ts).
 */
function parseUpolloSignature(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(',').map((part) => {
      const i = part.indexOf(':');
      return [part.slice(0, i).trim(), part.slice(i + 1).trim()];
    })
  );
}

/**
 * Verify Upollo webhook signature (same logic as route.ts).
 */
function verifyUpolloWebhook(
  body: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }
  const { s0 } = parseUpolloSignature(signatureHeader);
  if (!s0) {
    return false;
  }
  const digest = crypto.createHmac('sha512', secret).update(body).digest();
  return [digest.toString('hex'), digest.toString('base64')].some((expected) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(s0), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

function normalizeEnum(value: unknown): string {
  return String(value ?? '').replace(/^(OUTCOME_|EVENT_TYPE_|FLAG_TYPE_)/, '');
}

const flaggedPayload = JSON.stringify({
  action: 'CHALLENGE',
  eventType: 'LOGIN',
  flags: [
    {
      type: 'ACCOUNT_SHARING',
      firstFlagged: '2026-07-01T12:00:00Z',
      mostRecentlyFlagged: '2026-07-27T09:00:00Z',
    },
  ],
  userInfo: { userId: 'user_123', userEmail: 'user@example.com' },
  deviceInfo: { deviceId: 'dev_abc', deviceClass: 'DEVICE_CLASS_DESKTOP' },
});

describe('Upollo Signature Verification', () => {
  const webhookSecret = 'test_upollo_webhook_secret';

  it('should validate a correct hex signature', () => {
    const signature = buildUpolloSignature(flaggedPayload, webhookSecret, { encoding: 'hex' });

    expect(verifyUpolloWebhook(flaggedPayload, signature, webhookSecret)).toBe(true);
  });

  it('should validate a correct base64 signature', () => {
    const signature = buildUpolloSignature(flaggedPayload, webhookSecret, { encoding: 'base64' });

    expect(verifyUpolloWebhook(flaggedPayload, signature, webhookSecret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    expect(verifyUpolloWebhook(flaggedPayload, 't:1706352000,s0:deadbeef', webhookSecret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    expect(verifyUpolloWebhook(flaggedPayload, null, webhookSecret)).toBe(false);
  });

  it('should reject a header with no s0 part', () => {
    expect(verifyUpolloWebhook(flaggedPayload, 't:1706352000', webhookSecret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = JSON.stringify({ userInfo: { userId: 'user_123' } });
    const signature = buildUpolloSignature(original, webhookSecret);
    const tampered = JSON.stringify({ userInfo: { userId: 'attacker' } });

    expect(verifyUpolloWebhook(tampered, signature, webhookSecret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const signature = buildUpolloSignature(flaggedPayload, webhookSecret);

    expect(verifyUpolloWebhook(flaggedPayload, signature, 'wrong_secret')).toBe(false);
  });

  it('should reject a SHA-256 digest (wrong algorithm)', () => {
    const sha256 = crypto.createHmac('sha256', webhookSecret).update(flaggedPayload).digest('hex');

    expect(verifyUpolloWebhook(flaggedPayload, `t:1706352000,s0:${sha256}`, webhookSecret)).toBe(false);
  });
});

describe('Upollo Signature Generation', () => {
  it('should produce a 128-char lowercase hex s0 (SHA-512)', () => {
    const header = buildUpolloSignature('{"test":true}', 'test_secret');
    const { s0 } = parseUpolloSignature(header);

    expect(s0).toMatch(/^[a-f0-9]{128}$/);
  });

  it('should generate consistent signatures', () => {
    expect(buildUpolloSignature(flaggedPayload, 'test_secret')).toBe(
      buildUpolloSignature(flaggedPayload, 'test_secret')
    );
  });
});

describe('normalizeEnum', () => {
  it('should strip Upollo enum prefixes', () => {
    expect(normalizeEnum('OUTCOME_CHALLENGE')).toBe('CHALLENGE');
    expect(normalizeEnum('EVENT_TYPE_LOGIN')).toBe('LOGIN');
    expect(normalizeEnum('FLAG_TYPE_UNSPECIFIED')).toBe('UNSPECIFIED');
  });

  it('should leave short-form values unchanged', () => {
    expect(normalizeEnum('ACCOUNT_SHARING')).toBe('ACCOUNT_SHARING');
  });
});
