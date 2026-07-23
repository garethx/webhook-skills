import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.PERSONA_WEBHOOK_SECRET = 'wbhsec_test_signing_secret_value';
});

import { POST, verifyPersonaSignature } from '../app/webhooks/persona/route';
import { NextRequest } from 'next/server';

const SECRET = 'wbhsec_test_signing_secret_value';

/**
 * Generate a valid Persona-Signature header for testing.
 * Header format:  t=<unix_seconds>,v1=<hex_signature>
 * Signed content: `${t}.${raw_body}`
 */
function generatePersonaSignature(
  payload: string,
  secret: string,
  timestamp: number | null = null
): string {
  const t = timestamp == null ? Math.floor(Date.now() / 1000).toString() : String(timestamp);
  const v1 = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${payload}`)
    .digest('hex');
  return `t=${t},v1=${v1}`;
}

/** Build an envelope matching Persona's JSON:API webhook shape. */
function buildEvent(name: string, objectId = 'obj_1'): string {
  return JSON.stringify({
    data: {
      type: 'event',
      id: `evt_${name.replace(/[./]/g, '_')}`,
      attributes: {
        name,
        'created-at': '2026-07-22T00:00:00.000Z',
        payload: {
          data: { type: name.split(/[./]/)[0], id: objectId },
        },
      },
    },
  });
}

function buildRequest(payload: string, header: string | null): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (header) headers.set('persona-signature', header);
  return new NextRequest('http://localhost/webhooks/persona', {
    method: 'POST',
    headers,
    body: payload,
  });
}

describe('verifyPersonaSignature', () => {
  it('accepts a valid signature', () => {
    const payload = buildEvent('inquiry.completed');
    const header = generatePersonaSignature(payload, SECRET);
    expect(verifyPersonaSignature(payload, header, SECRET)).toEqual({ valid: true });
  });

  it('accepts one matching pair during secret rotation (two space-separated pairs)', () => {
    const payload = buildEvent('inquiry.approved');
    const good = generatePersonaSignature(payload, SECRET);
    const stale = generatePersonaSignature(payload, 'wbhsec_old_rotated_out_secret');
    expect(verifyPersonaSignature(payload, `${stale} ${good}`, SECRET)).toEqual({ valid: true });
  });

  it('rejects when the header is missing', () => {
    expect(verifyPersonaSignature('{}', null, SECRET)).toMatchObject({
      valid: false,
      error: expect.stringContaining('Missing'),
    });
  });

  it('rejects a malformed header', () => {
    expect(verifyPersonaSignature('{}', 'garbage', SECRET)).toMatchObject({
      valid: false,
      error: expect.stringContaining('Malformed'),
    });
  });

  it('rejects a tampered payload', () => {
    const original = buildEvent('inquiry.completed', 'inq_original');
    const header = generatePersonaSignature(original, SECRET);
    const tampered = buildEvent('inquiry.completed', 'inq_tampered');
    expect(verifyPersonaSignature(tampered, header, SECRET)).toMatchObject({
      valid: false,
      error: 'Invalid signature',
    });
  });
});

describe('POST /webhooks/persona', () => {
  it('returns 400 when signature header is missing', async () => {
    const res = await POST(buildRequest('{}', null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing');
  });

  it('returns 400 for a tampered payload', async () => {
    const original = buildEvent('inquiry.completed', 'inq_orig');
    const header = generatePersonaSignature(original, SECRET);
    const tampered = buildEvent('inquiry.completed', 'inq_x');
    const res = await POST(buildRequest(tampered, header));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = buildEvent('inquiry.approved', 'inq_valid');
    const header = generatePersonaSignature(payload, SECRET);
    const res = await POST(buildRequest(payload, header));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
  });

  it('handles every documented event type', async () => {
    const eventTypes = [
      'inquiry.created',
      'inquiry.started',
      'inquiry.completed',
      'inquiry.approved',
      'inquiry.declined',
      'inquiry.marked-for-review',
      'inquiry.failed',
      'inquiry.expired',
      'verification.passed',
      'verification.failed',
      'account.created',
      'account.archived',
      'case.created',
      'case.resolved',
      'report/watchlist.ready',
      'unknown.event.type',
    ];

    for (const name of eventTypes) {
      const payload = buildEvent(name);
      const header = generatePersonaSignature(payload, SECRET);
      const res = await POST(buildRequest(payload, header));
      expect(res.status).toBe(200);
    }
  });
});
