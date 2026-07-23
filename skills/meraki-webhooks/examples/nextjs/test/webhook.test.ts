import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';

const SECRET = 'test_shared_secret';

let warnedNoSecretConfigured = false;

/**
 * Verify a Meraki webhook (same logic as in app/webhooks/meraki/route.ts).
 *
 * Meraki has no signature header — the shared secret is a plaintext field
 * inside the JSON body. Verification is a timing-safe compare on that field.
 * The secret is optional: with none configured, TLS is the only protection, so
 * accept but warn rather than silently comparing '' to ''.
 */
function verifyMerakiWebhook(rawBody: string, secret: string): boolean {
  let payload: { sharedSecret?: unknown };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return false;
  }

  if (!secret) {
    if (!warnedNoSecretConfigured) {
      warnedNoSecretConfigured = true;
      console.warn(
        'MERAKI_WEBHOOK_SECRET is not set: no shared-secret verification is configured, ' +
          'so TLS is the only protection for these webhooks. Set a shared secret on the ' +
          'Meraki HTTP server and in MERAKI_WEBHOOK_SECRET to verify deliveries.'
      );
    }
    return true;
  }

  const received = Buffer.from(String(payload.sharedSecret ?? ''));
  const expected = Buffer.from(String(secret));

  if (received.length !== expected.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

function buildPayload(
  { sharedSecret = SECRET, alertTypeId = 'motion_alert', alertType = 'Motion detected' } = {}
): string {
  return JSON.stringify({
    version: '0.1',
    sharedSecret,
    sentAt: '2026-07-23T18:04:20.123Z',
    occurredAt: '2026-07-23T18:02:53.000Z',
    organizationId: '2930418',
    networkId: 'N_24329156',
    networkName: 'Main Office',
    deviceSerial: 'Q234-ABCD-5678',
    alertId: '0000000000000000',
    alertType,
    alertTypeId,
    alertData: {},
  });
}

describe('Meraki sharedSecret verification', () => {
  it('accepts a matching sharedSecret', () => {
    expect(verifyMerakiWebhook(buildPayload(), SECRET)).toBe(true);
  });

  it('rejects a mismatched sharedSecret', () => {
    expect(verifyMerakiWebhook(buildPayload({ sharedSecret: 'wrong' }), SECRET)).toBe(false);
  });

  it('rejects a missing sharedSecret', () => {
    const body = JSON.stringify({ alertTypeId: 'motion_alert' });
    expect(verifyMerakiWebhook(body, SECRET)).toBe(false);
  });

  it('rejects a non-JSON body', () => {
    expect(verifyMerakiWebhook('not json', SECRET)).toBe(false);
  });

  it('accepts and warns when no secret is configured (Meraki secret is optional)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Both a payload carrying a secret and one without are accepted, because
    // nothing was configured to compare against — TLS is the only protection.
    expect(verifyMerakiWebhook(buildPayload(), '')).toBe(true);
    expect(verifyMerakiWebhook(JSON.stringify({ alertTypeId: 'motion_alert' }), '')).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('accepts across all common alert types', () => {
    for (const alertTypeId of ['motion_alert', 'settings_changed', 'sensor_alert', 'stopped_reporting']) {
      expect(verifyMerakiWebhook(buildPayload({ alertTypeId }), SECRET)).toBe(true);
    }
  });
});
