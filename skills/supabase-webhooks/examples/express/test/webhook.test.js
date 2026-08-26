// Generated with: supabase-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Secrets must be in the environment before the handlers read them.
// Database Webhooks: a value YOU choose and put in the trigger's headers JSON.
process.env.SUPABASE_WEBHOOK_SECRET = 'db-webhook-shared-secret';
// Auth Hooks: the value Supabase issues, including the "v1,whsec_" prefix.
// The base64 part decodes to the raw HMAC key ("test_secret_key" here).
process.env.SUPABASE_AUTH_HOOK_SECRET = 'v1,whsec_dGVzdF9zZWNyZXRfa2V5';

const { app, server } = require('../src/index');

const DB_SECRET = 'db-webhook-shared-secret';
const AUTH_SECRET = 'v1,whsec_dGVzdF9zZWNyZXRfa2V5';

afterAll(() => new Promise((resolve) => server.close(() => resolve())));

/**
 * Sign a payload exactly the way Supabase Auth does.
 * Standard Webhooks: base64(HMAC_SHA256(key, "{id}.{timestamp}.{rawBody}"))
 * where `key` is the base64-DECODED portion after "v1,whsec_".
 */
function signAuthHook(rawBody, id, timestamp, secret = AUTH_SECRET) {
  const key = Buffer.from(secret.replace('v1,whsec_', ''), 'base64');
  const signature = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${signature}`;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function authHeaders(rawBody, overrides = {}) {
  const id = overrides.id || `msg_${crypto.randomUUID()}`;
  const timestamp = String(overrides.timestamp ?? nowSeconds());
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature':
      overrides.signature ?? signAuthHook(rawBody, id, timestamp, overrides.secret),
  };
}

// --- Database Webhooks -----------------------------------------------------

describe('Supabase Database Webhooks', () => {
  const insertPayload = {
    type: 'INSERT',
    table: 'orders',
    schema: 'public',
    record: { id: 1, status: 'paid' },
    old_record: null,
  };

  it('accepts a request with the correct bearer shared secret', async () => {
    const res = await request(app)
      .post('/webhooks/supabase')
      .set('Authorization', `Bearer ${DB_SECRET}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(insertPayload));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts the x-webhook-secret header as an alternative', async () => {
    const res = await request(app)
      .post('/webhooks/supabase')
      .set('x-webhook-secret', DB_SECRET)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(insertPayload));

    expect(res.status).toBe(200);
  });

  it('rejects a request with no shared secret', async () => {
    const res = await request(app)
      .post('/webhooks/supabase')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(insertPayload));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('rejects a request with the wrong shared secret', async () => {
    const res = await request(app)
      .post('/webhooks/supabase')
      .set('Authorization', 'Bearer not-the-secret')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(insertPayload));

    expect(res.status).toBe(401);
  });

  it('rejects a secret of the right length but wrong content', async () => {
    const wrong = 'x'.repeat(DB_SECRET.length);
    const res = await request(app)
      .post('/webhooks/supabase')
      .set('Authorization', `Bearer ${wrong}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(insertPayload));

    expect(res.status).toBe(401);
  });

  it('rejects an invalid JSON body', async () => {
    const res = await request(app)
      .post('/webhooks/supabase')
      .set('Authorization', `Bearer ${DB_SECRET}`)
      .set('Content-Type', 'application/json')
      .send('not json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  it.each([
    [
      'UPDATE',
      {
        type: 'UPDATE',
        table: 'orders',
        schema: 'public',
        record: { id: 1, status: 'shipped' },
        old_record: { id: 1, status: 'paid' },
      },
    ],
    [
      'DELETE',
      {
        type: 'DELETE',
        table: 'orders',
        schema: 'public',
        record: null,
        old_record: { id: 1, status: 'shipped' },
      },
    ],
  ])('handles a %s payload', async (_type, payload) => {
    const res = await request(app)
      .post('/webhooks/supabase')
      .set('Authorization', `Bearer ${DB_SECRET}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload));

    expect(res.status).toBe(200);
  });

  it('acknowledges an unknown type without failing', async () => {
    const res = await request(app)
      .post('/webhooks/supabase')
      .set('Authorization', `Bearer ${DB_SECRET}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'TRUNCATE', table: 'orders', schema: 'public' }));

    expect(res.status).toBe(200);
  });
});

// --- Auth Hooks ------------------------------------------------------------

describe('Supabase Auth Hooks', () => {
  it('verifies a valid Standard Webhooks signature (send_email)', async () => {
    const body = JSON.stringify({
      user: { id: 'u1', email: 'user@example.com' },
      email_data: {
        token: '123456',
        token_hash: 'hash',
        redirect_to: 'http://localhost:3000/',
        email_action_type: 'signup',
        site_url: 'http://localhost:3000',
        token_new: '',
        token_hash_new: '',
        old_email: '',
        old_phone: '',
        provider: '',
        factor_type: '',
      },
    });

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set(authHeaders(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('returns an empty object for send_sms', async () => {
    const body = JSON.stringify({
      user: { id: 'u1', phone: '+15551234567' },
      sms: { otp: '561166' },
    });

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set(authHeaders(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('returns claims for custom_access_token', async () => {
    const body = JSON.stringify({
      user_id: '8ccaa7af-909f-44e7-84cb-67cdccb56be6',
      claims: {
        aud: 'authenticated',
        sub: '8ccaa7af-909f-44e7-84cb-67cdccb56be6',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
      },
      authentication_method: 'password',
    });

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set(authHeaders(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.claims.role).toBe('authenticated');
  });

  it('allows a signup for before_user_created', async () => {
    const body = JSON.stringify({
      metadata: {
        uuid: 'a1',
        time: '2026-01-01T00:00:00Z',
        name: 'before-user-created',
        ip_address: '127.0.0.1',
      },
      user: { id: 'u1', email: 'user@example.com' },
    });

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set(authHeaders(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('returns a decision for mfa_verification_attempt', async () => {
    const body = JSON.stringify({
      factor_id: '6eab6a69-7766-48bf-95d8-bd8f606894db',
      user_id: '3919cb6e-4215-4478-a960-6d3454326cec',
      valid: true,
    });

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set(authHeaders(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ decision: 'continue' });
  });

  it('returns a decision for password_verification_attempt', async () => {
    const body = JSON.stringify({
      user_id: '3919cb6e-4215-4478-a960-6d3454326cec',
      valid: true,
    });

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set(authHeaders(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('continue');
    expect(res.body.should_logout_user).toBe(false);
  });

  it('accepts a signature list where only one entry matches (rotation)', async () => {
    const body = JSON.stringify({ user_id: 'u1', valid: true });
    const id = 'msg_rotation';
    const timestamp = String(nowSeconds());
    const good = signAuthHook(body, id, timestamp);

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set({
        'content-type': 'application/json',
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,YmFkc2lnbmF0dXJl ${good}`,
      })
      .send(body);

    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify({ user_id: 'u1', valid: true });

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set(authHeaders(body, { signature: 'v1,aW52YWxpZHNpZ25hdHVyZQ==' }))
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('rejects a signature computed over a different body', async () => {
    const body = JSON.stringify({ user_id: 'u1', valid: true });
    const headers = authHeaders(body);

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set(headers)
      .send(JSON.stringify({ user_id: 'u1', valid: false }));

    expect(res.status).toBe(400);
  });

  it('rejects the base64 secret string used directly as the HMAC key', async () => {
    // The classic Supabase bug: signing with the base64 TEXT instead of the
    // decoded bytes. A correct verifier must reject this.
    const body = JSON.stringify({ user_id: 'u1', valid: true });
    const id = 'msg_wrongkey';
    const timestamp = String(nowSeconds());
    const badSig = crypto
      .createHmac('sha256', AUTH_SECRET.replace('v1,whsec_', ''))
      .update(`${id}.${timestamp}.${body}`, 'utf8')
      .digest('base64');

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set({
        'content-type': 'application/json',
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,${badSig}`,
      })
      .send(body);

    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than the 5 minute tolerance', async () => {
    const body = JSON.stringify({ user_id: 'u1', valid: true });

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set(authHeaders(body, { timestamp: nowSeconds() - 600 }))
      .send(body);

    expect(res.status).toBe(400);
  });

  it('rejects a timestamp too far in the future', async () => {
    const body = JSON.stringify({ user_id: 'u1', valid: true });

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set(authHeaders(body, { timestamp: nowSeconds() + 600 }))
      .send(body);

    expect(res.status).toBe(400);
  });

  it('rejects a request with missing webhook-* headers', async () => {
    const body = JSON.stringify({ user_id: 'u1', valid: true });

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required headers/);
  });

  it('rejects a signature signed with a different secret', async () => {
    const body = JSON.stringify({ user_id: 'u1', valid: true });

    const res = await request(app)
      .post('/webhooks/supabase/auth-hook')
      .set(authHeaders(body, { secret: 'v1,whsec_b3RoZXJfc2VjcmV0X2tleQ==' }))
      .send(body);

    expect(res.status).toBe(400);
  });
});

// --- Health ----------------------------------------------------------------

describe('health', () => {
  it('responds ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
