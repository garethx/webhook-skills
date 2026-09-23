// Generated with: quo-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');

// SCHEME A key. Quo returns `whsec_` + base64(raw key bytes) from POST /webhooks.
// Here the raw key is the ASCII string "quo_test_secret_key_32_bytes!!" so the
// base64 is readable in test failures.
const RAW_KEY = 'quo_test_secret_key_32_bytes!!';
const TEST_WEBHOOK_KEY = `whsec_${Buffer.from(RAW_KEY, 'utf8').toString('base64')}`;
const WRONG_WEBHOOK_KEY = `whsec_${Buffer.from('wrong_key', 'utf8').toString('base64')}`;

// SCHEME B secret. Bare base64, no prefix — this is what "Reveal signing
// secret" shows in the Quo app. Quo's own docs use an example key that decodes
// to the ASCII string below.
const LEGACY_RAW_KEY = 'GfK3j4lXA5ZrRu64ofat50srGzoIHHUX';
const TEST_LEGACY_SECRET = Buffer.from(LEGACY_RAW_KEY, 'utf8').toString('base64');

process.env.QUO_WEBHOOK_KEY = TEST_WEBHOOK_KEY;
process.env.QUO_LEGACY_SIGNING_SECRET = TEST_LEGACY_SECRET;

const request = require('supertest');
const { app, verifyQuoSignature, verifyQuoLegacySignature, normalizeEvent } = require('../src');

// --- Fixtures ---------------------------------------------------------------

// Current envelope (apiVersion 2026-03-30): data.resource / context / links.
const CURRENT_EVENT = {
  id: 'EV123',
  apiVersion: '2026-03-30',
  createdAt: '2026-04-13T12:00:00.000Z',
  type: 'call.summary.completed',
  data: {
    resource: { id: 'AC123', updatedAt: '2026-04-13T12:00:00.000Z' },
    context: { orgId: 'OR123' },
    links: { quo: 'https://my.quo.com/calls/AC123' },
  },
};

// Legacy envelope (apiVersion v2): data.object, plus a top-level object: "event".
const LEGACY_EVENT = {
  id: 'EVc67ec998b35c41d388af50799aeeba3e',
  object: 'event',
  apiVersion: 'v2',
  createdAt: '2022-01-23T16:55:52.557Z',
  type: 'message.received',
  data: {
    object: {
      id: 'AC24a8',
      object: 'message',
      from: '+14155550100',
      to: '+13105550199',
      direction: 'incoming',
      body: 'Hello',
      media: [],
      status: 'received',
      createdAt: '2022-01-23T16:55:52.420Z',
      userId: 'USu5AsEHuQ',
      phoneNumberId: 'PNtoDbDhuz',
      conversationId: 'CN78ba0373683c48fd8fd96bc836c51f79',
    },
  },
};

const CURRENT_BODY = JSON.stringify(CURRENT_EVENT);
const LEGACY_BODY = JSON.stringify(LEGACY_EVENT);

/**
 * Sign exactly as Quo does for Scheme A:
 *   HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw-body}`, base64.
 * The key is base64(raw bytes) after the whsec_ prefix is stripped.
 */
function signCurrent(body, { id = 'msg_2abc', timestamp, key = TEST_WEBHOOK_KEY } = {}) {
  const ts = String(timestamp ?? Math.floor(Date.now() / 1000)); // UNIX SECONDS
  const secret = Buffer.from(key.replace(/^whsec_/, ''), 'base64');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${id}.${ts}.${body}`)
    .digest('base64');
  return {
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': `v1,${signature}`,
  };
}

/**
 * Sign exactly as Quo does for Scheme B:
 *   HMAC-SHA256 over `{timestamp}.{raw-body}`, base64, wrapped in
 *   `hmac;1;{timestamp};{signature}`. Timestamp is UNIX MILLISECONDS.
 */
function signLegacy(body, { timestamp, secret = TEST_LEGACY_SECRET } = {}) {
  const ts = String(timestamp ?? Date.now()); // UNIX MILLISECONDS
  const key = Buffer.from(secret, 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${ts}.${body}`).digest('base64');
  return `hmac;1;${ts};${signature}`;
}

const JSON_TYPE = 'application/json';

// --- Scheme A: current API --------------------------------------------------

describe('Scheme A — current API (webhook-signature)', () => {
  it('accepts a correctly signed delivery', async () => {
    const res = await request(app)
      .post('/webhooks/quo')
      .set(signCurrent(CURRENT_BODY))
      .set('Content-Type', JSON_TYPE)
      .send(CURRENT_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a signature made with the wrong key', async () => {
    const headers = signCurrent(CURRENT_BODY, { key: WRONG_WEBHOOK_KEY });
    const res = await request(app)
      .post('/webhooks/quo')
      .set(headers)
      .set('Content-Type', JSON_TYPE)
      .send(CURRENT_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('rejects a tampered body', async () => {
    const headers = signCurrent(CURRENT_BODY);
    const res = await request(app)
      .post('/webhooks/quo')
      .set(headers)
      .set('Content-Type', JSON_TYPE)
      .send(JSON.stringify({ ...CURRENT_EVENT, type: 'call.completed' }));

    expect(res.status).toBe(400);
  });

  it('rejects a stale timestamp (replay)', async () => {
    const stale = Math.floor(Date.now() / 1000) - 600; // 10 minutes old
    const res = await request(app)
      .post('/webhooks/quo')
      .set(signCurrent(CURRENT_BODY, { timestamp: stale }))
      .set('Content-Type', JSON_TYPE)
      .send(CURRENT_BODY);

    expect(res.status).toBe(400);
  });

  it('rejects a delivery with no signature headers at all', async () => {
    // Quo sends no unsigned requests: no handshake, no challenge, no
    // webhook.test event. An unsigned request is not from Quo.
    const res = await request(app)
      .post('/webhooks/quo')
      .set('Content-Type', JSON_TYPE)
      .send(CURRENT_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing signature headers');
  });

  it('accepts when ANY space-separated v1 entry matches (secret rotation)', () => {
    const headers = signCurrent(CURRENT_BODY);
    const good = headers['webhook-signature'];
    const stale = 'v1,c3RhbGVzaWduYXR1cmV2YWx1ZWhlcmVwYWRkaW5nMDAwMA==';

    expect(
      verifyQuoSignature(
        Buffer.from(CURRENT_BODY),
        { ...headers, 'webhook-signature': `${stale} ${good}` },
        TEST_WEBHOOK_KEY
      )
    ).toBe(true);
  });

  it('ignores entries whose version is not v1', () => {
    const headers = signCurrent(CURRENT_BODY);
    const sig = headers['webhook-signature'].slice('v1,'.length);

    expect(
      verifyQuoSignature(
        Buffer.from(CURRENT_BODY),
        { ...headers, 'webhook-signature': `v2,${sig}` },
        TEST_WEBHOOK_KEY
      )
    ).toBe(false);
  });

  it('rejects a key whose whsec_ prefix was not stripped before decoding', () => {
    // The classic Scheme A bug: hashing with the literal `whsec_…` string.
    const headers = signCurrent(CURRENT_BODY);
    const wrong = crypto
      .createHmac('sha256', TEST_WEBHOOK_KEY) // prefixed string used as the key
      .update(`${headers['webhook-id']}.${headers['webhook-timestamp']}.${CURRENT_BODY}`)
      .digest('base64');

    expect(
      verifyQuoSignature(
        Buffer.from(CURRENT_BODY),
        { ...headers, 'webhook-signature': `v1,${wrong}` },
        TEST_WEBHOOK_KEY
      )
    ).toBe(false);
  });

  it('rejects a signature over the body alone (no id.timestamp prefix)', () => {
    const headers = signCurrent(CURRENT_BODY);
    const secret = Buffer.from(TEST_WEBHOOK_KEY.replace(/^whsec_/, ''), 'base64');
    const bodyOnly = crypto.createHmac('sha256', secret).update(CURRENT_BODY).digest('base64');

    expect(
      verifyQuoSignature(
        Buffer.from(CURRENT_BODY),
        { ...headers, 'webhook-signature': `v1,${bodyOnly}` },
        TEST_WEBHOOK_KEY
      )
    ).toBe(false);
  });

  it('does not throw on a wrong-length signature', () => {
    // crypto.timingSafeEqual throws on mismatched lengths; the length guard
    // must run first or this becomes a 500 that Quo retries eight times.
    const headers = signCurrent(CURRENT_BODY);
    expect(() =>
      verifyQuoSignature(
        Buffer.from(CURRENT_BODY),
        { ...headers, 'webhook-signature': 'v1,short' },
        TEST_WEBHOOK_KEY
      )
    ).not.toThrow();
  });

  it('fails closed when no key is configured', () => {
    expect(
      verifyQuoSignature(Buffer.from(CURRENT_BODY), signCurrent(CURRENT_BODY), undefined)
    ).toBe(false);
  });
});

// --- Scheme B: legacy openphone-signature -----------------------------------

describe('Scheme B — legacy (openphone-signature)', () => {
  it('accepts a correctly signed legacy delivery', async () => {
    const res = await request(app)
      .post('/webhooks/quo')
      .set('openphone-signature', signLegacy(LEGACY_BODY))
      .set('Content-Type', JSON_TYPE)
      .send(LEGACY_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('parses the documented header shape: hmac;1;<ms>;<base64>', () => {
    const header = signLegacy(LEGACY_BODY);
    const [scheme, version, timestamp, signature] = header.split(';');

    expect(scheme).toBe('hmac');
    expect(version).toBe('1');
    expect(String(timestamp)).toHaveLength(13); // UNIX MILLISECONDS
    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/); // standard base64, not base64url
  });

  it('rejects a signature made with the wrong secret', async () => {
    const wrong = Buffer.from('not_the_signing_secret', 'utf8').toString('base64');
    const res = await request(app)
      .post('/webhooks/quo')
      .set('openphone-signature', signLegacy(LEGACY_BODY, { secret: wrong }))
      .set('Content-Type', JSON_TYPE)
      .send(LEGACY_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('treats a 13-digit timestamp as milliseconds, not seconds', () => {
    // A current ms timestamp must be FRESH. If it were read as seconds it would
    // land ~52,000 years in the future and every delivery would be dropped.
    const nowMs = Date.now();
    expect(String(nowMs)).toHaveLength(13);
    expect(
      verifyQuoLegacySignature(
        Buffer.from(LEGACY_BODY),
        signLegacy(LEGACY_BODY, { timestamp: nowMs }),
        TEST_LEGACY_SECRET
      )
    ).toBe(true);
  });

  it('also accepts a 10-digit seconds timestamp (unit-agnostic check)', () => {
    // The unit is INFERRED from Quo's 13-digit example, never stated in words,
    // so the freshness check detects it rather than hardcoding a divisor.
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(String(nowSeconds)).toHaveLength(10);
    expect(
      verifyQuoLegacySignature(
        Buffer.from(LEGACY_BODY),
        signLegacy(LEGACY_BODY, { timestamp: nowSeconds }),
        TEST_LEGACY_SECRET
      )
    ).toBe(true);
  });

  it('rejects a stale legacy timestamp', () => {
    const staleMs = Date.now() - 10 * 60 * 1000;
    expect(
      verifyQuoLegacySignature(
        Buffer.from(LEGACY_BODY),
        signLegacy(LEGACY_BODY, { timestamp: staleMs }),
        TEST_LEGACY_SECRET
      )
    ).toBe(false);
  });

  it('accepts when ANY comma-separated signature matches', () => {
    // Quo: "Future versions may include multiple signatures separated by
    // commas." Note: COMMAS here, SPACES in scheme A.
    const good = signLegacy(LEGACY_BODY);
    const other = signLegacy(LEGACY_BODY, {
      secret: Buffer.from('another_key', 'utf8').toString('base64'),
    });

    expect(
      verifyQuoLegacySignature(Buffer.from(LEGACY_BODY), `${other},${good}`, TEST_LEGACY_SECRET)
    ).toBe(true);
  });

  it('rejects a malformed header that is not four semicolon fields', () => {
    expect(
      verifyQuoLegacySignature(Buffer.from(LEGACY_BODY), 'hmac;1;123', TEST_LEGACY_SECRET)
    ).toBe(false);
    expect(
      verifyQuoLegacySignature(Buffer.from(LEGACY_BODY), 'garbage', TEST_LEGACY_SECRET)
    ).toBe(false);
  });

  it('rejects a scheme or version other than hmac;1', () => {
    const header = signLegacy(LEGACY_BODY);
    const [, , timestamp, signature] = header.split(';');

    expect(
      verifyQuoLegacySignature(
        Buffer.from(LEGACY_BODY),
        `hmac;2;${timestamp};${signature}`,
        TEST_LEGACY_SECRET
      )
    ).toBe(false);
    expect(
      verifyQuoLegacySignature(
        Buffer.from(LEGACY_BODY),
        `rsa;1;${timestamp};${signature}`,
        TEST_LEGACY_SECRET
      )
    ).toBe(false);
  });

  it('rejects an undecoded signing secret', () => {
    // The legacy secret is base64 and must be DECODED to raw bytes first.
    // Signing with the base64 STRING as the key must not verify.
    const header = signLegacy(LEGACY_BODY);
    const [, , timestamp] = header.split(';');
    const wrong = crypto
      .createHmac('sha256', TEST_LEGACY_SECRET) // base64 string used directly
      .update(`${timestamp}.${LEGACY_BODY}`)
      .digest('base64');

    expect(
      verifyQuoLegacySignature(
        Buffer.from(LEGACY_BODY),
        `hmac;1;${timestamp};${wrong}`,
        TEST_LEGACY_SECRET
      )
    ).toBe(false);
  });

  it('fails closed when no legacy secret is configured', () => {
    expect(
      verifyQuoLegacySignature(Buffer.from(LEGACY_BODY), signLegacy(LEGACY_BODY), undefined)
    ).toBe(false);
  });
});

// --- Raw body -------------------------------------------------------------

describe('raw body', () => {
  // Quo's own legacy Node sample signs JSON.stringify(req.body) while its
  // Python sample signs request.data. They agree only because Quo sends compact
  // JSON. Verification must be done over the RAW bytes, so a pretty-printed
  // body with the same semantic content must NOT verify against a compact one.
  const PRETTY_BODY = JSON.stringify(LEGACY_EVENT, null, 2);

  it('rejects a re-serialized body that differs byte-for-byte', () => {
    const header = signLegacy(LEGACY_BODY); // signed over the compact bytes
    expect(verifyQuoLegacySignature(Buffer.from(PRETTY_BODY), header, TEST_LEGACY_SECRET)).toBe(
      false
    );
  });

  it('verifies a pretty-printed body when it is what was actually signed', () => {
    const header = signLegacy(PRETTY_BODY);
    expect(verifyQuoLegacySignature(Buffer.from(PRETTY_BODY), header, TEST_LEGACY_SECRET)).toBe(
      true
    );
  });

  it('handles non-ASCII bodies (multi-byte UTF-8) in both schemes', () => {
    const body = JSON.stringify({
      ...LEGACY_EVENT,
      data: { object: { ...LEGACY_EVENT.data.object, body: 'héllo 👋 émoji' } },
    });
    const raw = Buffer.from(body, 'utf8');

    expect(verifyQuoLegacySignature(raw, signLegacy(body), TEST_LEGACY_SECRET)).toBe(true);
    expect(verifyQuoSignature(raw, signCurrent(body), TEST_WEBHOOK_KEY)).toBe(true);
  });
});

// --- Envelope normalisation -------------------------------------------------

describe('envelope normalisation', () => {
  it('reads data.resource / context / links on the current envelope', () => {
    const n = normalizeEvent(CURRENT_EVENT);
    expect(n.isLegacy).toBe(false);
    expect(n.resource.id).toBe('AC123');
    expect(n.context.orgId).toBe('OR123');
    expect(n.links.quo).toContain('my.quo.com');
  });

  it('reads data.object on the legacy envelope', () => {
    const n = normalizeEvent(LEGACY_EVENT);
    expect(n.isLegacy).toBe(true);
    expect(n.resource.body).toBe('Hello'); // legacy uses `body`, not `text`
    expect(n.resource.from).toBe('+14155550100');
    expect(n.apiVersion).toBe('v2');
  });
});
