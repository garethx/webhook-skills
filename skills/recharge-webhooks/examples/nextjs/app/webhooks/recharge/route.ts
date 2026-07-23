// Generated with: recharge-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Reject deliveries whose signed timestamp is more than 48 hours from now.
const TIMESTAMP_TOLERANCE_SECONDS = 172800;

/**
 * Verify a Recharge webhook using the recommended timestamp-bound scheme.
 *
 * The `X-Recharge-Webhook-Signature` header carries comma-separated key/value
 * pairs in the form `t=<epoch>,v1=<hex>`. The signing input is
 * `<timestamp>.<payload_json>` (timestamp, literal dot, exact raw body bytes),
 * signed with HMAC-SHA-256 keyed by the API Client Secret, hex-encoded.
 */
function verifyRechargeWebhookTimestamped(
  rawBody: string,
  signatureHeader: string | null,
  clientSecret: string
): boolean {
  if (!signatureHeader) return false;

  // Parse `t=<epoch>,v1=<hex>` (future schemes may add v2=..., so parse by key).
  const parts: Record<string, string> = {};
  for (const pair of signatureHeader.split(',')) {
    const [key, value] = pair.split('=');
    if (key && value) parts[key.trim()] = value.trim();
  }
  const timestamp = parseInt(parts.t, 10);
  const signature = parts.v1;
  if (!Number.isFinite(timestamp) || !signature) return false;

  // Reject the delivery if abs(now - t) > 48 hours (replay protection).
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  // HMAC-SHA-256 over "<timestamp>.<raw body>", keyed by the client secret.
  const digest = crypto
    .createHmac('sha256', clientSecret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false; // length mismatch = invalid
  }
}

/**
 * Verify a Recharge webhook using the legacy body-only scheme.
 *
 * GOTCHA: despite the `X-Recharge-Hmac-Sha256` header name, this is NOT HMAC.
 * It is a plain SHA-256 of (clientSecret + rawBody), with the secret prepended,
 * hex-encoded.
 */
function verifyRechargeWebhookLegacy(
  rawBody: string,
  signatureHeader: string | null,
  clientSecret: string
): boolean {
  if (!signatureHeader) return false;

  const digest = crypto
    .createHash('sha256')
    .update(clientSecret) // secret first
    .update(rawBody) // then the raw body
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signatureHeader)
    );
  } catch {
    return false; // length mismatch = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body as text - do NOT use request.json() before verifying.
  const body = await request.text();
  const timestampedSignature = request.headers.get('x-recharge-webhook-signature');
  const legacySignature = request.headers.get('x-recharge-hmac-sha256');
  const clientSecret = process.env.RECHARGE_API_CLIENT_SECRET!;

  // 1. Verify first. Prefer the recommended timestamp-bound scheme; fall back
  //    to the legacy body-only header only when the new header is absent.
  const verified = timestampedSignature
    ? verifyRechargeWebhookTimestamped(body, timestampedSignature, clientSecret)
    : verifyRechargeWebhookLegacy(body, legacySignature, clientSecret);

  if (!verified) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 2. Parse only after verification. Recharge wraps the resource by key,
  //    e.g. { "charge": {...} }, { "subscription": {...} }, { "order": {...} }.
  const payload = JSON.parse(body);

  // 3. Dispatch on the payload's top-level resource key. Recharge does NOT
  //    send a documented topic/action header - if you need to distinguish
  //    actions (created vs updated vs paid), register a distinct endpoint
  //    path per topic when creating the webhook subscription.
  //    (`included_objects` adds extra top-level keys, so match known
  //    resources rather than taking the only key.)
  const resource = ['charge', 'subscription', 'order', 'customer', 'address'].find(
    (key) => payload[key] !== undefined
  );

  console.log(`Received ${resource ?? 'unknown'} webhook`);

  // Return 200 fast; do slow work asynchronously.
  switch (resource) {
    case 'charge':
      console.log('Charge event:', payload.charge?.id);
      // TODO: grant access, record revenue, dunning, etc.
      break;

    case 'subscription':
      console.log('Subscription event:', payload.subscription?.id);
      // TODO: onboarding, provisioning, revoke access, etc.
      break;

    case 'order':
      console.log('Order event:', payload.order?.id);
      // TODO: sync to OMS/ERP, trigger fulfillment, etc.
      break;

    case 'customer':
      console.log('Customer event:', payload.customer?.id);
      // TODO: CRM sync, payment method updates, etc.
      break;

    case 'address':
      console.log('Address event:', payload.address?.id);
      // TODO: update shipping records, etc.
      break;

    default:
      console.log('Unhandled resource:', Object.keys(payload));
  }

  // Acknowledge receipt within 5 seconds
  return NextResponse.json({ received: true });
}
