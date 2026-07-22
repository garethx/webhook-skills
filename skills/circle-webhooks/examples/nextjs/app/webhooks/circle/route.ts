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
    notificationType?: string;
    payment?: { id?: string; status?: string };
    paymentIntent?: { id?: string; timeline?: Array<{ status?: string }> };
    transfer?: { id?: string; status?: string };
    payout?: { id?: string; status?: string };
  };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  switch (event.notificationType) {
    case 'paymentIntents': {
      const intent = event.paymentIntent ?? {};
      console.log('Payment intent update:', intent.id, intent.timeline?.[0]?.status);
      break;
    }
    case 'payments': {
      const payment = event.payment ?? {};
      console.log('Payment update:', payment.id, payment.status);
      break;
    }
    case 'transfers': {
      const transfer = event.transfer ?? {};
      console.log('Transfer update:', transfer.id, transfer.status);
      break;
    }
    case 'payouts': {
      const payout = event.payout ?? {};
      console.log('Payout update:', payout.id, payout.status);
      break;
    }
    default:
      console.log(`Unhandled notification type: ${event.notificationType}`);
  }

  return NextResponse.json({ received: true });
}
