// Generated with: utila-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verify, constants } from 'node:crypto';

// Utila signs deliveries with an RSA-4096 PRIVATE key (SHA-512 + PSS padding)
// and sends the base64 signature in x-utila-signature. We verify with the
// matching PEM PUBLIC key from the Console (Vault Settings -> Webhooks).
// There is no shared secret and no timestamp header.
function loadPublicKey(): string {
  const pem = process.env.UTILA_WEBHOOK_PUBLIC_KEY;
  if (!pem) throw new Error('UTILA_WEBHOOK_PUBLIC_KEY is not set');
  // Support keys stored on a single line with escaped \n newlines.
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
}

export function verifyUtilaSignature(
  rawBody: Buffer,
  signatureB64: string | null
): boolean {
  if (!signatureB64) return false;
  try {
    return verify(
      'sha512',
      rawBody, // the exact request bytes, NOT parsed JSON
      {
        key: loadPublicKey(),
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: constants.RSA_PSS_SALTLEN_AUTO, // auto-detect PSS salt
      },
      Buffer.from(signatureB64, 'base64')
    );
  } catch {
    // Malformed key / signature / base64 => not authentic. Fail closed.
    return false;
  }
}

interface UtilaEvent {
  id?: string;
  vault?: string;
  type?: string;
  resourceType?: string;
  resource?: string;
  details?: unknown;
}

export async function POST(request: NextRequest) {
  // CRITICAL: read raw bytes — the signature is over the exact raw body.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const signature = request.headers.get('x-utila-signature');
  if (!verifyUtilaSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: UtilaEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Utila sends no timestamp, so dedupe on event.id — the same id can arrive
  // more than once because non-200 deliveries are retried for up to 24h.
  // TODO: check event.id against a store and skip if already processed.

  // Payloads are thin: id, vault, type, resourceType, resource, details.
  // Fetch the full object from the Utila API using event.resource when needed.
  switch (event.type) {
    case 'TRANSACTION_CREATED':
      console.log('Transaction created:', event.resource);
      break;
    case 'TRANSACTION_STATE_UPDATED':
      console.log('Transaction state updated:', event.resource, event.details);
      break;
    case 'WALLET_CREATED':
      console.log('Wallet created:', event.resource);
      break;
    case 'WALLET_ADDRESS_CREATED':
      console.log('Wallet address created:', event.resource);
      break;
    case 'TRANSACTION_AML_SCREENING_RESULT_READY':
      console.log('AML screening result ready:', event.resource, event.details);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Acknowledge with 200 so Utila stops retrying.
  return NextResponse.json({ received: true });
}
