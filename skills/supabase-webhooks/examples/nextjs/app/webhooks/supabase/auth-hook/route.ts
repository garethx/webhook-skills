// Generated with: supabase-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

/**
 * Supabase AUTH HOOKS receiver (HTTP Hook variant).
 *
 * Auth Hooks follow the Standard Webhooks spec exactly:
 *   - Headers: webhook-id, webhook-timestamp (UNIX seconds), webhook-signature
 *   - webhook-signature is a SPACE-DELIMITED list of `v1,<base64sig>` entries
 *     (a list so a secret can be rotated with zero downtime) — accept if ANY
 *     entry matches
 *   - Signed content is `{webhook-id}.{webhook-timestamp}.{raw_body}` over the
 *     EXACT raw body bytes
 *   - +/- 5 minute timestamp tolerance, constant-time comparison
 *
 * Auth Hooks are REQUEST/RESPONSE, not fire-and-forget: the auth flow blocks on
 * this reply and the JSON returned below changes what Supabase Auth does next.
 * The whole invocation has a 5-second budget INCLUDING up to three retries
 * (on 429 / 503) at a two-second backoff — keep this handler fast. A 429/503 is
 * only retried if the response ALSO carries a non-empty `retry-after` header.
 *
 * Always respond with Content-Type: application/json. 204 is not supported by
 * custom_access_token / mfa_verification_attempt / password_verification_attempt
 * (they need a body), and 400/403 are turned into a 500 for your application.
 */

export interface AuthHookPayload {
  // send_email
  email_data?: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new: string;
    token_hash_new: string;
    old_email: string;
    old_phone: string;
    provider: string;
    factor_type: string;
  };
  // send_sms
  sms?: { otp: string };
  // send_email / send_sms / before_user_created carry the auth.users row
  user?: Record<string, unknown>;
  // custom_access_token
  claims?: Record<string, unknown>;
  authentication_method?: string;
  // before_user_created
  metadata?: { uuid: string; time: string; name: string; ip_address: string };
  // mfa_verification_attempt / password_verification_attempt
  factor_id?: string;
  user_id?: string;
  valid?: boolean;
}

/**
 * Verify a Supabase Auth Hook.
 *
 * The secret is issued as `v1,whsec_<base64>`. Strip the `v1,whsec_` prefix —
 * the library base64-DECODES what remains into the raw HMAC key. Using the
 * base64 string itself as the key is the classic bug and rejects every real
 * delivery.
 *
 * @throws WebhookVerificationError when the request is not authentic
 */
export function verifyAuthHook(
  rawBody: string,
  headers: Headers,
  secret: string
): AuthHookPayload {
  const wh = new Webhook(secret.replace('v1,whsec_', ''));
  return wh.verify(rawBody, {
    'webhook-id': headers.get('webhook-id') as string,
    'webhook-timestamp': headers.get('webhook-timestamp') as string,
    'webhook-signature': headers.get('webhook-signature') as string,
  }) as AuthHookPayload;
}

export async function POST(request: NextRequest) {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET;
  if (!secret) {
    console.error('SUPABASE_AUTH_HOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (
    !request.headers.get('webhook-id') ||
    !request.headers.get('webhook-timestamp') ||
    !request.headers.get('webhook-signature')
  ) {
    return NextResponse.json(
      {
        error:
          'Missing required headers (webhook-id, webhook-timestamp, webhook-signature)',
      },
      { status: 400 }
    );
  }

  // CRITICAL: raw body — the signature covers the exact bytes received.
  // request.json() would re-serialise and break verification.
  const rawBody = await request.text();

  let payload: AuthHookPayload;
  try {
    payload = verifyAuthHook(rawBody, request.headers, secret);
  } catch (err) {
    console.error(
      'Supabase Auth Hook verification failed:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Supabase sends no hook-name header, so the hook is inferred from the
  // payload shape. Configure one endpoint per hook if you prefer explicit
  // routing.

  if (payload.email_data) {
    // send_email: YOU are responsible for actually sending the email
    console.log(
      `send_email for ${payload.user?.email}: ${payload.email_data.email_action_type}`
    );
    // TODO: send via your provider using email_data.token / token_hash
    // To ask Supabase to retry, `retry-after` is REQUIRED alongside 429/503:
    // return NextResponse.json(
    //   { error: { http_code: 503, message: 'Email provider unavailable' } },
    //   { status: 503, headers: { 'retry-after': 'true' } }
    // );
    return NextResponse.json({});
  }

  if (payload.sms) {
    // send_sms: YOU are responsible for actually sending the SMS
    console.log(`send_sms to ${payload.user?.phone}: otp ${payload.sms.otp}`);
    // TODO: send via your SMS provider
    return NextResponse.json({});
  }

  if (payload.claims) {
    // custom_access_token: return the claims you want in the issued JWT
    console.log(`custom_access_token for ${payload.user_id}`);
    return NextResponse.json({ claims: { ...payload.claims } });
  }

  if (payload.metadata?.name === 'before-user-created') {
    // before_user_created: {} allows the signup; a 4xx + error object rejects it
    console.log(`before_user_created for ${payload.user?.email}`);
    // Example rejection:
    // return NextResponse.json(
    //   { error: { http_code: 400, message: 'Signups from this domain are not allowed' } },
    //   { status: 400 }
    // );
    return NextResponse.json({});
  }

  if (payload.factor_id !== undefined) {
    // mfa_verification_attempt
    console.log(
      `mfa_verification_attempt user=${payload.user_id} valid=${payload.valid}`
    );
    return NextResponse.json({ decision: 'continue' });
  }

  if (payload.user_id !== undefined && payload.valid !== undefined) {
    // password_verification_attempt
    console.log(
      `password_verification_attempt user=${payload.user_id} valid=${payload.valid}`
    );
    return NextResponse.json({
      decision: 'continue',
      message: '',
      should_logout_user: false,
    });
  }

  console.log('Unhandled Supabase Auth Hook payload shape');
  return NextResponse.json({});
}
