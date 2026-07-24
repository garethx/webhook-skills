// Generated with: treezor-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Re-serialize an object_payload into Treezor's canonical form, matching PHP's
 * default json_encode: compact separators, forward slashes escaped, and all
 * non-ASCII characters escaped to lowercase \uXXXX.
 */
export function canonicalize(objectPayload: unknown): string {
  return JSON.stringify(objectPayload)
    .replace(/\//g, '\\/')
    .replace(/[\u0080-\uffff]/g, (ch) =>
      '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
}

/**
 * Verify a Treezor webhook. The signature is a BODY FIELD
 * (object_payload_signature), not an HTTP header, and covers the canonicalized
 * object_payload — not the raw request body.
 */
export function verifyTreezorWebhook(
  objectPayload: unknown,
  receivedSignature: string | undefined,
  secret: string
): boolean {
  if (!receivedSignature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(canonicalize(objectPayload), 'utf8')
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedSignature),
      Buffer.from(expected)
    );
  } catch {
    return false; // different lengths = invalid
  }
}

export async function POST(request: NextRequest) {
  // Treezor sends webhooks as text/plain — read the raw body and parse it ourselves.
  const raw = await request.text();

  let event: {
    webhook?: string;
    webhook_id?: string;
    object_id?: string;
    object_payload?: unknown;
    object_payload_signature?: string;
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Verify the signature before trusting anything in the body.
  if (!verifyTreezorWebhook(
    event.object_payload,
    event.object_payload_signature,
    process.env.TREEZOR_WEBHOOK_SECRET as string
  )) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Deliveries can be duplicated and arrive out of order.
  // Dedupe on webhook_id and compare webhook_created_at in real handlers.
  const eventName = event.webhook;
  console.log(`Received ${eventName} (webhook_id=${event.webhook_id})`);

  switch (eventName) {
    case 'payin.create':
      console.log('Pay-in created:', event.object_id);
      // TODO: credit wallet, notify user
      break;

    case 'payin.update':
      console.log('Pay-in updated:', event.object_id);
      // TODO: track settlement/refund state
      break;

    case 'payout.create':
      console.log('Payout created:', event.object_id);
      // TODO: confirm withdrawal initiated
      break;

    case 'payout.update':
      console.log('Payout updated:', event.object_id);
      // TODO: track execution/rejection
      break;

    case 'transfer.create':
      console.log('Transfer created:', event.object_id);
      // TODO: update balances
      break;

    case 'transaction.create':
      console.log('Transaction created:', event.object_id);
      // TODO: reconciliation, statements
      break;

    case 'cardtransaction.create':
      console.log('Card transaction:', event.object_id);
      // TODO: real-time spend notification
      break;

    case 'card.create':
      console.log('Card issued:', event.object_id);
      // TODO: activate card in UI
      break;

    case 'card.update':
      console.log('Card updated:', event.object_id);
      // TODO: reflect lock/unlock, limit changes
      break;

    case 'wallet.create':
      console.log('Wallet created:', event.object_id);
      // TODO: provision account for user
      break;

    case 'user.create':
      console.log('User created:', event.object_id);
      // TODO: onboarding flow
      break;

    case 'user.update':
      console.log('User updated:', event.object_id);
      // TODO: sync profile changes
      break;

    case 'user.kycreview':
      console.log('KYC review:', event.object_id);
      // TODO: gate features on KYC level
      break;

    default:
      console.log(`Unhandled event: ${eventName}`);
  }

  // Acknowledge receipt. Return a 5xx instead to trigger Treezor's retries.
  return NextResponse.json({ received: true });
}
