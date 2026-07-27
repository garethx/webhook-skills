// Generated with: paymob-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

interface SourceData {
  pan?: string;
  sub_type?: string;
  type?: string;
}

interface PaymobTransaction {
  id: number;
  amount_cents: number;
  created_at: string;
  currency: string;
  error_occured: boolean;
  has_parent_transaction: boolean;
  integration_id: number;
  is_3d_secure: boolean;
  is_auth: boolean;
  is_capture: boolean;
  is_refunded: boolean;
  is_standalone_payment: boolean;
  is_voided: boolean;
  pending: boolean;
  success: boolean;
  owner: number;
  order: { id: number };
  source_data: SourceData;
}

/**
 * Build the ordered string Paymob signs, from a transaction object.
 * The 20 fields are concatenated in a fixed order with no separators.
 * Array.join renders booleans as "true"/"false" and numbers as their digits.
 */
export function buildSignedString(obj: PaymobTransaction): string {
  const s = obj.source_data || {};
  return [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    obj.order.id,
    obj.owner,
    obj.pending,
    s.pan,
    s.sub_type,
    s.type,
    obj.success,
  ].join('');
}

/**
 * Verify a Paymob Transaction Processed Callback (POST).
 * HMAC-SHA512 (hex) over the concatenated fields, compared against the
 * `hmac` query parameter (NOT a header, NOT the raw body).
 */
export function verifyPaymobHmac(
  obj: PaymobTransaction,
  hmacParam: string | null,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha512', secret)
    .update(buildSignedString(obj))
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(hmacParam || '')
    );
  } catch {
    return false;
  }
}

/**
 * Derive a transaction state from the boolean fields.
 * Paymob has no discrete event names — every callback `type` is "TRANSACTION".
 */
export function transactionState(obj: PaymobTransaction): string {
  if (obj.is_refunded) return 'refunded';
  if (obj.is_voided) return 'voided';
  if (obj.pending) return 'pending';
  if (obj.success && obj.is_auth && !obj.is_capture) return 'authorized';
  if (obj.is_capture) return 'captured';
  if (obj.success && !obj.error_occured) return 'succeeded';
  return 'failed';
}

export async function POST(request: NextRequest) {
  const hmacParam = new URL(request.url).searchParams.get('hmac');

  // Parse the JSON — verification needs the individual fields.
  let body: { type?: string; obj?: PaymobTransaction };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.type !== 'TRANSACTION' || !body.obj) {
    return NextResponse.json(
      { error: 'Unexpected callback payload' },
      { status: 400 }
    );
  }

  const obj = body.obj;

  if (!hmacParam || !verifyPaymobHmac(obj, hmacParam, process.env.PAYMOB_HMAC_SECRET!)) {
    console.error('Paymob HMAC verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const state = transactionState(obj);
  console.log(`Transaction ${obj.id} (order ${obj.order.id}): ${state}`);

  switch (state) {
    case 'succeeded':
      // TODO: mark order paid, fulfil, send receipt
      break;
    case 'failed':
      // TODO: notify customer, release reservation
      break;
    case 'pending':
      // TODO: await final callback (e.g. 3-D Secure)
      break;
    case 'authorized':
      // TODO: funds held; capture when ready
      break;
    case 'captured':
      // TODO: complete a prior authorization
      break;
    case 'refunded':
      // TODO: reverse fulfilment, credit customer
      break;
    case 'voided':
      // TODO: cancel an uncaptured authorization
      break;
    default:
      console.log(`Unhandled state for transaction ${obj.id}`);
  }

  // Acknowledge quickly so Paymob does not retry.
  return NextResponse.json({ received: true });
}
