// Generated with: pylon-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Pylon webhook signature.
 *
 * Pylon signs `timestamp + "." + rawBody` with HMAC-SHA256 and sends the result
 * in the Pylon-Webhook-Signature header, prefixed with "hs256=".
 */
function verifyPylonWebhook(
  rawBody: string,
  timestamp: string | null,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !timestamp) {
    return false;
  }

  // Signed content is `timestamp + "." + rawBody`, hex digest, "hs256=" prefix.
  const expected =
    'hs256=' +
    crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');

  // Timing-safe comparison; timingSafeEqual throws on length mismatch.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not parse first)
  const body = await request.text();
  const signature = request.headers.get('pylon-webhook-signature');
  const timestamp = request.headers.get('pylon-webhook-timestamp');
  const version = request.headers.get('pylon-webhook-version');

  // Verify webhook signature against the raw body
  if (!verifyPylonWebhook(body, timestamp, signature, process.env.PYLON_WEBHOOK_SECRET!)) {
    console.error('Pylon webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification succeeds
  const payload = JSON.parse(body);

  // NOTE: Pylon's event-type field and token format are not publicly
  // documented. Confirm these against your own destination configuration.
  const eventType = payload.event_type || payload.type;
  const data = payload.data || payload;

  console.log(`Received Pylon event: ${eventType} (version: ${version})`);

  // Handle the event based on type (event names are illustrative)
  switch (eventType) {
    case 'issue.created':
      console.log('Issue created:', data.id, data.title);
      // TODO: Mirror the issue, alert on-call, create a linked task, etc.
      break;

    case 'issue.updated':
      console.log('Issue updated:', data.id, data.state);
      // TODO: Sync fields, trigger SLA automations, etc.
      break;

    // Example shape only — a close event is NOT confirmed to exist under this
    // (or any) name. Replace with the real types from your destination.
    case 'issue.closed':
      console.log('Issue closed:', data.id);
      // TODO: Send CSAT survey, update reporting, close linked tasks, etc.
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // Return 2xx quickly to acknowledge receipt (Pylon documents no timeout)
  return NextResponse.json({ received: true });
}
