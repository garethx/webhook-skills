// Generated with: typeform-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Typeform webhook signature.
 *
 * Typeform signs the raw request body with HMAC-SHA256 keyed on your webhook
 * secret, base64-encodes it, and sends it in the `Typeform-Signature` header
 * prefixed with `sha256=`.
 */
function verifyTypeformSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;
  const hash = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const expected = `sha256=${hash}`;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // length mismatch = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body (as text) for signature verification — do not parse first
  const body = await request.text();
  const signature = request.headers.get('typeform-signature');

  // Verify webhook signature against the raw body
  if (!verifyTypeformSignature(body, signature, process.env.TYPEFORM_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification succeeds
  const event = JSON.parse(body);
  const { event_id, event_type, form_response } = event;

  console.log(`Received ${event_type} (event_id: ${event_id})`);

  // Handle the event based on its type
  switch (event_type) {
    case 'form_response':
      console.log('Form submitted:', form_response.form_id, 'token:', form_response.token);
      // TODO: Process the submission — sync to CRM, notify, fulfill, etc.
      break;

    case 'form_response_partial':
      console.log('Partial submission:', form_response.form_id, 'token:', form_response.token);
      // TODO: Follow up on abandoned forms, track drop-off, etc.
      break;

    default:
      console.log(`Unhandled event type: ${event_type}`);
  }

  // Acknowledge receipt quickly; do heavy work asynchronously
  return NextResponse.json({ received: true });
}
