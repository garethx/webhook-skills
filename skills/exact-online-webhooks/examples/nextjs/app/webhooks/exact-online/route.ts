// Generated with: exact-online-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an Exact Online webhook.
 *
 * Exact does NOT use Standard Webhooks and sends no signature header. The
 * signature is the `HashCode` field inside the JSON body:
 *
 *   {"Content":{...},"HashCode":"<UPPERCASE HEX>"}
 *
 * HashCode = HMAC-SHA256(secret, <raw JSON of the Content node>), hex, uppercased.
 * We must hash the exact raw substring of Content, not a re-serialized object.
 */
export function verifyExactWebhook(rawBody: string, secret: string): boolean {
  const prefix = '{"Content":';
  const marker = ',"HashCode":';
  const start = rawBody.indexOf(prefix);
  const end = rawBody.lastIndexOf(marker); // HashCode is last, so use lastIndexOf
  if (start === -1 || end === -1 || end < start) {
    return false;
  }

  // Exact bytes Exact signed — do NOT re-serialize the parsed Content object.
  const contentJson = rawBody.slice(start + prefix.length, end);

  let hashCode: unknown;
  try {
    hashCode = JSON.parse(rawBody).HashCode;
  } catch {
    return false;
  }
  if (!hashCode) {
    return false;
  }
  // No secret configured means we cannot verify anything — fail closed rather
  // than throwing an opaque 500 from createHmac(…, undefined).
  if (!secret) {
    console.error('EXACT_WEBHOOK_SECRET is not set — rejecting delivery');
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(contentJson, 'utf8')
    .digest('hex')
    .toUpperCase();

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(String(hashCode).toUpperCase())
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body — required for signature verification.
  const rawBody = await request.text();

  // Exact validates the callback URL when the subscription is created by
  // sending an EMPTY POST (content-length: 0). There is no Content to hash,
  // so acknowledge it instead of failing verification — returning 401 here
  // can leave the subscription unvalidated.
  if (!rawBody) {
    console.log('Empty POST — Exact callback validation, acknowledging');
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  // Verify before parsing.
  if (!verifyExactWebhook(rawBody, process.env.EXACT_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Safe to parse now that the HashCode checks out.
  const { Content } = JSON.parse(rawBody);
  const { Topic, Action, Key, Division } = Content;

  console.log(`Received ${Topic} ${Action} for ${Key} (division ${Division})`);

  // The payload is thin — fetch the full record from the REST API using Key +
  // Division (skip on Delete). Return 200 quickly; do slow work asynchronously.
  switch (Topic) {
    case 'Accounts':
      // TODO: GET /api/v1/{Division}/crm/Accounts?$filter=ID eq guid'{Key}'
      break;

    case 'Items':
      // TODO: GET /api/v1/{Division}/logistics/Items?$filter=ID eq guid'{Key}'
      break;

    case 'StockPositions':
      // TODO: sync inventory / reorder alerts
      break;

    case 'FinancialTransactions':
      // TODO: reconciliation / reporting
      break;

    case 'GoodsDeliveries':
      // TODO: fulfilment / shipping
      break;

    case 'Contacts':
      // TODO: CRM sync
      break;

    default:
      console.log(`Unhandled topic: ${Topic}`);
  }

  // Acknowledge quickly so Exact does not retry.
  return NextResponse.json({ received: true });
}
