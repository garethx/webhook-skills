// Generated with: fireflies-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Fireflies webhook signature.
 *
 * Fireflies signs the raw request body with HMAC-SHA256 keyed on your webhook
 * secret and sends the digest in the `x-hub-signature` header as a bare hex
 * string (no `sha256=` prefix). Compare against the header value directly.
 */
function verifyFirefliesWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) {
    return false;
  }

  // Compute expected signature over the raw body (hex-encoded, no prefix)
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    // Different lengths / non-hex header means invalid
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature');

  // Verify webhook signature
  if (!verifyFirefliesWebhook(body, signature, process.env.FIREFLIES_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload after verification
  const payload = JSON.parse(body);
  const { meetingId, eventType, clientReferenceId } = payload;

  console.log(`Received "${eventType}" event for meeting ${meetingId}`);

  // Handle the event based on its type (Fireflies puts the type in the body)
  switch (eventType) {
    case 'Transcription completed':
      console.log(`Transcript ready for meeting ${meetingId}` +
        (clientReferenceId ? ` (ref: ${clientReferenceId})` : ''));
      // TODO: Fetch the transcript from the Fireflies GraphQL API using
      // meetingId, then sync notes, post to Slack, update your CRM, etc.
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
