// Generated with: telnyx-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import nacl from 'tweetnacl';

export const dynamic = 'force-dynamic';

// Reject webhooks whose timestamp is more than this many seconds old (replay defense).
// Matches Telnyx's official SDK default of 5 minutes.
const TOLERANCE_SECONDS = 300;

type TelnyxWebhookEvent = {
  data?: {
    record_type?: string;
    event_type?: string;
    id?: string;
    occurred_at?: string;
    payload?: Record<string, unknown>;
  };
  meta?: Record<string, unknown>;
};

/**
 * Verify a Telnyx webhook using Ed25519.
 *
 * Telnyx signs `${telnyx-timestamp}|${raw_body}` with an Ed25519 private key.
 * Verify with your account's base64 public key from Mission Control →
 * Account Settings → Keys & Credentials → Public Key.
 */
function verifyTelnyxSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  publicKey: string
): boolean {
  const now = Math.floor(Date.now() / 1000);
  const webhookTime = parseInt(timestamp, 10);
  if (!Number.isFinite(webhookTime) || Math.abs(now - webhookTime) > TOLERANCE_SECONDS) {
    return false;
  }

  // Signed content is `timestamp|body` — use the RAW body, never re-serialized JSON.
  const signedPayload = Buffer.from(`${timestamp}|${rawBody}`, 'utf8');

  try {
    return nacl.sign.detached.verify(
      new Uint8Array(signedPayload),
      new Uint8Array(Buffer.from(signature, 'base64')),
      new Uint8Array(Buffer.from(publicKey, 'base64'))
    );
  } catch {
    return false; // malformed base64 / wrong lengths = invalid
  }
}

export async function POST(request: Request) {
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKey) {
    console.error('TELNYX_PUBLIC_KEY is not configured');
    return new NextResponse('Server configuration error', { status: 500 });
  }

  const signature = request.headers.get('telnyx-signature-ed25519');
  const timestamp = request.headers.get('telnyx-timestamp');
  if (!signature || !timestamp) {
    return new NextResponse('Missing Telnyx signature headers', { status: 400 });
  }

  // Read the RAW body BEFORE parsing — Ed25519 verification operates on raw bytes.
  const rawBody = await request.text();

  if (!verifyTelnyxSignature(rawBody, signature, timestamp, publicKey)) {
    return new NextResponse('Invalid signature', { status: 400 });
  }

  let event: TelnyxWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON payload', { status: 400 });
  }

  // Telnyx wraps every webhook in a `data` envelope.
  const data = event.data ?? {};
  const eventType = data.event_type;
  const payload = (data.payload ?? {}) as Record<string, unknown>;
  console.log(`Received Telnyx event: ${eventType} (${data.id})`);

  switch (eventType) {
    case 'message.received':
      console.log('Inbound message:', {
        id: payload.id,
        from: (payload.from as { phone_number?: string } | undefined)?.phone_number,
        text: payload.text,
      });
      // TODO: process the inbound SMS/MMS.
      break;
    case 'message.sent':
      console.log('Message sent to carrier:', { id: payload.id });
      // TODO: record that the message left Telnyx.
      break;
    case 'message.finalized':
      console.log('Message finalized:', {
        id: payload.id,
        to: payload.to,
      });
      // TODO: update delivery status (delivered / failed).
      break;
    default:
      console.log('Unhandled event type:', eventType);
  }

  // Acknowledge fast: Telnyx expects a 2xx within 2000ms or it retries.
  return NextResponse.json({ received: true });
}
