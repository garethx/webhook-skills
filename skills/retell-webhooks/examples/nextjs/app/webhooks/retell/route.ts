import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Reject signatures whose timestamp is more than 5 minutes from now (replay guard)
const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Verify a Retell webhook signature.
 *
 * Retell signs with HMAC-SHA256 using your Retell API key as the secret. The
 * X-Retell-Signature header is formatted "v={unix_ms_timestamp},d={hex_digest}"
 * where the digest is HMAC-SHA256 over (raw body + timestamp). The Retell Node
 * SDK has no verify helper, so we verify manually with crypto.
 */
function verifyRetellSignature(
  rawBody: string,
  signatureHeader: string | null,
  apiKey: string
): boolean {
  const match = /^v=(\d+),d=(.*)$/.exec(signatureHeader || '');
  if (!match) return false;
  const [, timestamp, digest] = match;

  if (Math.abs(Date.now() - Number(timestamp)) > FIVE_MINUTES_MS) return false;

  const expected = crypto
    .createHmac('sha256', apiKey)
    .update(rawBody + timestamp)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(digest));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the RAW body — do not parse before verifying
  const rawBody = await request.text();
  const signature =
    request.headers.get('x-retell-signature') ||
    request.headers.get('X-Retell-Signature');
  const apiKey = process.env.RETELL_API_KEY || '';

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing X-Retell-Signature header' },
      { status: 400 }
    );
  }

  if (!verifyRetellSignature(rawBody, signature, apiKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: { event?: string; call?: { call_id?: string }; chat?: { chat_id?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event, call, chat } = payload;
  const id = call?.call_id || chat?.chat_id;
  console.log(`Received Retell webhook: ${event} (${id})`);

  // Dedupe on `event` + call_id/chat_id here — Retell retries up to 3 times.

  switch (event) {
    case 'call_started':
      console.log('Call started:', call?.call_id);
      break;
    case 'call_ended':
      console.log('Call ended:', call?.call_id);
      break;
    case 'call_analyzed':
      // Transcript, summary, and sentiment are available on this event
      console.log('Call analyzed:', call?.call_id);
      break;
    case 'transcript_updated':
      console.log('Transcript updated:', call?.call_id);
      break;
    case 'transfer_started':
    case 'transfer_bridged':
    case 'transfer_cancelled':
    case 'transfer_ended':
      console.log(`Transfer event ${event}:`, call?.call_id);
      break;
    case 'chat_started':
    case 'chat_ended':
    case 'chat_analyzed':
      console.log(`Chat event ${event}:`, chat?.chat_id);
      break;
    default:
      console.log('Unhandled event type:', event);
  }

  // Acknowledge quickly (within 10s) so Retell doesn't retry
  return new NextResponse('OK', { status: 200 });
}
