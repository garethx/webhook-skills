// Generated with: supabase-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Supabase has TWO webhook surfaces with DIFFERENT security models:
//
//   1. Database Webhooks (/webhooks/supabase)
//      Postgres trigger -> pg_net. UNSIGNED. Supabase defines no HMAC, no
//      signing secret and no verification header for this surface. The only
//      authentication is whatever you put in the trigger's headers JSON.
//
//   2. Auth Hooks (/webhooks/supabase/auth-hook)
//      Supabase Auth -> your endpoint, signed per the Standard Webhooks spec
//      (webhook-id / webhook-timestamp / webhook-signature).
//
// Do not apply one's verification to the other.
// ---------------------------------------------------------------------------

// === Database Webhooks: developer-configured shared secret ==================

/** Constant-time string compare that tolerates a length mismatch. */
function timingSafeEqualStr(a, b) {
  const x = Buffer.from(a || '', 'utf8');
  const y = Buffer.from(b || '', 'utf8');
  if (x.length !== y.length) return false; // length is not the secret here
  return crypto.timingSafeEqual(x, y);
}

/**
 * Authenticate a Supabase Database Webhook.
 *
 * NOTE: this is a DEVELOPER-CONFIGURED shared secret, not a Supabase signature.
 * It only works because the same value is set in the webhook's HTTP headers,
 * e.g. `{"Authorization":"Bearer <secret>"}` in the trigger definition.
 */
function authenticateDatabaseWebhook(headers, secret) {
  if (!secret) return false;
  const authorization = headers['authorization'] || '';
  const presented = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : headers['x-webhook-secret'] || '';
  return timingSafeEqualStr(presented, secret);
}

// === Auth Hooks: Standard Webhooks HMAC-SHA256 ==============================

/**
 * Verify a Supabase Auth Hook using the `standardwebhooks` package.
 *
 * The secret is issued as `v1,whsec_<base64>`. Strip the `v1,whsec_` prefix —
 * the library base64-DECODES what remains into the raw HMAC key. Using the
 * base64 string itself as the key is the classic bug and rejects every real
 * delivery.
 *
 * The library signs `{webhook-id}.{webhook-timestamp}.{raw_body}`, base64s the
 * HMAC-SHA256, compares in constant time against every space-delimited
 * `v1,<sig>` entry, and enforces a +/- 5 minute timestamp tolerance.
 *
 * @throws {Error} WebhookVerificationError when the request is not authentic
 * @returns {object} the parsed, verified payload
 */
function verifyAuthHook(rawBody, headers, secret) {
  const wh = new Webhook(secret.replace('v1,whsec_', ''));
  return wh.verify(rawBody, {
    'webhook-id': headers['webhook-id'],
    'webhook-timestamp': headers['webhook-timestamp'],
    'webhook-signature': headers['webhook-signature'],
  });
}

// === Routes =================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Database Webhook receiver.
 *
 * Payload is always one of three shapes, discriminated by an UPPERCASE `type`:
 *   INSERT: { type, table, schema, record, old_record: null }
 *   UPDATE: { type, table, schema, record, old_record }
 *   DELETE: { type, table, schema, record: null, old_record }
 *
 * `record` / `old_record` mirror your table's columns, so their inner shape is
 * defined by your schema, not by Supabase.
 */
app.post(
  '/webhooks/supabase',
  // Use express.raw() so the body is untouched; also lets you switch to a
  // signed surface later without changing the parsing strategy.
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.SUPABASE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('SUPABASE_WEBHOOK_SECRET is not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!authenticateDatabaseWebhook(req.headers, secret)) {
      // 401, not 400: this is an authentication failure, not a malformed body
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const { type, table, schema, record, old_record: oldRecord } = payload;

    switch (type) {
      case 'INSERT':
        console.log(`INSERT on ${schema}.${table}:`, record);
        // TODO: index the new row, enqueue onboarding, etc.
        // Supabase sends no delivery id, so dedupe on a primary key in `record`
        break;

      case 'UPDATE':
        console.log(`UPDATE on ${schema}.${table}:`, { record, oldRecord });
        // TODO: diff `record` against `old_record` and sync downstream
        break;

      case 'DELETE':
        console.log(`DELETE on ${schema}.${table}:`, oldRecord);
        // TODO: tombstone downstream records; `record` is null here
        break;

      default:
        console.log('Unhandled Supabase Database Webhook type:', type);
    }

    // pg_net is fire-and-forget with the trigger's timeout_ms and Supabase
    // documents no retry policy — acknowledge fast and do slow work out of band.
    res.status(200).json({ received: true });
  }
);

/**
 * Auth Hook receiver.
 *
 * Auth Hooks are REQUEST/RESPONSE, not fire-and-forget: the auth flow blocks on
 * this reply and the JSON body below changes what Supabase Auth does next. The
 * whole invocation has a 5-second budget INCLUDING up to three retries (429 /
 * 503) at a two-second backoff, so keep this handler fast. A 429/503 is only
 * retried if the response ALSO carries a non-empty `retry-after` header.
 *
 * Always respond with Content-Type: application/json. 204 is not supported by
 * custom_access_token / mfa_verification_attempt / password_verification_attempt
 * (they need a body), and 400/403 are turned into a 500 for your application.
 */
app.post(
  '/webhooks/supabase/auth-hook',
  // CRITICAL: raw body — the signature covers the exact bytes received
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.SUPABASE_AUTH_HOOK_SECRET;
    if (!secret) {
      console.error('SUPABASE_AUTH_HOOK_SECRET is not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (
      !req.headers['webhook-id'] ||
      !req.headers['webhook-timestamp'] ||
      !req.headers['webhook-signature']
    ) {
      return res.status(400).json({
        error:
          'Missing required headers (webhook-id, webhook-timestamp, webhook-signature)',
      });
    }

    let payload;
    try {
      payload = verifyAuthHook(req.body, req.headers, secret);
    } catch (err) {
      console.error('Supabase Auth Hook verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Which hook fired is inferred from the payload shape — Supabase does not
    // send a hook-name header. Configure one endpoint per hook if you prefer.
    if (payload.email_data) {
      // send_email: YOU are responsible for actually sending the email
      console.log(
        `send_email for ${payload.user?.email}: ${payload.email_data.email_action_type}`
      );
      // TODO: send via your provider using email_data.token / token_hash
      // To ask Supabase to retry, `retry-after` is REQUIRED alongside 429/503:
      // return res.status(503).set('retry-after', 'true').json({
      //   error: { http_code: 503, message: 'Email provider unavailable' },
      // });
      return res.status(200).json({});
    }

    if (payload.sms) {
      // send_sms: YOU are responsible for actually sending the SMS
      console.log(`send_sms to ${payload.user?.phone}: otp ${payload.sms.otp}`);
      // TODO: send via your SMS provider
      return res.status(200).json({});
    }

    if (payload.claims) {
      // custom_access_token: return the claims you want in the issued JWT
      console.log(`custom_access_token for ${payload.user_id}`);
      return res.status(200).json({
        claims: { ...payload.claims, app_metadata: { ...payload.claims.app_metadata } },
      });
    }

    if (payload.metadata?.name === 'before-user-created') {
      // before_user_created: {} allows the signup; a 4xx + error object rejects
      console.log(`before_user_created for ${payload.user?.email}`);
      // Example rejection:
      // return res.status(400).json({
      //   error: { http_code: 400, message: 'Signups from this domain are not allowed' },
      // });
      return res.status(200).json({});
    }

    if (payload.factor_id !== undefined) {
      // mfa_verification_attempt
      console.log(
        `mfa_verification_attempt user=${payload.user_id} valid=${payload.valid}`
      );
      return res.status(200).json({ decision: 'continue' });
    }

    if (payload.user_id !== undefined && payload.valid !== undefined) {
      // password_verification_attempt
      console.log(
        `password_verification_attempt user=${payload.user_id} valid=${payload.valid}`
      );
      return res.status(200).json({
        decision: 'continue',
        message: '',
        should_logout_user: false,
      });
    }

    console.log('Unhandled Supabase Auth Hook payload shape');
    return res.status(200).json({});
  }
);

const server = app.listen(PORT, () => {
  console.log(`Supabase webhook server running on port ${PORT}`);
  console.log(`  Database Webhooks: http://localhost:${PORT}/webhooks/supabase`);
  console.log(`  Auth Hooks:        http://localhost:${PORT}/webhooks/supabase/auth-hook`);
});

module.exports = {
  app,
  server,
  authenticateDatabaseWebhook,
  verifyAuthHook,
  timingSafeEqualStr,
};
