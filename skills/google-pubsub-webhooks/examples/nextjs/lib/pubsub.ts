// Generated with: google-pubsub-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';

/** The wrapped push envelope Pub/Sub POSTs to a push endpoint. */
export interface PubSubPushEnvelope {
  message?: {
    data?: string; // base64; ABSENT for attribute-only messages
    attributes?: Record<string, string>;
    messageId?: string;
    publishTime?: string;
    orderingKey?: string;
  };
  subscription?: string;
  deliveryAttempt?: number;
}

export type AuthResult =
  | { ok: true; claims: Record<string, unknown> | null }
  | { ok: false; status: number; error: string };

// One client for the process: it fetches Google's public signing keys once and
// caches them, honouring the endpoint's Cache-Control max-age.
export const authClient = new OAuth2Client();

// Pub/Sub push tokens are issued by this issuer. google-auth-library also
// accepts googleapis.com, so we pin the exact one ourselves.
const GOOGLE_ISSUER = 'https://accounts.google.com';

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify the OIDC token Pub/Sub attaches to an authenticated push subscription.
 *
 * There is NO signing secret and NO HMAC header — the `Authorization: Bearer`
 * JWT proves the CALLER (your push service account), not the body contents.
 * That is also why this handler does not need the raw body.
 *
 * @returns the token claims, or null if verification failed.
 */
export async function verifyPushJwt(
  authorizationHeader: string | null,
  { audience, serviceAccountEmail }: { audience: string; serviceAccountEmail: string }
): Promise<Record<string, unknown> | null> {
  const [scheme, token] = String(authorizationHeader || '').split(' ');
  if (scheme !== 'Bearer' || !token) return null;

  let claims;
  try {
    // Verifies the RS256 signature against Google's public keys, plus aud + exp.
    const ticket = await authClient.verifyIdToken({ idToken: token, audience });
    claims = ticket.getPayload();
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    console.error('Pub/Sub OIDC verification failed:', detail);
    return null;
  }
  if (!claims) return null;

  // Checks the library does NOT do for you. Without the email check, any
  // Google-signed token with the right audience would be accepted.
  if (claims.iss !== GOOGLE_ISSUER) return null;
  if (claims.email !== serviceAccountEmail) return null;
  if (claims.email_verified !== true) return null;

  return claims as Record<string, unknown>;
}

/**
 * Authenticate a push request. Fails closed: if the endpoint is configured with
 * neither OIDC nor a URL token, requests are rejected unless
 * PUBSUB_ALLOW_UNAUTHENTICATED is explicitly set (for the Pub/Sub emulator,
 * which sends no Authorization header at all).
 */
export async function authenticate(request: Request): Promise<AuthResult> {
  const audience = process.env.PUBSUB_AUDIENCE;
  const serviceAccountEmail = process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL;
  const verificationToken = process.env.PUBSUB_VERIFICATION_TOKEN;
  const allowUnauthenticated = process.env.PUBSUB_ALLOW_UNAUTHENTICATED === 'true';

  // Optional shared token embedded in the push endpoint URL (?token=...).
  // A DIY convention, not a Google-defined scheme — see references/verification.md.
  if (verificationToken) {
    const provided = new URL(request.url).searchParams.get('token') || '';
    if (!timingSafeCompare(provided, verificationToken)) {
      return { ok: false, status: 401, error: 'Invalid verification token' };
    }
  }

  if (serviceAccountEmail && audience) {
    const claims = await verifyPushJwt(request.headers.get('authorization'), {
      audience,
      serviceAccountEmail,
    });
    if (!claims) return { ok: false, status: 401, error: 'Invalid OIDC token' };
    return { ok: true, claims };
  }

  if (verificationToken || allowUnauthenticated) {
    return { ok: true, claims: null };
  }

  // Misconfiguration, not a bad request: refuse rather than accept anything.
  console.error(
    'Set PUBSUB_AUDIENCE + PUBSUB_SERVICE_ACCOUNT_EMAIL, PUBSUB_VERIFICATION_TOKEN, ' +
      'or PUBSUB_ALLOW_UNAUTHENTICATED=true.'
  );
  return {
    ok: false,
    status: 500,
    error: 'Endpoint is not configured to authenticate Pub/Sub push requests',
  };
}

/** `message.data` is base64 and MAY be absent (attribute-only messages). */
export function decodeData(data: string | undefined | null): unknown {
  if (data === undefined || data === null) return null;
  const text = Buffer.from(data, 'base64').toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return text; // Pub/Sub payloads are arbitrary bytes, not necessarily JSON.
  }
}
