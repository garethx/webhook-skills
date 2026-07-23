// Generated with: persona-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

type VerifyResult = { valid: true } | { valid: false; error: string };

/**
 * Verify the Persona-Signature header.
 *
 * Header format:  t=<unix_seconds>,v1=<hex_signature>
 * Signed content: `${t}.${raw_body}`
 * Algorithm:      HMAC-SHA256 with the per-webhook secret (wbhsec_...), hex.
 *
 * During secret rotation Persona sends TWO space-separated `t=...,v1=...`
 * pairs (old + new secret). Accept the request if ANY v1 matches the secret
 * you hold. Persona documents no timestamp tolerance — signature validity is
 * the check; add your own replay window only if you need one.
 */
export function verifyPersonaSignature(
  rawBody: string,
  header: string | null,
  secret: string
): VerifyResult {
  if (!header) {
    return { valid: false, error: 'Missing Persona-Signature header' };
  }

  const pairs = header.trim().split(/\s+/);
  let sawPair = false;

  for (const pair of pairs) {
    const parts = pair.split(',');
    const tPart = parts.find((p) => p.startsWith('t='));
    const vPart = parts.find((p) => p.startsWith('v1='));
    const t = tPart ? tPart.slice(2) : null;
    const v1 = vPart ? vPart.slice(3) : null;
    if (!t || !v1) continue;
    sawPair = true;

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${t}.${rawBody}`)
      .digest('hex');

    const a = Buffer.from(v1, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) continue;

    try {
      if (crypto.timingSafeEqual(a, b)) {
        return { valid: true };
      }
    } catch {
      // Length mismatch handled above; anything else means invalid.
    }
  }

  if (!sawPair) {
    return { valid: false, error: 'Malformed Persona-Signature header' };
  }
  return { valid: false, error: 'Invalid signature' };
}

interface PersonaEvent {
  data?: {
    type?: string;
    id?: string;
    attributes?: {
      name?: string;
      'created-at'?: string;
      payload?: {
        data?: { type?: string; id?: string };
      };
    };
  };
}

export async function POST(request: NextRequest) {
  // App Router does not pre-parse JSON; reading as text yields the raw body bytes
  // exactly as Persona sent them. Do not call request.json() before verifying.
  const rawBody = await request.text();
  const header = request.headers.get('persona-signature');

  const verification = verifyPersonaSignature(
    rawBody,
    header,
    process.env.PERSONA_WEBHOOK_SECRET!
  );

  if (!verification.valid) {
    console.error('Persona webhook verification failed:', verification.error);
    return NextResponse.json(
      { error: `Webhook Error: ${verification.error}` },
      { status: 400 }
    );
  }

  let event: PersonaEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Persona payloads are JSON:API envelopes:
  //   data.attributes.name          -> event type (e.g. "inquiry.completed")
  //   data.attributes.payload.data  -> the affected object (same schema as the API)
  //   data.attributes.created-at    -> use to order events; delivery is not ordered
  const attributes = event.data?.attributes ?? {};
  const eventName = attributes.name;
  const object = attributes.payload?.data;

  // Persona may deliver duplicates and out of order — use event.data.id as the
  // idempotency key and order by data.attributes.created-at in real handlers.
  switch (eventName) {
    case 'inquiry.created':
      console.log('Inquiry created:', object?.id);
      break;
    case 'inquiry.started':
      console.log('Inquiry started:', object?.id);
      break;
    case 'inquiry.completed':
      console.log('Inquiry completed:', object?.id);
      break;
    case 'inquiry.approved':
      console.log('Inquiry approved:', object?.id);
      break;
    case 'inquiry.declined':
      console.log('Inquiry declined:', object?.id);
      break;
    case 'inquiry.marked-for-review':
      console.log('Inquiry marked for review:', object?.id);
      break;
    case 'inquiry.failed':
      console.log('Inquiry failed:', object?.id);
      break;
    case 'inquiry.expired':
      console.log('Inquiry expired:', object?.id);
      break;
    case 'verification.passed':
      console.log('Verification passed:', object?.id);
      break;
    case 'verification.failed':
      console.log('Verification failed:', object?.id);
      break;
    case 'account.created':
      console.log('Account created:', object?.id);
      break;
    case 'account.archived':
      console.log('Account archived:', object?.id);
      break;
    case 'case.created':
      console.log('Case created:', object?.id);
      break;
    case 'case.resolved':
      console.log('Case resolved:', object?.id);
      break;
    case 'report/watchlist.ready':
      console.log('Watchlist report ready:', object?.id);
      break;
    default:
      console.log(`Unhandled event type: ${eventName}`);
  }

  // Persona treats 200/201/202/204 as success; anything else is retried.
  return NextResponse.json({ received: true });
}
