// Generated with: volume-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import type { KeyObject } from 'crypto';
import {
  getVolumePublicKey,
  verifyVolumeSignature,
  reconcile,
  payments,
  processed,
  type VolumeWebhookPayload,
} from '../../../lib/volume';

// RSA verification needs Node's crypto module.
export const runtime = 'nodejs';

function handlePayment(payload: VolumeWebhookPayload) {
  switch (payload.paymentStatus) {
    case 'COMPLETED':
      // Payment succeeded — fulfil the order and notify the customer.
      console.log(`Payment ${payload.paymentId} COMPLETED`);
      break;
    case 'SETTLED':
      // Virtual accounts only: funds settled. Internal/operational use —
      // notify customers on COMPLETED, not on SETTLED.
      console.log(`Payment ${payload.paymentId} SETTLED`);
      break;
    case 'FAILED':
      console.log(`Payment ${payload.paymentId} FAILED: ${payload.errorDescription}`);
      break;
    default:
      console.log(`Unhandled paymentStatus: ${payload.paymentStatus}`);
  }
}

// Volume delivers with PUT. POST is exported too (same handler).
export async function PUT(request: NextRequest) {
  let publicKey: KeyObject;
  try {
    publicKey = await getVolumePublicKey();
  } catch (err) {
    // Fail closed. A non-200 makes Volume retry later.
    console.error('Volume public key unavailable:', (err as Error).message);
    return NextResponse.json({ error: 'Signature key unavailable' }, { status: 503 });
  }

  // Raw bytes — never request.json() before verifying; re-serialising changes
  // the bytes and the RSA signature no longer matches.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyVolumeSignature(rawBody, request.headers.get('authorization'), publicKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: VolumeWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const dedupeKey = `${payload.paymentId}:${payload.paymentStatus}`;
  if (processed.has(dedupeKey)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const problems = reconcile(payload, payments.get(payload.paymentId));
  if (problems.length > 0) {
    // Authentic, but it does not match what we expect — do not fulfil.
    // Acknowledge so Volume stops retrying, and alert a human.
    console.warn(`Volume payment ${payload.paymentId} not processed: ${problems.join(', ')}`);
    return NextResponse.json({ received: true, processed: false });
  }

  processed.add(dedupeKey);
  handlePayment(payload);
  return NextResponse.json({ received: true, processed: true });
}

export const POST = PUT;
