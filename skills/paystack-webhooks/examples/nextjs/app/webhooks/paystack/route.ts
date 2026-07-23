// Generated with: paystack-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Paystack webhook signature.
 *
 * Paystack signs the RAW request body with HMAC-SHA512 (hex) using your secret
 * key and sends it in the `x-paystack-signature` header. The official SDKs have
 * no verification helper, so we recompute the HMAC and compare it in constant
 * time.
 */
export function verifyPaystackWebhook(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }
  const expected = crypto
    .createHmac('sha512', secret)
    .update(rawBody) // raw string, NOT parsed JSON
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Different lengths throw — treat as invalid.
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the RAW body for signature verification (do not parse first)
  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature');

  // Verify the signature BEFORE parsing the body
  if (!verifyPaystackWebhook(rawBody, signature, process.env.PAYSTACK_SECRET_KEY!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification succeeds
  const payload = JSON.parse(rawBody);
  const { event, data } = payload;

  console.log(`Received ${event} event`);

  // The event type is in the body's `event` field, not a header.
  switch (event) {
    case 'charge.success':
      console.log(`Charge succeeded: ${data.reference} (${data.amount} ${data.currency})`);
      // TODO: Re-verify via GET /transaction/verify/:reference, then fulfil.
      break;

    case 'transfer.success':
      console.log(`Transfer succeeded: ${data.reference} (${data.transfer_code})`);
      // TODO: Mark the payout complete, notify the recipient.
      break;

    case 'transfer.failed':
      console.log(`Transfer failed: ${data.reference} (${data.transfer_code})`);
      // TODO: Alert ops, retry the payout, re-credit the balance.
      break;

    case 'transfer.reversed':
      console.log(`Transfer reversed: ${data.reference} (${data.transfer_code})`);
      // TODO: Reconcile the ledger.
      break;

    case 'refund.processed':
      console.log(`Refund processed for transaction: ${data.transaction_reference}`);
      // TODO: Update your ledger, notify the customer.
      break;

    case 'subscription.create':
      console.log(`Subscription created: ${data.subscription_code}`);
      // TODO: Provision the plan, start the billing cycle.
      break;

    case 'subscription.disable':
      console.log(`Subscription disabled: ${data.subscription_code}`);
      // TODO: Revoke access, offboard the customer.
      break;

    case 'invoice.create':
      console.log(`Invoice created: ${data.invoice_code}`);
      // TODO: Notify the customer of the upcoming charge.
      break;

    case 'invoice.update':
      console.log(`Invoice updated: ${data.invoice_code} (paid: ${data.paid})`);
      // TODO: Reconcile the charge result.
      break;

    case 'invoice.payment_failed':
      console.log(`Invoice payment failed: ${data.invoice_code}`);
      // TODO: Start dunning, retry, notify the customer.
      break;

    case 'charge.dispute.create':
      console.log(`Dispute opened: ${data.id}`);
      // TODO: Gather evidence and respond to the dispute.
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 200 to acknowledge receipt (Paystack retries non-200 responses)
  return NextResponse.json({ received: true });
}
