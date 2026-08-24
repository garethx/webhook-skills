// Generated with: azure-event-grid-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Azure Event Grid verification helpers.
//
// IMPORTANT: Event Grid does NOT sign the request body. There is no signature
// header, no HMAC, no shared signing secret. Nothing in this file computes an
// HMAC over the payload, and nothing should. Trust comes from:
//
//   1. an ownership handshake at subscription time (two flavours, below), and
//   2. authentication on the delivery channel (a custom delivery-property
//      header you configured, or a Microsoft Entra ID bearer token).
import crypto from 'crypto';

import jwt from 'jsonwebtoken';

// Emitted by the Microsoft.EventGrid resource provider itself.
export const VALIDATION_EVENT_TYPE = 'Microsoft.EventGrid.SubscriptionValidationEvent';
export const SUBSCRIPTION_DELETED_EVENT_TYPE = 'Microsoft.EventGrid.SubscriptionDeletedEvent';

// Default name for the static delivery property carrying the shared secret.
// NEVER use the `aeg-` prefix: it is reserved for Event Grid system properties.
export const DEFAULT_SECRET_HEADER = 'x-eventgrid-token';

// Default query-parameter name carrying the shared secret. Event Grid "includes
// all the query parameters in every event delivery request to the webhook", so a
// secret placed in the subscription's endpoint URL arrives on every delivery.
export const DEFAULT_SECRET_QUERY_PARAM = 'token';

export interface NormalizedEvent {
  schema: 'eventgrid' | 'cloudevents';
  id?: string;
  type?: string;
  subject?: string;
  time?: string;
  source?: string;
  data?: any;
  raw: Record<string, any>;
}

export type AuthResult =
  | { ok: true; subscriptionName: string; claims: any }
  | { ok: false; status: number; error: string };

/**
 * Replaceable signing-key resolver for Microsoft Entra ID tokens.
 * Production resolves against Entra's JWKS endpoint; tests swap in a local key.
 */
export const signingKeys = {
  clients: new Map<string, any>(),
  async resolve(kid: string, tenantId: string): Promise<string> {
    // Required lazily: jwks-rsa pulls in the ESM-only `jose`, and it is only
    // needed when the endpoint is actually protected with Microsoft Entra ID.
    const { JwksClient } = await import('jwks-rsa');
    if (!this.clients.has(tenantId)) {
      this.clients.set(
        tenantId,
        new JwksClient({
          jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
          cache: true,
          rateLimit: true,
        })
      );
    }
    const key = await this.clients.get(tenantId).getSigningKey(kid);
    return key.getPublicKey();
  },
};

function parseList(
  value?: string | null,
  { lowercase = true }: { lowercase?: boolean } = {}
): string[] {
  return String(value || '')
    .split(',')
    .map((item) => (lowercase ? item.trim().toLowerCase() : item.trim()))
    .filter(Boolean);
}

/**
 * Constant-time comparison of the shared secret delivered as a static delivery
 * property. This is a string comparison, NOT a signature check — there is no
 * signature to check. Fails closed when `expected` is unset.
 */
/**
 * Constant-time match of `received` against ANY of the accepted secrets.
 *
 * Accepting a list is what makes secret rotation safe. The Event Grid docs:
 * "If you update the client secret, you also need to update the event
 * subscription. To avoid delivery failures during this secret rotation, make
 * the webhook accept both old and new secrets for a limited duration before
 * updating the event subscription with the new secret."
 *
 * Fails CLOSED on an empty accepted list — never treat "unset" as "allow all".
 */
export function checkAgainstAny(received?: string | null, expectedCsv?: string | null): boolean {
  const accepted = parseList(expectedCsv, { lowercase: false });
  if (accepted.length === 0) return false;
  // Compare against every candidate (no early return) so timing does not leak
  // which secret in the rotation set matched.
  return accepted.reduce<boolean>(
    (matched, candidate) => checkDeliverySecret(received, candidate) || matched,
    false
  );
}

export function checkDeliverySecret(received?: string | null, expected?: string | null): boolean {
  if (!expected) return false;
  const a = Buffer.from(String(received || ''));
  const b = Buffer.from(String(expected));
  // timingSafeEqual throws when the buffers differ in length.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Validate the Microsoft Entra ID bearer token Event Grid attaches when the
 * event subscription is configured with --azure-active-directory-tenant-id and
 * --azure-active-directory-application-id-or-uri.
 *
 * The Event Grid docs say the token is passed and must be validated, but do not
 * publish the token's claim set — so this is the standard Entra JWT pattern
 * (signature + audience + issuer + expiry) and nothing is hard-coded beyond it.
 */
export async function verifyEntraToken(
  authorizationHeader: string | null,
  { tenantId, audience }: { tenantId: string; audience: string }
): Promise<any | null> {
  // RFC 9110 makes the auth scheme case-insensitive.
  const [scheme, token] = String(authorizationHeader || '').split(' ');
  if (!token || String(scheme).toLowerCase() !== 'bearer') return null;

  const decoded = jwt.decode(token.trim(), { complete: true }) as any;
  if (!decoded?.header?.kid) return null;

  let key: string;
  try {
    key = await signingKeys.resolve(decoded.header.kid, tenantId);
  } catch (err: any) {
    console.error('Entra signing key lookup failed:', err.message);
    return null;
  }

  try {
    return jwt.verify(token.trim(), key, {
      // Pin the algorithm: never let the token choose (and never `alg: none`).
      algorithms: ['RS256'],
      audience, // your application ID or Application ID URI
      // Entra issues both v2.0 and v1.0 issuer forms; accept the pair for this tenant.
      issuer: [
        `https://login.microsoftonline.com/${tenantId}/v2.0`,
        `https://sts.windows.net/${tenantId}/`,
      ],
    });
  } catch (err: any) {
    console.error('Entra token validation failed:', err.message);
    return null;
  }
}

/**
 * Authenticate an Event Grid request.
 *
 * @param getHeader     lowercase header lookup
 * @param isValidation  true when the body carries a SubscriptionValidationEvent
 */
export async function authenticate(
  getHeader: (name: string) => string | null,
  {
    isValidation = false,
    getQueryParam = () => null,
  }: { isValidation?: boolean; getQueryParam?: (name: string) => string | null } = {}
): Promise<AuthResult> {
  const expectedSubscriptions = parseList(process.env.AZURE_EVENT_GRID_SUBSCRIPTION_NAMES);
  const allowUnauthenticated = process.env.AZURE_EVENT_GRID_ALLOW_UNAUTHENTICATED === 'true';
  const subscriptionName = String(getHeader('aeg-subscription-name') || '')
    .trim()
    .toLowerCase();

  // --- Identity guard on the subscription name -----------------------------
  // The docs: check `aeg-subscription-name` "to ascertain that it's an event
  // subscription that you recognize". Otherwise anyone who learns this URL can
  // point their own subscription at it and flood you with events.
  if (expectedSubscriptions.length > 0) {
    if (!subscriptionName || !expectedSubscriptions.includes(subscriptionName)) {
      return { ok: false, status: 403, error: 'Unrecognized event subscription' };
    }
  } else if (isValidation && !allowUnauthenticated) {
    // Completing the handshake for an unknown subscription is the exact attack
    // the handshake exists to prevent, so refuse rather than echo blindly.
    console.error(
      'Set AZURE_EVENT_GRID_SUBSCRIPTION_NAMES to the event subscription name(s) you created.'
    );
    return {
      ok: false,
      status: 403,
      error: 'No expected event subscriptions configured; refusing to validate',
    };
  }

  // --- Channel authentication ----------------------------------------------
  const deliverySecret = process.env.AZURE_EVENT_GRID_DELIVERY_SECRET;
  const secretHeader = (
    process.env.AZURE_EVENT_GRID_DELIVERY_SECRET_HEADER || DEFAULT_SECRET_HEADER
  ).toLowerCase();
  const querySecret = process.env.AZURE_EVENT_GRID_QUERY_SECRET;
  const secretQueryParam =
    process.env.AZURE_EVENT_GRID_QUERY_SECRET_PARAM || DEFAULT_SECRET_QUERY_PARAM;
  const tenantId = process.env.AZURE_EVENT_GRID_ENTRA_TENANT_ID;
  const audience = process.env.AZURE_EVENT_GRID_ENTRA_AUDIENCE;

  // Client secret as a QUERY PARAMETER. Documented at
  // learn.microsoft.com/en-us/azure/event-grid/security-authentication as a
  // first-class auth method for webhook handlers: you append the secret to the
  // subscription's endpoint URL and Event Grid replays every query parameter on
  // every delivery. Azure stores these encrypted, keeps them out of service logs,
  // and withholds them when reading the subscription unless you pass
  // `--include-full-endpoint-url`.
  if (querySecret) {
    if (!checkAgainstAny(getQueryParam(secretQueryParam), querySecret)) {
      return { ok: false, status: 401, error: 'Invalid delivery credential' };
    }
    return { ok: true, subscriptionName, claims: null };
  }

  if (deliverySecret) {
    if (!checkAgainstAny(getHeader(secretHeader), deliverySecret)) {
      return { ok: false, status: 401, error: 'Invalid delivery credential' };
    }
    return { ok: true, subscriptionName, claims: null };
  }

  if (tenantId && audience) {
    const claims = await verifyEntraToken(getHeader('authorization'), { tenantId, audience });
    if (!claims) return { ok: false, status: 401, error: 'Invalid Entra ID token' };
    return { ok: true, subscriptionName, claims };
  }

  if (allowUnauthenticated) {
    return { ok: true, subscriptionName, claims: null };
  }

  // Misconfiguration, not a bad request: refuse rather than accept anything.
  console.error(
    'Set AZURE_EVENT_GRID_QUERY_SECRET, AZURE_EVENT_GRID_DELIVERY_SECRET, or ' +
      'AZURE_EVENT_GRID_ENTRA_TENANT_ID + AZURE_EVENT_GRID_ENTRA_AUDIENCE, or ' +
      'AZURE_EVENT_GRID_ALLOW_UNAUTHENTICATED=true.'
  );
  return {
    ok: false,
    status: 500,
    error: 'Endpoint is not configured to authenticate Event Grid deliveries',
  };
}

/**
 * Normalise both delivery schemas into one shape.
 *
 * Event Grid schema arrives as a JSON ARRAY ("Event Grid sends the events to
 * subscribers in an array that has a single event" — but batching can put up to
 * 5,000 in it, so always loop). CloudEvents v1.0 structured mode arrives as a
 * single JSON OBJECT.
 */
export function normalizeEvents(body: unknown): NormalizedEvent[] | null {
  if (body === null || typeof body !== 'object') return null;
  const items = (Array.isArray(body) ? body : [body]) as Record<string, any>[];
  if (items.length === 0) return null;
  if (items.some((item) => item === null || typeof item !== 'object')) return null;

  return items.map((event) =>
    event.specversion
      ? {
          schema: 'cloudevents' as const,
          id: event.id,
          type: event.type,
          subject: event.subject,
          time: event.time,
          source: event.source,
          data: event.data,
          raw: event,
        }
      : {
          schema: 'eventgrid' as const,
          id: event.id,
          type: event.eventType,
          subject: event.subject,
          time: event.eventTime,
          source: event.topic,
          data: event.data,
          raw: event,
        }
  );
}

/**
 * Find the subscription validation code, if this request is the Event Grid
 * schema handshake. CloudEvents subscriptions never send this event — they get
 * the HTTP OPTIONS abuse-protection preflight instead.
 */
export function findValidationCode(events: NormalizedEvent[]): string | null {
  const validation = events.find((event) => event.type === VALIDATION_EVENT_TYPE);
  const code = validation?.data?.validationCode;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

/**
 * CloudEvents v1.0 abuse-protection preflight (HTTP OPTIONS).
 *
 * Consent is signalled by the RESPONSE HEADERS, not the status code — the spec
 * is explicit that the handshake "can't rely on status codes". To refuse,
 * withhold `WebHook-Allowed-Origin`.
 *
 * Note this handshake "doesn't aim to establish an authentication or
 * authorization context" — it only proves the endpoint expects traffic.
 */
export function handleAbuseProtection(requestOrigin: string | null): {
  status: number;
  headers: Record<string, string>;
} {
  const allowedOrigins = parseList(process.env.AZURE_EVENT_GRID_ALLOWED_ORIGINS || '*');
  const rate = process.env.AZURE_EVENT_GRID_ALLOWED_RATE || '120';

  if (!requestOrigin) {
    return { status: 400, headers: { Allow: 'POST, OPTIONS' } };
  }
  const origin = String(requestOrigin).trim();
  if (!allowedOrigins.includes('*') && !allowedOrigins.includes(origin.toLowerCase())) {
    // Withhold the grant headers. That is the refusal.
    return { status: 403, headers: { Allow: 'POST, OPTIONS' } };
  }

  return {
    status: 200,
    headers: {
      // MUST be the requested origin or a single '*'.
      'WebHook-Allowed-Origin': allowedOrigins.includes('*') ? '*' : origin,
      'WebHook-Allowed-Rate': rate,
      Allow: 'POST, OPTIONS',
    },
  };
}
