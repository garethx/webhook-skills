// Generated with: lithic-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import Lithic from 'lithic';

// Lithic webhooks implement the Standard Webhooks spec (powered by Svix).
// `lithic.webhooks.unwrap(rawBody, headers, secret)` verifies the
// `webhook-signature` HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{rawBody}`,
// enforces a ~5-minute timestamp tolerance, and returns the parsed event.
// The API key is only used to call the Lithic API; a placeholder keeps the
// client constructable for a receive-only endpoint.
const lithic = new Lithic({
  apiKey: process.env.LITHIC_API_KEY || 'placeholder-not-used-for-webhooks',
  webhookSecret: process.env.LITHIC_WEBHOOK_SECRET,
});

interface LithicEvent {
  token?: string;
  event_type?: string;
  payload?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  // Read the RAW body — verification must run against the exact bytes signed.
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers);
  const secret = process.env.LITHIC_WEBHOOK_SECRET;

  let event: LithicEvent;
  try {
    event = lithic.webhooks.unwrap(rawBody, headers, secret) as LithicEvent;
  } catch (err) {
    console.error('Lithic webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Lithic event objects carry an `event_type` (resource.action) field.
  switch (event.event_type) {
    case 'card.created':
      console.log('Card created:', event.payload?.token ?? event.token);
      // TODO: Provision the new card in your system
      break;

    case 'card.updated':
      console.log('Card updated:', event.payload?.token ?? event.token);
      // TODO: Sync card state (e.g. PAUSED/CLOSED)
      break;

    case 'card_transaction.updated':
      console.log('Card transaction updated:', event.payload?.token);
      // TODO: Reconcile authorization / clearing state
      break;

    case 'payment_transaction.created':
      console.log('Payment transaction created:', event.payload?.token);
      // TODO: Record incoming ACH / wire payment
      break;

    case 'payment_transaction.updated':
      console.log('Payment transaction updated:', event.payload?.token);
      // TODO: Update payment status (settled, returned)
      break;

    case 'dispute.updated':
      console.log('Dispute updated:', event.payload?.token);
      // TODO: Progress the dispute workflow
      break;

    case 'balance.updated':
      console.log('Balance updated for account:', event.payload?.financial_account_token);
      // TODO: Refresh cached balances
      break;

    case 'three_ds_authentication.created':
      console.log('3DS authentication created:', event.payload?.token);
      // TODO: Handle challenge / decisioning
      break;

    default:
      console.log('Unhandled event type:', event.event_type);
  }

  // Acknowledge quickly so Lithic does not retry.
  return NextResponse.json({ received: true });
}
