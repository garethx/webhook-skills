// Generated with: ashby-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an Ashby webhook signature.
 *
 * Ashby signs the RAW request body with HMAC-SHA256 keyed on your per-webhook
 * secret token, hex-encoded, sent in the Ashby-Signature header as "sha256=<hex>".
 */
function verifyAshbyWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  // Header format: "sha256=<hex>"
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha256' || !sig) {
    return false;
  }

  // Compute expected signature over the raw body
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; catch length mismatch on malformed input
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification (do not parse first)
  const body = await request.text();
  const signature = request.headers.get('ashby-signature');

  // Verify webhook signature before parsing
  if (!verifyAshbyWebhook(body, signature, process.env.ASHBY_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload after verification.
  // Every Ashby payload is { action: "<eventName>", data: {...} }.
  const payload = JSON.parse(body);
  const { action, data } = payload;

  console.log(`Received Ashby event: ${action}`);

  // Dispatch on the action (event name), NOT on a header.
  switch (action) {
    case 'ping':
      console.log('Ping received — endpoint is reachable');
      break;

    case 'applicationSubmit':
      console.log('Application submitted:', data?.application?.id);
      // TODO: Sync candidate, notify recruiters, etc.
      break;

    case 'applicationUpdate':
      console.log('Application updated:', data?.application?.id);
      // TODO: Keep external systems in sync.
      break;

    case 'candidateHire':
      console.log('Candidate hired:', data?.candidate?.id);
      // TODO: Trigger onboarding, HRIS provisioning, etc.
      // Note: candidateHire also fans out applicationUpdate + candidateStageChange.
      break;

    case 'candidateStageChange':
      console.log('Candidate stage changed:', data?.candidate?.id);
      // TODO: Pipeline analytics, Slack alerts, etc.
      break;

    case 'interviewScheduleCreate':
      console.log('Interview schedule created:', data?.interviewSchedule?.id);
      // TODO: Calendar sync, interviewer prep, etc.
      break;

    case 'offerCreate':
      console.log('Offer created:', data?.offer?.id);
      // TODO: Offer tracking, approvals, etc.
      break;

    default:
      console.log(`Unhandled event: ${action}`);
  }

  // Return 200 to acknowledge receipt. Any status >= 400 can auto-disable the webhook.
  return NextResponse.json({ received: true });
}
