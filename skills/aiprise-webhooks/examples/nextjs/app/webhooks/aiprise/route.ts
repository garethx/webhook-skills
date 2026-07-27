// Generated with: aiprise-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an AiPrise callback signature.
 *
 * AiPrise signs the raw request body with HMAC-SHA256 using your API private key
 * and sends the lowercase hex digest in the X-HMAC-SIGNATURE header. There is no
 * separate webhook secret — the signing key IS the API private key.
 */
function verifyAiPriseWebhook(
  rawBody: string,
  signatureHeader: string | null,
  apiKey: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  // Compute the expected signature over the raw body — lowercase hex.
  const expectedSignature = crypto
    .createHmac('sha256', apiKey)
    .update(rawBody)
    .digest('hex')
    .toLowerCase();

  // Timing-safe comparison; guard against length/format mismatch.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.toLowerCase(), 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification — do NOT parse it first.
  const body = await request.text();
  const signature = request.headers.get('x-hmac-signature');

  // Verify the signature before trusting the payload.
  if (!verifyAiPriseWebhook(body, signature, process.env.AIPRISE_API_KEY!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload only after verification.
  const payload = JSON.parse(body);
  const sessionId = payload.verification_session_id;
  const clientRef = payload.client_reference_id;
  const result = payload.aiprise_summary?.verification_result;

  console.log(
    `AiPrise callback for session ${sessionId}` +
      (clientRef ? ` (ref: ${clientRef})` : '') +
      ` → ${result}`
  );

  // The outcome IS the verification_result value.
  switch (result) {
    case 'APPROVED':
      console.log('Verification approved');
      // TODO: Provision access, mark the customer verified.
      break;

    case 'DECLINED':
      console.log('Verification declined');
      // TODO: Block onboarding, request resubmission, flag for review.
      break;

    case 'REVIEW':
      console.log('Verification needs manual review');
      // TODO: Route to a human analyst / compliance queue.
      break;

    case 'UNKNOWN':
      console.log('Verification result unknown');
      // TODO: Retry or investigate.
      break;

    default:
      console.log(`Unhandled verification_result: ${result}`);
  }

  // Return 200 to acknowledge receipt.
  return NextResponse.json({ received: true });
}
