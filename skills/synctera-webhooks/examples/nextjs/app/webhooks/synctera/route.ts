// Generated with: synctera-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.SYNCTERA_WEBHOOK_SECRET || '';
const TOLERANCE_SECONDS = 5 * 60; // reject timestamps >5 minutes from now

/**
 * Verify a Synctera webhook.
 *
 * Synctera signs `${Request-Timestamp}.${rawBody}` with HMAC-SHA256 and
 * hex-encodes it. Headers: `Synctera-Signature` (hex, two "."-delimited
 * signatures during a rolling secret) and `Request-Timestamp` (POSIX seconds).
 * The secret comes from POST /v0/webhook_secrets — NOT your API key.
 */
function verifySyncteraSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestamp: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !timestamp || !/^\d+$/.test(timestamp)) return false;

  // Replay protection: Request-Timestamp within 5 minutes of now
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`) // "." is a literal separator
    .digest('hex');

  // During a rolling secret, the header holds two "."-delimited signatures
  return signatureHeader.split('.').some((candidate) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

export async function POST(request: NextRequest) {
  // Read the RAW body — do not parse before verifying
  const rawBody = await request.text();
  const signature = request.headers.get('synctera-signature');
  const timestamp = request.headers.get('request-timestamp');

  if (!signature || !timestamp) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  if (!verifySyncteraSignature(rawBody, signature, timestamp, WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const event = JSON.parse(rawBody);

  switch (event.type) {
    case 'ACCOUNT.UPDATED':
      console.log('Account updated:', event.account_id || event.id);
      // TODO: sync account status/balance
      break;

    case 'CARD.CREATED':
      console.log('Card created:', event.card_id || event.id);
      // TODO: provision card in your UI
      break;

    case 'CARD.UPDATED':
      console.log('Card updated:', event.card_id || event.id);
      // TODO: reflect activation/lock status
      break;

    case 'TRANSACTION.CREATED':
      console.log('Transaction created:', event.transaction_id || event.id);
      // TODO: show pending activity
      break;

    case 'TRANSACTION.UPDATED':
      console.log('Transaction updated:', event.transaction_id || event.id);
      // TODO: reconcile ledger / update balances
      break;

    case 'DISPUTE.CREATED':
      console.log('Dispute created:', event.dispute_id || event.id);
      // TODO: start dispute workflow
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Acknowledge within 5 seconds or Synctera retries
  return NextResponse.json({ received: true });
}
