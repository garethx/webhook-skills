// Generated with: tokenio-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Token.io webhook.
 *
 * Token.io signs the RAW request body with Ed25519 (asymmetric — NOT HMAC and
 * NOT Standard Webhooks). Two headers arrive with every delivery:
 *
 *   token-signature: Ed25519 signature of the raw body, base64url encoded
 *   token-event:     the event type (e.g. PAYMENT_STATUS_CHANGED)
 *
 * Verify with your member's Ed25519 PUBLIC key (base64url, no padding) from the
 * Token Dashboard → Settings → Member Information. The public key is the `x`
 * value of an OKP/Ed25519 JWK.
 */
export function verifyTokenWebhook(
  rawBody: string,
  signatureHeader: string | null,
  publicKeyB64url: string | undefined
): boolean {
  if (!signatureHeader || !publicKeyB64url) {
    return false;
  }
  try {
    const key = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: publicKeyB64url },
      format: 'jwk',
    });
    // Ed25519 → algorithm arg is null. base64url-decode the signature.
    return crypto.verify(
      null,
      Buffer.from(rawBody, 'utf8'),
      key,
      Buffer.from(signatureHeader, 'base64url')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body — required for signature verification.
  const rawBody = await request.text();
  const signature = request.headers.get('token-signature');
  const event = request.headers.get('token-event');

  // Verify before parsing. Fail closed on a missing/invalid signature.
  if (!verifyTokenWebhook(rawBody, signature, process.env.TOKEN_WEBHOOK_PUBLIC_KEY)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Safe to parse now that the signature checks out.
  let payload: { payment?: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event type is in the `token-event` header, not the body.
  console.log(`Received Token.io event: ${event}`);

  switch (event) {
    case 'PAYMENT_STATUS_CHANGED': {
      const payment = (payload.payment ?? {}) as Record<string, unknown>;
      // Drive logic off the normalized `status`; keep `bankPaymentStatus`
      // (raw ISO 20022) for audit/debugging.
      console.log(
        `Payment ${payment.id} → ${payment.status} (bank: ${payment.bankPaymentStatus})`
      );
      switch (payment.status) {
        case 'INITIATION_PROCESSING':
          // TODO: mark payment as processing
          break;
        case 'INITIATION_COMPLETED':
          // TODO: mark payment accepted by the bank
          break;
        case 'INITIATION_REJECTED':
          // TODO: mark payment rejected, notify the customer
          break;
        case 'SUCCESS':
          // TODO: funds confirmed — fulfil the order
          break;
        default:
          console.log(`Unhandled payment status: ${payment.status}`);
      }
      break;
    }

    case 'TRANSFER_STATUS_CHANGED':
      // TODO: Payments v1 transfer status change
      break;

    case 'REFUND_STATUS_CHANGED':
      // TODO: reconcile refund status
      break;

    case 'VRP_STATUS_CHANGED':
      // TODO: Variable Recurring Payment status change
      break;

    case 'VRP_CONSENT_STATUS_CHANGED':
      // TODO: VRP consent / mandate lifecycle
      break;

    case 'VIRTUAL_ACCOUNT_CREDIT_RECEIVED':
      // TODO: reconcile inbound funds on a virtual account
      break;

    case 'PAYOUT_STATUS_CHANGED':
      // TODO: settlement / payout tracking
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Acknowledge quickly so Token.io does not retry.
  return NextResponse.json({ received: true });
}
