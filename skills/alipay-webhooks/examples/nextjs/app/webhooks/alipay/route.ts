// Generated with: alipay-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { ACK_BODY, verifyAlipaySignature, signAlipayResponse } from '@/lib/verify';

// Ensure the Node.js runtime (needs the `crypto` module for RSA).
export const runtime = 'nodejs';

const CLIENT_ID = process.env.ALIPAY_CLIENT_ID || '';
const ALIPAY_PUBLIC_KEY = process.env.ALIPAY_PUBLIC_KEY || ''; // verifies inbound
const MERCHANT_PRIVATE_KEY = process.env.ALIPAY_MERCHANT_PRIVATE_KEY || ''; // signs the ack
const KEY_VERSION = process.env.ALIPAY_KEY_VERSION || 1;

const WEBHOOK_PATH = '/webhooks/alipay';

// Build the signed SUCCESS ack. Antom verifies this response, so it must be
// signed with the merchant private key over the same two-line content.
function signedAck(method: string) {
  const responseTime = new Date().toISOString();
  const signature = signAlipayResponse({
    method,
    uri: WEBHOOK_PATH,
    clientId: CLIENT_ID,
    responseTime,
    body: ACK_BODY,
    privateKey: MERCHANT_PRIVATE_KEY,
    keyVersion: KEY_VERSION,
  });

  return new NextResponse(ACK_BODY, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Client-Id': CLIENT_ID,
      'Response-Time': responseTime,
      Signature: signature,
    },
  });
}

export async function POST(req: NextRequest) {
  // Read the RAW body — the signature covers the exact bytes. Do not use req.json().
  const rawBody = await req.text();

  const clientId = req.headers.get('client-id');
  const requestTime = req.headers.get('request-time');
  const signatureHeader = req.headers.get('signature');

  if (!signatureHeader || !clientId || !requestTime) {
    return new NextResponse('Missing Alipay signature headers', { status: 400 });
  }

  const valid = verifyAlipaySignature({
    method: 'POST',
    uri: WEBHOOK_PATH,
    clientId,
    requestTime,
    rawBody,
    signatureHeader,
    publicKey: ALIPAY_PUBLIC_KEY,
  });

  if (!valid) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // Branch on `notifyType` (no `type` field); `result.resultStatus` is S/F/U.
  const status = event?.result?.resultStatus;

  switch (event.notifyType) {
    case 'PAYMENT_RESULT':
      console.log('Payment result:', event.paymentRequestId, event.paymentId, status);
      // TODO: if (status === 'S') fulfill the order
      break;
    case 'CAPTURE_RESULT':
      console.log('Capture result:', event.captureRequestId, event.captureId, status);
      break;
    case 'REFUND_RESULT':
      console.log('Refund result:', event.refundRequestId, event.refundId, status);
      break;
    case 'AUTHORIZATION_RESULT':
      console.log('Authorization result:', event.authorizationRequestId, status);
      break;
    case 'DISPUTE_CREATED':
    case 'DISPUTE_JUDGED':
      console.log('Dispute:', event.notifyType, event.disputeId, status);
      break;
    default:
      console.log('Unhandled notifyType:', event.notifyType);
  }

  // Signed 200 so Antom stops retrying.
  return signedAck('POST');
}
