// Generated with: ethoca-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Timing-safe string comparison that tolerates length mismatch
 * (crypto.timingSafeEqual throws when buffer lengths differ).
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify Ethoca webhook HTTP Basic Auth.
 *
 * Ethoca Alerts Push API deliveries have NO HMAC/signature header. Trust comes
 * from mutual TLS (MSSL, Entrust CA) at the transport layer. Basic Auth is an
 * OPTIONAL second factor that applies only if you agreed credentials with the
 * Ethoca Customer Delivery Team during onboarding — it is not guaranteed by the
 * API. Run this check only when credentials are configured (see POST).
 */
export function verifyEthocaAuth(
  authHeader: string | null,
  username: string,
  password: string
): boolean {
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const i = decoded.indexOf(':'); // split on the FIRST colon; passwords may contain ':'
  if (i === -1) return false;
  return (
    safeEqual(decoded.slice(0, i), username) &&
    safeEqual(decoded.slice(i + 1), password)
  );
}

// Normalize alertType to one of the two Ethoca categories. NOTE: the numeric
// mapping (1 -> fraud, 2 -> dispute) is an UNCONFIRMED guess — the literal
// alertType enum is not published publicly and has historically been numeric.
// Confirm the actual values against your Ethoca onboarding schema.
export function alertCategory(alertType: unknown): 'fraud' | 'dispute' | 'unknown' {
  const map: Record<string, 'fraud' | 'dispute'> = {
    fraud: 'fraud',
    dispute: 'dispute',
    '1': 'fraud',
    '2': 'dispute',
  };
  return map[String(alertType)] ?? 'unknown';
}

export async function POST(request: NextRequest) {
  // Basic Auth is enforced only when credentials are configured. Whether Ethoca
  // sends Basic Auth is agreed at onboarding with the Ethoca Customer Delivery
  // Team, not guaranteed by the API. With no credentials configured, rely on
  // mTLS (the actual trust mechanism) and accept the delivery.
  const username = process.env.ETHOCA_WEBHOOK_USERNAME;
  const password = process.env.ETHOCA_WEBHOOK_PASSWORD;

  if (username && password) {
    if (!verifyEthocaAuth(request.headers.get('authorization'), username, password)) {
      console.error('Ethoca webhook authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // No body signature to protect, so ordinary JSON parsing is safe here.
  const alert = await request.json();
  const category = alertCategory(alert.alertType);

  console.log(`Received Ethoca ${alert.alertType} alert (${category}):`, alert.id);

  // Handle the alert based on its category
  switch (category) {
    case 'fraud':
      console.log('Fraud alert:', alert.id, alert.transaction?.arn);
      // TODO: Stop fulfilment, refund, cancel subscription, block the account.
      break;

    case 'dispute':
      console.log('Dispute alert:', alert.id, alert.transaction?.arn);
      // TODO: Refund to prevent a chargeback, gather evidence, update the order.
      break;

    default:
      console.log(`Unhandled alertType: ${alert.alertType}`);
  }

  // TODO: Report the outcome back to Ethoca via the OAuth 1.0a Outcome API.

  // Acknowledge receipt.
  return NextResponse.json({ received: true });
}
