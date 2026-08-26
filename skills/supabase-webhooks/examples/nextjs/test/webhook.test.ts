// Generated with: supabase-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Secrets must be in the environment before the handlers read them.
const DB_SECRET = 'db-webhook-shared-secret';
// The base64 part of the Auth Hook secret decodes to the raw HMAC key
// ("test_secret_key" here).
const AUTH_SECRET = 'v1,whsec_dGVzdF9zZWNyZXRfa2V5';

process.env.SUPABASE_WEBHOOK_SECRET = DB_SECRET;
process.env.SUPABASE_AUTH_HOOK_SECRET = AUTH_SECRET;

import { NextRequest } from 'next/server';
import {
  POST as databaseWebhookPOST,
  authenticateDatabaseWebhook,
} from '../app/webhooks/supabase/route';
import { POST as authHookPOST } from '../app/webhooks/supabase/auth-hook/route';

beforeAll(() => {
  process.env.SUPABASE_WEBHOOK_SECRET = DB_SECRET;
  process.env.SUPABASE_AUTH_HOOK_SECRET = AUTH_SECRET;
});

/**
 * Sign a payload exactly the way Supabase Auth does.
 * Standard Webhooks: base64(HMAC_SHA256(key, "{id}.{timestamp}.{rawBody}"))
 * where `key` is the base64-DECODED portion after "v1,whsec_".
 */
function signAuthHook(
  rawBody: string,
  id: string,
  timestamp: string,
  secret: string = AUTH_SECRET
): string {
  const key = Buffer.from(secret.replace('v1,whsec_', ''), 'base64');
  const signature = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${signature}`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function dbRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/supabase', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

function authRequest(
  body: string,
  overrides: {
    id?: string;
    timestamp?: number;
    signature?: string;
    secret?: string;
    omitHeaders?: boolean;
  } = {}
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (!overrides.omitHeaders) {
    const id = overrides.id || `msg_${crypto.randomUUID()}`;
    const timestamp = String(overrides.timestamp ?? nowSeconds());
    headers['webhook-id'] = id;
    headers['webhook-timestamp'] = timestamp;
    headers['webhook-signature'] =
      overrides.signature ?? signAuthHook(body, id, timestamp, overrides.secret);
  }

  return new NextRequest('http://localhost:3000/webhooks/supabase/auth-hook', {
    method: 'POST',
    headers,
    body,
  });
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
    const body = JSON.stringify(insertPayload);
    const res = await databaseWebhookPOST(
      dbRequest(body, { authorization: `Bearer ${DB_SECRET}` })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
  });

  it('accepts the x-webhook-secret header as an alternative', async () => {
    const body = JSON.stringify(insertPayload);
    const res = await databaseWebhookPOST(
      dbRequest(body, { 'x-webhook-secret': DB_SECRET })
    );

    expect(res.status).toBe(200);
  });

  it('rejects a request with no shared secret', async () => {
    const res = await databaseWebhookPOST(dbRequest(JSON.stringify(insertPayload)));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('rejects a request with the wrong shared secret', async () => {
    const res = await databaseWebhookPOST(
      dbRequest(JSON.stringify(insertPayload), {
        authorization: 'Bearer not-the-secret',
      })
    );

    expect(res.status).toBe(401);
  });

  it('rejects a secret of the right length but wrong content', async () => {
    const res = await databaseWebhookPOST(
      dbRequest(JSON.stringify(insertPayload), {
        authorization: `Bearer ${'x'.repeat(DB_SECRET.length)}`,
      })
    );

    expect(res.status).toBe(401);
  });

  it('rejects an invalid JSON body', async () => {
    const res = await databaseWebhookPOST(
      dbRequest('not json', { authorization: `Bearer ${DB_SECRET}` })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON' });
  });

  it('handles an UPDATE payload with both record and old_record', async () => {
    const body = JSON.stringify({
      type: 'UPDATE',
      table: 'orders',
      schema: 'public',
      record: { id: 1, status: 'shipped' },
      old_record: { id: 1, status: 'paid' },
    });
    const res = await databaseWebhookPOST(
      dbRequest(body, { authorization: `Bearer ${DB_SECRET}` })
    );

    expect(res.status).toBe(200);
  });

  it('handles a DELETE payload where record is null', async () => {
    const body = JSON.stringify({
      type: 'DELETE',
      table: 'orders',
      schema: 'public',
      record: null,
      old_record: { id: 1, status: 'shipped' },
    });
    const res = await databaseWebhookPOST(
      dbRequest(body, { authorization: `Bearer ${DB_SECRET}` })
    );

    expect(res.status).toBe(200);
  });

  it('acknowledges an unknown type without failing', async () => {
    const body = JSON.stringify({ type: 'TRUNCATE', table: 'orders', schema: 'public' });
    const res = await databaseWebhookPOST(
      dbRequest(body, { authorization: `Bearer ${DB_SECRET}` })
    );

    expect(res.status).toBe(200);
  });

  it('authenticateDatabaseWebhook is case-insensitive about the Bearer scheme', () => {
    const headers = new Headers({ authorization: `bearer ${DB_SECRET}` });
    expect(authenticateDatabaseWebhook(headers, DB_SECRET)).toBe(true);
  });

  it('authenticateDatabaseWebhook returns false when no secret is configured', () => {
    const headers = new Headers({ authorization: `Bearer ${DB_SECRET}` });
    expect(authenticateDatabaseWebhook(headers, undefined)).toBe(false);
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

    const res = await authHookPOST(authRequest(body));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({});
  });

  it('returns an empty object for send_sms', async () => {
    const body = JSON.stringify({
      user: { id: 'u1', phone: '+15551234567' },
      sms: { otp: '561166' },
    });

    const res = await authHookPOST(authRequest(body));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({});
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

    const res = await authHookPOST(authRequest(body));
    const json = (await res.json()) as { claims: Record<string, unknown> };

    expect(res.status).toBe(200);
    expect(json.claims.role).toBe('authenticated');
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

    const res = await authHookPOST(authRequest(body));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({});
  });

  it('returns a decision for mfa_verification_attempt', async () => {
    const body = JSON.stringify({
      factor_id: '6eab6a69-7766-48bf-95d8-bd8f606894db',
      user_id: '3919cb6e-4215-4478-a960-6d3454326cec',
      valid: true,
    });

    const res = await authHookPOST(authRequest(body));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ decision: 'continue' });
  });

  it('returns a decision for password_verification_attempt', async () => {
    const body = JSON.stringify({
      user_id: '3919cb6e-4215-4478-a960-6d3454326cec',
      valid: true,
    });

    const res = await authHookPOST(authRequest(body));
    const json = (await res.json()) as {
      decision: string;
      should_logout_user: boolean;
    };

    expect(res.status).toBe(200);
    expect(json.decision).toBe('continue');
    expect(json.should_logout_user).toBe(false);
  });

  it('accepts a signature list where only one entry matches (rotation)', async () => {
    const body = JSON.stringify({ user_id: 'u1', valid: true });
    const id = 'msg_rotation';
    const timestamp = String(nowSeconds());
    const good = signAuthHook(body, id, timestamp);

    const res = await authHookPOST(
      authRequest(body, {
        id,
        timestamp: Number(timestamp),
        signature: `v1,YmFkc2lnbmF0dXJl ${good}`,
      })
    );

    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify({ user_id: 'u1', valid: true });

    const res = await authHookPOST(
      authRequest(body, { signature: 'v1,aW52YWxpZHNpZ25hdHVyZQ==' })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid signature' });
  });

  it('rejects a signature computed over a different body', async () => {
    const signedBody = JSON.stringify({ user_id: 'u1', valid: true });
    const id = 'msg_tamper';
    const timestamp = String(nowSeconds());

    const req = new NextRequest('http://localhost:3000/webhooks/supabase/auth-hook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        'webhook-signature': signAuthHook(signedBody, id, timestamp),
      },
      body: JSON.stringify({ user_id: 'u1', valid: false }),
    });

    const res = await authHookPOST(req);
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

    const res = await authHookPOST(
      authRequest(body, {
        id,
        timestamp: Number(timestamp),
        signature: `v1,${badSig}`,
      })
    );

    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than the 5 minute tolerance', async () => {
    const body = JSON.stringify({ user_id: 'u1', valid: true });

    const res = await authHookPOST(
      authRequest(body, { timestamp: nowSeconds() - 600 })
    );

    expect(res.status).toBe(400);
  });

  it('rejects a timestamp too far in the future', async () => {
    const body = JSON.stringify({ user_id: 'u1', valid: true });

    const res = await authHookPOST(
      authRequest(body, { timestamp: nowSeconds() + 600 })
    );

    expect(res.status).toBe(400);
  });

  it('rejects a request with missing webhook-* headers', async () => {
    const body = JSON.stringify({ user_id: 'u1', valid: true });

    const res = await authHookPOST(authRequest(body, { omitHeaders: true }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/Missing required headers/);
  });

  it('rejects a signature signed with a different secret', async () => {
    const body = JSON.stringify({ user_id: 'u1', valid: true });

    const res = await authHookPOST(
      authRequest(body, { secret: 'v1,whsec_b3RoZXJfc2VjcmV0X2tleQ==' })
    );

    expect(res.status).toBe(400);
  });
});
