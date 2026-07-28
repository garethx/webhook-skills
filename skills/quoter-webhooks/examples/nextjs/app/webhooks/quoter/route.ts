// Generated with: quoter-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const MAX_AGE_SECONDS = 300; // reject requests older than 5 minutes

/**
 * Verify a Quoter webhook.
 *
 * Quoter POSTs application/x-www-form-urlencoded with three fields:
 *   hash, timestamp, data
 * The `hash` is md5(HASH_KEY + timestamp + data), where `data` is the raw
 * JSON/XML string exactly as sent. NOTE: this is a weak MD5 scheme, NOT
 * HMAC-SHA256 and NOT Standard Webhooks. Always configure a hash key.
 */
export function verifyQuoter(
  hashKey: string | undefined,
  timestamp: string,
  data: string,
  receivedHash: string
): boolean {
  if (!hashKey || !timestamp || !data || !receivedHash) return false;

  // Reject stale requests (timestamp is GMT UNIX seconds)
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_AGE_SECONDS) return false;

  // Hash the `data` string exactly as received — never re-serialize it.
  const expected = crypto
    .createHash('md5')
    .update(hashKey + timestamp + data)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(receivedHash));
  } catch {
    return false; // buffer length mismatch = invalid
  }
}

export async function POST(request: NextRequest) {
  // Quoter sends form-urlencoded, so read the form fields (not JSON).
  const form = await request.formData();
  const hash = form.get('hash')?.toString();
  const timestamp = form.get('timestamp')?.toString();
  const data = form.get('data')?.toString();

  if (!hash || !timestamp || !data) {
    return NextResponse.json(
      { error: 'Missing hash, timestamp, or data' },
      { status: 400 }
    );
  }

  if (!verifyQuoter(process.env.QUOTER_HASH_KEY, timestamp, data, hash)) {
    console.error('Quoter webhook verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Verified — now it's safe to parse the payload string.
  let payload: { id?: string; [key: string]: unknown };
  try {
    payload = JSON.parse(data); // use an XML parser if you chose XML format
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in data field' }, { status: 400 });
  }

  // Quoter has no dotted event names and the request doesn't identify the
  // object type, so we read it from the ?object= query parameter (configure a
  // distinct target URL per object type, e.g. /webhooks/quoter?object=quote).
  // Each object type fires on both create and update; there's no documented
  // field to tell them apart, so process idempotently keyed on payload.id.
  const objectType = request.nextUrl.searchParams.get('object') ?? 'unknown';

  switch (objectType) {
    case 'quote':
      console.log('Quote received:', payload.id ?? '(no id)');
      // TODO: sync the quote (e.g. trigger fulfillment when accepted).
      break;
    case 'person':
      console.log('Person received:', payload.id ?? '(no id)');
      // TODO: sync the contact to your CRM.
      break;
    case 'payment':
      console.log('Payment received:', payload.id ?? '(no id)');
      // TODO: reconcile the payment.
      break;
    default:
      console.log('Quoter object received (unknown type):', payload.id ?? '(no id)');
  }

  // Acknowledge quickly with a 2xx.
  return NextResponse.json({ received: true });
}
