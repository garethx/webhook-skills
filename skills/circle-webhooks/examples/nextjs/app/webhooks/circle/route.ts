// Generated with: circle-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { createPublicKey, createVerify, KeyObject } from 'node:crypto';

// Circle production: https://api.circle.com — sandbox: https://api-sandbox.circle.com
const CIRCLE_API_BASE_URL =
  process.env.CIRCLE_API_BASE_URL || 'https://api.circle.com';

// Public key cache — keyed by the X-Circle-Key-Id UUID. The public key for a
// given keyId is static, so a cache miss == fetch once. Exported so tests can
// preload it and avoid a real API call.
export const publicKeyCache = new Map<string, KeyObject>();

async function getPublicKey(keyId: string): Promise<KeyObject> {
  const cached = publicKeyCache.get(keyId);
  if (cached) return cached;

  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) throw new Error('CIRCLE_API_KEY is not set');

  const res = await fetch(
    `${CIRCLE_API_BASE_URL}/v2/cpn/notifications/publicKey/${keyId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch public key: ${res.status}`);
  const { data } = await res.json();

  // Circle returns a base64-encoded DER (SPKI) ECDSA public key.
  const publicKey = createPublicKey({
    key: Buffer.from(data.publicKey, 'base64'),
    format: 'der',
    type: 'spki',
  });
  publicKeyCache.set(keyId, publicKey);
  return publicKey;
}

export async function verifyCircleWebhook(
  headers: Headers,
  rawBody: Buffer
): Promise<boolean> {
  const signature = headers.get('x-circle-signature');
  const keyId = headers.get('x-circle-key-id');
  if (!signature || !keyId) return false;

  let publicKey: KeyObject;
  try {
    publicKey = await getPublicKey(keyId);
  } catch {
    return false;
  }

  // ECDSA_SHA_256 over the RAW request body; the signature is base64-encoded.
  const verifier = createVerify('SHA256');
  verifier.update(rawBody);
  verifier.end();
  try {
    return verifier.verify(publicKey, signature, 'base64');
  } catch {
    return false;
  }
}

// Circle validates the endpoint with a HEAD request when a subscription is
// created or updated. Respond 200 so the subscription activates.
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: NextRequest) {
  // CRITICAL: read raw bytes — the signature is over the exact raw body.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const valid = await verifyCircleWebhook(request.headers, rawBody);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: {
    notificationId?: string;
    notificationType?: string;
    notification?: { id?: string; status?: string };
  };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Dedupe on event.notificationId (a UUID) — Circle retries non-200
  // deliveries, so the same notificationId can arrive more than once.
  const resource = event.notification ?? {};

  switch (event.notificationType) {
    case 'cpn.payment.completed': {
      console.log('Payment completed:', resource.id, resource.status);
      break;
    }
    case 'cpn.payment.failed': {
      console.log('Payment failed:', resource.id, resource.status);
      break;
    }
    case 'cpn.transaction.completed': {
      console.log('Transaction completed:', resource.id, resource.status);
      break;
    }
    case 'cpn.transaction.broadcasted': {
      console.log('Transaction broadcasted:', resource.id, resource.status);
      break;
    }
    case 'cpn.rfi.approved': {
      console.log('RFI approved:', resource.id, resource.status);
      break;
    }
    case 'cpn.rfi.rejected': {
      console.log('RFI rejected:', resource.id, resource.status);
      break;
    }
    default:
      // Other cpn.* types: cpn.payment.delayed, cpn.transaction.failed,
      // cpn.rfi.* (e.g. information-needed), etc.
      console.log(`Unhandled notification type: ${event.notificationType}`);
  }

  return NextResponse.json({ received: true });
}
