import crypto from 'crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../app/webhooks/google-pubsub/route';
import { authClient } from '../lib/pubsub';

const ENDPOINT = 'https://example.com/webhooks/google-pubsub';
const AUDIENCE = ENDPOINT;
const SERVICE_ACCOUNT = 'pubsub-push@my-project.iam.gserviceaccount.com';
const SUBSCRIPTION = 'projects/my-project/subscriptions/my-sub';
const KID = 'test-key-id';

// Stand-in for Google's signing key. Tests sign real RS256 tokens with the
// private half and hand google-auth-library the public half, so the library
// performs a genuine signature check instead of a mocked one.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Replace only the network call that fetches Google's public keys.
authClient.getFederatedSignonCertsAsync = (async () => ({
  certs: { [KID]: publicKey },
  format: 'PEM',
})) as typeof authClient.getFederatedSignonCertsAsync;

const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');

/** Mint an OIDC token shaped exactly like the one Pub/Sub attaches. */
function createToken(overrides: Record<string, unknown> = {}, kid = KID): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'https://accounts.google.com',
    aud: AUDIENCE,
    azp: '113774264463038321964',
    sub: '113774264463038321964',
    email: SERVICE_ACCOUNT,
    email_verified: true,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  const signingInput = `${b64url({ alg: 'RS256', kid, typ: 'JWT' })}.${b64url(claims)}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .end()
    .sign(privateKey, 'base64url');
  return `${signingInput}.${signature}`;
}

interface EnvelopeOptions {
  data?: unknown;
  attributes?: Record<string, string>;
  subscription?: string;
}

/** Build a wrapped push envelope. `data` is base64; pass null for attribute-only. */
function pushEnvelope({
  data = { orderId: '123', total: 4995 },
  attributes,
  subscription = SUBSCRIPTION,
}: EnvelopeOptions = {}) {
  const message: Record<string, unknown> = {
    messageId: '2070443601311540',
    publishTime: '2026-08-13T19:13:12.201Z',
  };
  if (data !== null) message.data = Buffer.from(JSON.stringify(data)).toString('base64');
  if (attributes) message.attributes = attributes;
  return { message, subscription };
}

function post(body: unknown, token?: string, url = ENDPOINT): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return POST(
    new Request(url, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  process.env.PUBSUB_AUDIENCE = AUDIENCE;
  process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL = SERVICE_ACCOUNT;
  delete process.env.PUBSUB_VERIFICATION_TOKEN;
  delete process.env.PUBSUB_SUBSCRIPTION;
  delete process.env.PUBSUB_ALLOW_UNAUTHENTICATED;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OIDC token verification', () => {
  it('acks a push request with a valid token', async () => {
    const res = await post(pushEnvelope(), createToken());
    expect(res.status).toBe(204);
  });

  it('accepts the bare accounts.google.com issuer', async () => {
    const res = await post(pushEnvelope(), createToken({ iss: 'accounts.google.com' }));
    expect(res.status).toBe(204);
  });

  it('accepts a lowercase bearer scheme (RFC 7235)', async () => {
    const res = await POST(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `bearer ${createToken()}` },
        body: JSON.stringify(pushEnvelope()),
      })
    );
    expect(res.status).toBe(204);
  });

  it('accepts a service account email that differs only in casing', async () => {
    const res = await post(
      pushEnvelope(),
      createToken({ email: SERVICE_ACCOUNT.toUpperCase() })
    );
    expect(res.status).toBe(204);
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await post(pushEnvelope());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid OIDC token' });
  });

  it('rejects a non-Bearer Authorization scheme', async () => {
    const res = await POST(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Basic ${createToken()}` },
        body: JSON.stringify(pushEnvelope()),
      })
    );
    expect(res.status).toBe(401);
  });

  it('rejects a token minted for a different audience', async () => {
    const res = await post(pushEnvelope(), createToken({ aud: 'https://attacker.example.com' }));
    expect(res.status).toBe(401);
  });

  it('rejects a token from a different service account', async () => {
    // A real, correctly-signed Google token with the right audience is still
    // not good enough — it must be OUR push service account.
    const res = await post(
      pushEnvelope(),
      createToken({ email: 'other@other.iam.gserviceaccount.com' })
    );
    expect(res.status).toBe(401);
  });

  it('rejects a token with email_verified false', async () => {
    const res = await post(pushEnvelope(), createToken({ email_verified: false }));
    expect(res.status).toBe(401);
  });

  it('rejects a token from a non-Google issuer', async () => {
    const res = await post(pushEnvelope(), createToken({ iss: 'https://accounts.evil.example.com' }));
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const res = await post(pushEnvelope(), createToken({ iat: past, exp: past + 3600 }));
    expect(res.status).toBe(401);
  });

  it('rejects a token whose signature has been tampered with', async () => {
    const [header, payload, signature] = createToken().split('.');
    // Flip a leading character: the trailing base64url character can carry
    // unused bits, so changing it does not always change the decoded bytes.
    const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
    const res = await post(pushEnvelope(), `${header}.${payload}.${flipped}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token whose payload has been swapped', async () => {
    const [header, , signature] = createToken().split('.');
    const forged = b64url({
      iss: 'https://accounts.google.com',
      aud: AUDIENCE,
      email: SERVICE_ACCOUNT,
    });
    const res = await post(pushEnvelope(), `${header}.${forged}.${signature}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with an unknown key id', async () => {
    const res = await post(pushEnvelope(), createToken({}, 'unknown-kid'));
    expect(res.status).toBe(401);
  });
});

describe('push envelope handling', () => {
  it('acks an attribute-only message with no data field', async () => {
    const res = await post(
      pushEnvelope({ data: null, attributes: { eventType: 'heartbeat' } }),
      createToken()
    );
    expect(res.status).toBe(204);
  });

  it('acks a message whose data is not JSON', async () => {
    const envelope = pushEnvelope();
    envelope.message.data = Buffer.from('plain text payload').toString('base64');
    const res = await post(envelope, createToken());
    expect(res.status).toBe(204);
  });

  it('rejects an envelope with no message object', async () => {
    const res = await post({ subscription: SUBSCRIPTION }, createToken());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid Pub/Sub push envelope' });
  });

  it('rejects an envelope whose message has no messageId', async () => {
    const res = await post(
      { message: { publishTime: '2026-08-13T19:13:12.201Z' }, subscription: SUBSCRIPTION },
      createToken()
    );
    expect(res.status).toBe(400);
  });

  it('rejects a malformed JSON body', async () => {
    const res = await post('{ not json', createToken());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
  });

  it('authenticates before parsing the envelope', async () => {
    // A bad token on a malformed body must still be a 401, not a 400.
    const res = await post('{ not json', createToken({ aud: 'https://wrong.example.com' }));
    expect(res.status).toBe(401);
  });
});

describe('subscription allowlist', () => {
  it('acks a push from the expected subscription', async () => {
    process.env.PUBSUB_SUBSCRIPTION = SUBSCRIPTION;
    const res = await post(pushEnvelope(), createToken());
    expect(res.status).toBe(204);
  });

  it('rejects a push from an unexpected subscription', async () => {
    process.env.PUBSUB_SUBSCRIPTION = 'projects/my-project/subscriptions/other-sub';
    const res = await post(pushEnvelope(), createToken());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Untrusted subscription' });
  });
});

describe('URL verification token (unauthenticated subscriptions)', () => {
  beforeEach(() => {
    delete process.env.PUBSUB_AUDIENCE;
    delete process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL;
    process.env.PUBSUB_VERIFICATION_TOKEN = 'a-long-unguessable-token';
  });

  it('acks a push carrying the correct token', async () => {
    const res = await post(pushEnvelope(), undefined, `${ENDPOINT}?token=a-long-unguessable-token`);
    expect(res.status).toBe(204);
  });

  it('rejects a push carrying the wrong token', async () => {
    const res = await post(pushEnvelope(), undefined, `${ENDPOINT}?token=wrong`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid verification token' });
  });

  it('rejects a push carrying no token at all', async () => {
    const res = await post(pushEnvelope());
    expect(res.status).toBe(401);
  });

  it('still requires a valid OIDC token when both are configured', async () => {
    process.env.PUBSUB_AUDIENCE = AUDIENCE;
    process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL = SERVICE_ACCOUNT;
    const res = await post(pushEnvelope(), undefined, `${ENDPOINT}?token=a-long-unguessable-token`);
    expect(res.status).toBe(401);
  });
});

describe('fail-closed configuration', () => {
  beforeEach(() => {
    delete process.env.PUBSUB_AUDIENCE;
    delete process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL;
  });

  it('refuses every request when no authentication is configured', async () => {
    const res = await post(pushEnvelope());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/not configured to authenticate/);
  });

  it('accepts unauthenticated pushes only with the explicit opt-in', async () => {
    // The Pub/Sub emulator sends no Authorization header.
    process.env.PUBSUB_ALLOW_UNAUTHENTICATED = 'true';
    const res = await post(pushEnvelope());
    expect(res.status).toBe(204);
  });
});
