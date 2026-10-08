// Generated with: tikkie-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Tikkie API v2 (ABN AMRO) notifications carry NO SIGNATURE — the OpenAPI spec
// defines only a JSON body and a 2XX acknowledgement. Do not write an HMAC
// verifier. Instead: (1) check subscriptionId against the id returned when you
// subscribed, and (2) re-fetch the authoritative record from the Tikkie API
// before fulfilling anything (the notification carries tokens only).

export type NotificationType = 'PAYMENT' | 'REFUND' | 'BUNDLE';

export interface TikkieNotification {
  subscriptionId: string;
  notificationType: NotificationType | string;
  paymentRequestToken?: string;
  paymentToken?: string;
  refundToken?: string;
  bundleId?: string;
  [key: string]: unknown;
}

type ParseResult =
  | { ok: true; notification: TikkieNotification; known: boolean }
  | { ok: false; error: string };

const REQUIRED_FIELDS: Record<NotificationType, string[]> = {
  PAYMENT: ['paymentRequestToken', 'paymentToken'],
  REFUND: ['paymentRequestToken', 'paymentToken', 'refundToken'],
  BUNDLE: ['bundleId'],
};

const DEFAULT_API_BASE_URL = 'https://api-sandbox.abnamro.com/v2/tikkie';

/** Payment-request and transactions subscriptions each have their own id. */
function getAllowedSubscriptionIds(): string[] {
  return (process.env.TIKKIE_SUBSCRIPTION_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Weak check (not cryptographic): subscriptionId must match a configured id.
 * Returns true when nothing is configured (check skipped with a warning).
 */
export function checkSubscriptionId(
  subscriptionId: string,
  allowed: string[] = getAllowedSubscriptionIds()
): boolean {
  if (allowed.length === 0) {
    console.warn('TIKKIE_SUBSCRIPTION_ID is not set — subscriptionId check skipped');
    return true;
  }
  return allowed.some((id) => safeEqual(subscriptionId, id));
}

/** Validate shape; `notificationType` is the discriminator (no event header). */
export function parseNotification(body: unknown): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Body must be a JSON object' };
  }
  const n = body as Record<string, unknown>;
  if (typeof n.subscriptionId !== 'string' || !n.subscriptionId) {
    return { ok: false, error: 'Missing subscriptionId' };
  }
  if (typeof n.notificationType !== 'string' || !n.notificationType) {
    return { ok: false, error: 'Missing notificationType' };
  }
  const required = REQUIRED_FIELDS[n.notificationType as NotificationType];
  if (!required) {
    return { ok: true, notification: n as TikkieNotification, known: false };
  }
  for (const field of required) {
    if (typeof n[field] !== 'string' || !n[field]) {
      return { ok: false, error: `Missing ${field} for ${n.notificationType}` };
    }
  }
  return { ok: true, notification: n as TikkieNotification, known: true };
}

/** Tikkie API path holding the authoritative record for a notification. */
export function recordPath(n: TikkieNotification): string {
  const e = (v?: string) => encodeURIComponent(v ?? '');
  switch (n.notificationType) {
    case 'PAYMENT':
      return `/paymentrequests/${e(n.paymentRequestToken)}/payments/${e(n.paymentToken)}`;
    case 'REFUND':
      return `/paymentrequests/${e(n.paymentRequestToken)}/payments/${e(n.paymentToken)}/refunds/${e(n.refundToken)}`;
    case 'BUNDLE':
      return `/transactionbundles/${e(n.bundleId)}`;
    default:
      throw new Error(`No record path for ${n.notificationType}`);
  }
}

/**
 * Re-fetch the record. `undefined` = credentials not configured (skipped),
 * `null` = Tikkie returned 404 (unknown tokens, likely forged). Throws on
 * other failures.
 */
export async function fetchRecord(
  n: TikkieNotification
): Promise<Record<string, unknown> | null | undefined> {
  const apiKey = process.env.TIKKIE_API_KEY;
  const appToken = process.env.TIKKIE_APP_TOKEN;
  if (!apiKey || !appToken) return undefined;

  const baseUrl = (process.env.TIKKIE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
  const res = await fetch(`${baseUrl}${recordPath(n)}`, {
    headers: { 'API-Key': apiKey, 'X-App-Token': appToken, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Tikkie API returned ${res.status}`);
  return res.json();
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = parseNotification(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const notification = parsed.notification;

  if (!checkSubscriptionId(notification.subscriptionId)) {
    console.warn(`Rejected notification with unknown subscriptionId ${notification.subscriptionId}`);
    return NextResponse.json({ error: 'Unknown subscriptionId' }, { status: 403 });
  }

  if (!parsed.known) {
    console.log(`Ignoring unknown notificationType: ${notification.notificationType}`);
    return NextResponse.json({ received: true });
  }

  let record: Record<string, unknown> | null | undefined;
  try {
    record = await fetchRecord(notification);
  } catch (err) {
    console.error('Failed to fetch record from Tikkie API:', (err as Error).message);
    return NextResponse.json({ error: 'Could not confirm notification' }, { status: 502 });
  }
  if (record === null) {
    return NextResponse.json({ error: 'Notification could not be confirmed' }, { status: 403 });
  }
  if (record === undefined) {
    console.warn('TIKKIE_API_KEY / TIKKIE_APP_TOKEN not set — skipping re-fetch (do not fulfil in production)');
  }

  // Tikkie retries (up to three attempts) — dedupe on paymentToken (PAYMENT),
  // refundToken (REFUND) or bundleId (BUNDLE).
  switch (notification.notificationType) {
    case 'PAYMENT':
      console.log(`Payment ${notification.paymentToken} on request ${notification.paymentRequestToken}`, record ?? '');
      // TODO: mark the order paid using record.amountInCents
      break;
    case 'REFUND':
      console.log(`Refund ${notification.refundToken} for payment ${notification.paymentToken}`, record ?? '');
      // TODO: record the refund (record.status is PENDING | PAID)
      break;
    case 'BUNDLE':
      console.log(`Transaction bundle ${notification.bundleId} available`, record ?? '');
      // TODO: download / reconcile the bundled payout
      break;
  }

  return NextResponse.json({ received: true });
}
