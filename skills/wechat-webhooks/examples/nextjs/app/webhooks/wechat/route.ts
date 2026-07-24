// Generated with: wechat-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// 32-character APIv3 key used to decrypt resource.ciphertext.
const API_V3_KEY = process.env.WECHAT_PAY_API_V3_KEY!;

const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

/**
 * Build the serial -> platform public key (PEM) map used to verify signatures.
 * WECHAT_PAY_PLATFORM_KEYS is a JSON object of {"<serial>": "<PEM>"} entries —
 * refresh it from GET /v3/certificates (e.g. every 12h) so new serials are
 * present before WeChat Pay starts signing with them.
 * The single-key WECHAT_PAY_PUBLIC_KEY + WECHAT_PAY_PLATFORM_SERIAL pair is
 * folded in as a one-entry map for backwards compatibility.
 */
function loadPlatformKeys(): Record<string, string> {
  const keys: Record<string, string> = {};
  if (process.env.WECHAT_PAY_PLATFORM_KEYS) {
    Object.assign(keys, JSON.parse(process.env.WECHAT_PAY_PLATFORM_KEYS));
  }
  if (process.env.WECHAT_PAY_PUBLIC_KEY && process.env.WECHAT_PAY_PLATFORM_SERIAL) {
    keys[process.env.WECHAT_PAY_PLATFORM_SERIAL] = process.env.WECHAT_PAY_PUBLIC_KEY;
  }
  return keys;
}

const PLATFORM_KEYS = loadPlatformKeys();
// Legacy fallback: a key configured without a serial is used for every serial.
// Not rotation-safe — prefer WECHAT_PAY_PLATFORM_KEYS in production.
const FALLBACK_PUBLIC_KEY = process.env.WECHAT_PAY_PLATFORM_SERIAL
  ? undefined
  : process.env.WECHAT_PAY_PUBLIC_KEY;

interface EncryptedResource {
  algorithm: string;
  ciphertext: string;
  nonce: string;
  associated_data?: string;
}

/**
 * Verify the WeChat Pay APIv3 signature.
 * Signed message is "{timestamp}\n{nonce}\n{body}\n" (SHA256withRSA),
 * verified against the platform public key matched by Wechatpay-Serial.
 */
export function verifySignature(
  timestamp: string,
  nonce: string,
  rawBody: string,
  signatureB64: string,
  publicKey: string
): boolean {
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const verifier = crypto.createVerify('RSA-SHA256').update(message, 'utf8');
  try {
    return verifier.verify(publicKey, signatureB64, 'base64');
  } catch {
    return false; // malformed key or signature
  }
}

/**
 * Decrypt resource.ciphertext (AEAD_AES_256_GCM) with the 32-byte APIv3 key.
 * The 16-byte auth tag is appended to the ciphertext.
 */
export function decryptResource(resource: EncryptedResource, apiV3Key: string): any {
  const buf = Buffer.from(resource.ciphertext, 'base64');
  const authTag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', apiV3Key, resource.nonce);
  decipher.setAuthTag(authTag);
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data));
  }
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

export async function POST(request: NextRequest) {
  const timestamp = request.headers.get('wechatpay-timestamp');
  const nonce = request.headers.get('wechatpay-nonce');
  const signature = request.headers.get('wechatpay-signature');
  const serial = request.headers.get('wechatpay-serial');

  if (!timestamp || !nonce || !signature || !serial) {
    return NextResponse.json(
      { code: 'FAIL', message: 'Missing WeChat Pay signature headers' },
      { status: 400 }
    );
  }

  // Reject stale notifications (replay protection).
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > TIMESTAMP_TOLERANCE_SECONDS) {
    return NextResponse.json({ code: 'FAIL', message: 'Timestamp outside tolerance' }, { status: 400 });
  }

  // Select the platform public key by serial. WeChat Pay publishes new platform
  // certificates ~24h before it starts signing with them, so a rotation you have
  // not picked up yet arrives as an unknown serial — fail loudly here instead of
  // as a stream of indistinguishable "invalid signature" rejections.
  const publicKey = PLATFORM_KEYS[serial] || FALLBACK_PUBLIC_KEY;
  if (!publicKey) {
    const message =
      `No platform key configured for serial ${serial} — ` +
      'fetch the current certs via GET /v3/certificates and add it';
    console.error(message);
    return NextResponse.json({ code: 'FAIL', message }, { status: 400 });
  }

  // Read the RAW body for signature verification (never parse before verifying).
  const rawBody = await request.text();
  if (!verifySignature(timestamp, nonce, rawBody, signature, publicKey)) {
    return NextResponse.json({ code: 'FAIL', message: 'Invalid signature' }, { status: 401 });
  }

  let notification: any;
  let resource: any;
  try {
    notification = JSON.parse(rawBody);
    resource = decryptResource(notification.resource, API_V3_KEY);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to decrypt resource:', message);
    return NextResponse.json({ code: 'FAIL', message: 'Failed to decrypt resource' }, { status: 400 });
  }

  // Handle the event. Re-verify amounts against your order before fulfilling,
  // and process idempotently keyed on notification.id / resource.transaction_id.
  switch (notification.event_type) {
    case 'TRANSACTION.SUCCESS':
      console.log('Payment succeeded:', resource.out_trade_no, resource.amount);
      // TODO: mark order paid, fulfill, send receipt
      break;

    case 'REFUND.SUCCESS':
      console.log('Refund succeeded:', resource.out_refund_no);
      // TODO: update refund status, notify customer
      break;

    case 'REFUND.CLOSED':
      console.log('Refund closed:', resource.out_refund_no);
      // TODO: flag for manual review / reconciliation
      break;

    default:
      console.log(`Unhandled event type: ${notification.event_type}`);
  }

  // Acknowledge. HTTP 200 tells WeChat Pay to stop retrying.
  return NextResponse.json({ code: 'SUCCESS', message: 'OK' });
}
