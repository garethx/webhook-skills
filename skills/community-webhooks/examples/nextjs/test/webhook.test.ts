import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables before importing the route
process.env.COMMUNITY_WEBHOOK_SECRET = 'test_community_signature_secret';

import { NextRequest } from 'next/server';
import {
  POST,
  verifyCommunitySignature,
  parseSignatureHeader,
} from '../app/webhooks/community/route';

const SECRET = 'test_community_signature_secret';

beforeAll(() => {
  process.env.COMMUNITY_WEBHOOK_SECRET = SECRET;
});

/**
 * Generate a valid `community-signature` header for testing.
 * Matches Community's algorithm: HMAC-SHA256("{t}.{body}", secret), hex.
 */
function generateSignatureHeader(
  body: string,
  timestamp: string,
  secret: string
): string {
  const hex = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex');
  return `t=${timestamp},v1=${hex}`;
}

// Community's `t` is a Unix timestamp in SECONDS
function currentTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

let eventCounter = 0;
function uniqueEventId(): string {
  eventCounter += 1;
  return `evt-${eventCounter}-${crypto.randomUUID()}`;
}

function memberEvent(type: string, overrides: Record<string, unknown> = {}) {
  return {
    id: uniqueEventId(),
    type,
    object: 'member',
    created: '2025-01-05T23:59:45.643131Z',
    api_version: '2024-02-12',
    data: {
      object: {
        active: true,
        id: '7a3e02ec-ac2b-952a-9fc0-11b93f283de6',
        timestamp: '2025-01-16T08:33:47.925975Z',
        client_id: '34e13e8d-241e-52k9-87hf-143322017665',
        communication_channel: 'sms',
        communication_channel_id: '12126885505',
        given_name: 'John',
        surname: 'Smith',
        ...overrides,
      },
    },
  };
}

function messageEvent(type: string, overrides: Record<string, unknown> = {}) {
  return {
    id: uniqueEventId(),
    type,
    object: 'message',
    created: '2025-01-05T21:31:19.740650Z',
    api_version: '2024-02-12',
    data: {
      object: {
        id: '96c8b483-c16f-4bc3-8f1b-5fe9e1001162',
        text: 'Spotify',
        media_list: [],
        outbound_message_type: 'not_set',
        member: {
          active: true,
          id: '7a3e02ec-ac2b-952a-9fc0-11b93f283de6',
          communication_channel: 'sms',
          communication_channel_id: '12126885505',
        },
        ...overrides,
      },
    },
  };
}

function buildRequest(body: string, signatureHeader?: string | null): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signatureHeader) headers.set('community-signature', signatureHeader);

  return new NextRequest('https://example.com/webhooks/community', {
    method: 'POST',
    headers,
    body,
  });
}

function postEvent(event: unknown, secret: string = SECRET) {
  const body = JSON.stringify(event);
  const header = generateSignatureHeader(body, currentTimestamp(), secret);
  return POST(buildRequest(body, header));
}

describe('parseSignatureHeader', () => {
  it('parses t and v1 fields', () => {
    expect(parseSignatureHeader('t=1711666033,v1=abc123')).toEqual({
      timestamp: '1711666033',
      signature: 'abc123',
    });
  });

  it('does not depend on field order', () => {
    expect(parseSignatureHeader('v1=abc123,t=1711666033')).toEqual({
      timestamp: '1711666033',
      signature: 'abc123',
    });
  });

  it('tolerates whitespace around fields', () => {
    expect(parseSignatureHeader('t=1711666033, v1=abc123')).toEqual({
      timestamp: '1711666033',
      signature: 'abc123',
    });
  });

  it('ignores unknown fields', () => {
    expect(parseSignatureHeader('t=1711666033,v1=abc123,v0=legacy')).toEqual({
      timestamp: '1711666033',
      signature: 'abc123',
    });
  });

  it('returns null when the v1 scheme is absent', () => {
    // An unknown scheme version is unsupported, not silently accepted
    expect(parseSignatureHeader('t=1711666033,v2=abc123')).toBeNull();
  });

  it('returns null when the timestamp is absent', () => {
    expect(parseSignatureHeader('v1=abc123')).toBeNull();
  });
});

describe('verifyCommunitySignature', () => {
  it('validates a correct signature', () => {
    const body = JSON.stringify({ type: 'member.created' });
    const header = generateSignatureHeader(body, currentTimestamp(), SECRET);

    expect(verifyCommunitySignature(body, header, SECRET)).toBe(true);
  });

  it('signs "{t}.{body}" — the body alone does not verify', () => {
    const body = JSON.stringify({ type: 'member.created' });
    const ts = currentTimestamp();
    const bodyOnly = crypto
      .createHmac('sha256', SECRET)
      .update(body, 'utf8')
      .digest('hex');

    expect(verifyCommunitySignature(body, `t=${ts},v1=${bodyOnly}`, SECRET)).toBe(
      false
    );
  });

  it('rejects an invalid signature', () => {
    expect(
      verifyCommunitySignature('{}', `t=${currentTimestamp()},v1=deadbeef`, SECRET)
    ).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyCommunitySignature('{}', null, SECRET)).toBe(false);
  });

  it('rejects a missing secret', () => {
    const body = '{}';
    const header = generateSignatureHeader(body, currentTimestamp(), SECRET);

    expect(verifyCommunitySignature(body, header, undefined)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = JSON.stringify({ type: 'member.created' });
    const tampered = JSON.stringify({ type: 'member.deleted' });
    const header = generateSignatureHeader(original, currentTimestamp(), SECRET);

    expect(verifyCommunitySignature(tampered, header, SECRET)).toBe(false);
  });

  it('rejects a tampered timestamp', () => {
    const body = '{}';
    const ts = currentTimestamp();
    const header = generateSignatureHeader(body, ts, SECRET);

    expect(
      verifyCommunitySignature(body, header.replace(`t=${ts}`, 't=1'), SECRET)
    ).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const body = '{}';
    const header = generateSignatureHeader(body, currentTimestamp(), SECRET);

    expect(verifyCommunitySignature(body, header, 'wrong_secret')).toBe(false);
  });

  it('rejects a malformed header', () => {
    expect(verifyCommunitySignature('{}', 'not-a-signature', SECRET)).toBe(false);
  });

  it('does not throw when the signature length differs', () => {
    const header = `t=${currentTimestamp()},v1=short`;

    expect(() => verifyCommunitySignature('{}', header, SECRET)).not.toThrow();
    expect(verifyCommunitySignature('{}', header, SECRET)).toBe(false);
  });

  it('verifies a UTF-8 payload byte-for-byte', () => {
    const body = JSON.stringify({ text: 'héllo 👋 emoji' });
    const header = generateSignatureHeader(body, currentTimestamp(), SECRET);

    expect(verifyCommunitySignature(body, header, SECRET)).toBe(true);
  });

  describe('optional staleness check', () => {
    it('accepts an old timestamp when tolerance is disabled (the default)', () => {
      const body = '{}';
      const old = (Math.floor(Date.now() / 1000) - 7200).toString();
      const header = generateSignatureHeader(body, old, SECRET);

      expect(verifyCommunitySignature(body, header, SECRET, 0)).toBe(true);
    });

    it('rejects a stale timestamp when a tolerance is set', () => {
      const body = '{}';
      const old = (Math.floor(Date.now() / 1000) - 7200).toString();
      const header = generateSignatureHeader(body, old, SECRET);

      expect(verifyCommunitySignature(body, header, SECRET, 300)).toBe(false);
    });

    it('accepts a fresh timestamp when a tolerance is set', () => {
      const body = '{}';
      const header = generateSignatureHeader(body, currentTimestamp(), SECRET);

      expect(verifyCommunitySignature(body, header, SECRET, 300)).toBe(true);
    });

    it('rejects a non-numeric timestamp when a tolerance is set', () => {
      const body = '{}';
      const header = generateSignatureHeader(body, 'not-a-number', SECRET);

      expect(verifyCommunitySignature(body, header, SECRET, 300)).toBe(false);
    });
  });
});

describe('POST /webhooks/community', () => {
  it('returns 400 when the signature header is missing', async () => {
    const body = JSON.stringify(memberEvent('member.created'));
    const res = await POST(buildRequest(body));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Missing community-signature header',
    });
  });

  it('returns 400 when the signature is invalid', async () => {
    const body = JSON.stringify(memberEvent('member.created'));
    const res = await POST(
      buildRequest(body, `t=${currentTimestamp()},v1=deadbeef`)
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('returns 400 when the signature was made with the wrong secret', async () => {
    const res = await postEvent(memberEvent('member.created'), 'wrong_secret');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const body = 'not valid json';
    const header = generateSignatureHeader(body, currentTimestamp(), SECRET);
    const res = await POST(buildRequest(body, header));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 200 for a valid member.created event', async () => {
    const res = await postEvent(memberEvent('member.created'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 200 for a valid member.updated event', async () => {
    const res = await postEvent(memberEvent('member.updated'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for a sparse member.deleted event', async () => {
    // member.deleted omits every personal-data field
    const res = await postEvent({
      id: uniqueEventId(),
      type: 'member.deleted',
      object: 'member',
      created: '2025-01-16T18:00:41.909260Z',
      api_version: '2024-02-12',
      data: {
        object: {
          active: false,
          id: 'e9e98f87-ecd4-453c-9b82-5dd0c61f1cda',
          timestamp: '2025-10-07T20:05:41.051488Z',
          client_id: '34e13e8d-241e-52k9-87hf-143322017665',
          communication_channel: 'sms',
          communication_channel_id: '',
        },
      },
    });

    expect(res.status).toBe(200);
  });

  it('returns 200 for a valid message.inbound event', async () => {
    const res = await postEvent(messageEvent('message.inbound'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for a valid message.outbound event', async () => {
    const res = await postEvent(
      messageEvent('message.outbound', { outbound_message_type: 'automated' })
    );
    expect(res.status).toBe(200);
  });

  it('returns 200 for an unknown event type', async () => {
    const res = await postEvent(memberEvent('member.something_new'));
    expect(res.status).toBe(200);
  });

  it('handles the documented data.member fallback shape', async () => {
    const res = await postEvent({
      id: uniqueEventId(),
      type: 'member.created',
      object: 'member',
      created: '2025-01-05T23:59:45.643131Z',
      api_version: '2024-02-12',
      data: {
        member: {
          active: true,
          id: '7a3e02ec-ac2b-952a-9fc0-11b93f283de6',
          communication_channel: 'sms',
        },
      },
    });

    expect(res.status).toBe(200);
  });

  it('flags a duplicate delivery instead of reprocessing (at-least-once)', async () => {
    const event = memberEvent('member.created');

    const first = await postEvent(event);
    const second = await postEvent(event);

    expect(await first.json()).toEqual({ received: true });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });
});
