const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app
process.env.COMMUNITY_WEBHOOK_SECRET = 'test_community_signature_secret';

const {
  app,
  verifyCommunitySignature,
  parseSignatureHeader,
} = require('../src/index');

const SECRET = process.env.COMMUNITY_WEBHOOK_SECRET;

/**
 * Generate a valid `community-signature` header for testing.
 * Matches Community's algorithm: HMAC-SHA256("{t}.{body}", secret), hex.
 */
function generateSignatureHeader(body, timestamp, secret) {
  const hex = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex');
  return `t=${timestamp},v1=${hex}`;
}

// Community's `t` is a Unix timestamp in SECONDS
function currentTimestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

let eventCounter = 0;
function uniqueEventId() {
  eventCounter += 1;
  return `evt-${eventCounter}-${crypto.randomUUID()}`;
}

function memberEvent(type, overrides = {}) {
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

function messageEvent(type, overrides = {}) {
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

function postEvent(event, { secret = SECRET, timestamp = currentTimestamp() } = {}) {
  const body = JSON.stringify(event);
  return request(app)
    .post('/webhooks/community')
    .set('Content-Type', 'application/json')
    .set('community-signature', generateSignatureHeader(body, timestamp, secret))
    .send(body);
}

describe('parseSignatureHeader', () => {
  it('parses t and v1 fields', () => {
    const parsed = parseSignatureHeader('t=1711666033,v1=abc123');
    expect(parsed).toEqual({ timestamp: '1711666033', signature: 'abc123' });
  });

  it('does not depend on field order', () => {
    const parsed = parseSignatureHeader('v1=abc123,t=1711666033');
    expect(parsed).toEqual({ timestamp: '1711666033', signature: 'abc123' });
  });

  it('tolerates whitespace around fields', () => {
    const parsed = parseSignatureHeader('t=1711666033, v1=abc123');
    expect(parsed).toEqual({ timestamp: '1711666033', signature: 'abc123' });
  });

  it('ignores unknown fields', () => {
    const parsed = parseSignatureHeader('t=1711666033,v1=abc123,v0=legacy');
    expect(parsed).toEqual({ timestamp: '1711666033', signature: 'abc123' });
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
  it('returns true for a valid signature', () => {
    const body = '{"type":"member.created"}';
    const ts = currentTimestamp();
    const header = generateSignatureHeader(body, ts, SECRET);

    expect(verifyCommunitySignature(body, header, SECRET)).toBe(true);
  });

  it('accepts a Buffer raw body', () => {
    const body = '{"type":"member.created"}';
    const ts = currentTimestamp();
    const header = generateSignatureHeader(body, ts, SECRET);

    expect(verifyCommunitySignature(Buffer.from(body), header, SECRET)).toBe(true);
  });

  it('signs "{t}.{body}" — the body alone does not verify', () => {
    const body = '{"type":"member.created"}';
    const ts = currentTimestamp();
    const bodyOnly = crypto
      .createHmac('sha256', SECRET)
      .update(body, 'utf8')
      .digest('hex');

    expect(
      verifyCommunitySignature(body, `t=${ts},v1=${bodyOnly}`, SECRET)
    ).toBe(false);
  });

  it('returns false for an invalid signature', () => {
    const body = '{}';
    const ts = currentTimestamp();

    expect(verifyCommunitySignature(body, `t=${ts},v1=deadbeef`, SECRET)).toBe(false);
  });

  it('returns false when the signature header is missing', () => {
    expect(verifyCommunitySignature('{}', undefined, SECRET)).toBe(false);
  });

  it('returns false when the secret is missing', () => {
    const body = '{}';
    const ts = currentTimestamp();
    const header = generateSignatureHeader(body, ts, SECRET);

    expect(verifyCommunitySignature(body, header, undefined)).toBe(false);
  });

  it('returns false when the body has been tampered with', () => {
    const original = JSON.stringify({ type: 'member.created' });
    const tampered = JSON.stringify({ type: 'member.deleted' });
    const ts = currentTimestamp();
    const header = generateSignatureHeader(original, ts, SECRET);

    expect(verifyCommunitySignature(tampered, header, SECRET)).toBe(false);
  });

  it('returns false when the timestamp has been tampered with', () => {
    const body = '{}';
    const ts = currentTimestamp();
    const header = generateSignatureHeader(body, ts, SECRET);
    const swapped = header.replace(`t=${ts}`, 't=1');

    expect(verifyCommunitySignature(body, swapped, SECRET)).toBe(false);
  });

  it('returns false for the wrong secret', () => {
    const body = '{}';
    const ts = currentTimestamp();
    const header = generateSignatureHeader(body, ts, SECRET);

    expect(verifyCommunitySignature(body, header, 'wrong_secret')).toBe(false);
  });

  it('returns false for a malformed header', () => {
    expect(verifyCommunitySignature('{}', 'not-a-signature', SECRET)).toBe(false);
  });

  it('does not throw when the signature length differs', () => {
    const body = '{}';
    const ts = currentTimestamp();

    expect(() =>
      verifyCommunitySignature(body, `t=${ts},v1=short`, SECRET)
    ).not.toThrow();
    expect(verifyCommunitySignature(body, `t=${ts},v1=short`, SECRET)).toBe(false);
  });

  it('verifies a UTF-8 payload byte-for-byte', () => {
    const body = JSON.stringify({ text: 'héllo 👋 emoji' });
    const ts = currentTimestamp();
    const header = generateSignatureHeader(body, ts, SECRET);

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
      const ts = currentTimestamp();
      const header = generateSignatureHeader(body, ts, SECRET);

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
    const res = await request(app)
      .post('/webhooks/community')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(memberEvent('member.created')));

    expect(res.status).toBe(400);
    expect(res.text).toBe('Missing community-signature header');
  });

  it('returns 400 when the signature is invalid', async () => {
    const body = JSON.stringify(memberEvent('member.created'));

    const res = await request(app)
      .post('/webhooks/community')
      .set('Content-Type', 'application/json')
      .set('community-signature', `t=${currentTimestamp()},v1=deadbeef`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 when the signature was made with the wrong secret', async () => {
    const res = await postEvent(memberEvent('member.created'), {
      secret: 'wrong_secret',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const body = 'not valid json';
    const ts = currentTimestamp();

    const res = await request(app)
      .post('/webhooks/community')
      .set('Content-Type', 'application/json')
      .set('community-signature', generateSignatureHeader(body, ts, SECRET))
      .send(body);

    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid JSON');
  });

  it('returns 200 for a valid member.created event', async () => {
    const res = await postEvent(memberEvent('member.created'));

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('returns 200 for a valid member.updated event', async () => {
    const res = await postEvent(memberEvent('member.updated'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for a sparse member.deleted event', async () => {
    // member.deleted omits every personal-data field
    const event = {
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
    };

    const res = await postEvent(event);
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
    const event = {
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
    };

    const res = await postEvent(event);
    expect(res.status).toBe(200);
  });

  it('acknowledges a duplicate delivery with 200 (at-least-once)', async () => {
    const event = memberEvent('member.created');

    const first = await postEvent(event);
    const second = await postEvent(event);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
