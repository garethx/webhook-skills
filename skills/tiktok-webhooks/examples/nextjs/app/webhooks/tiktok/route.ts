// Generated with: tiktok-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a TikTok for Developers webhook.
 *
 * TikTok has no webhook SDK. The `TikTok-Signature` header looks like:
 *
 *   t=1633174587,s=<hex>
 *
 * signature = HMAC-SHA256(client_secret, "<t>.<raw_body>"), hex-encoded.
 * Verify against the RAW body and reject stale timestamps (replay protection).
 */
export function verifyTikTokWebhook(
  rawBody: string,
  header: string | null,
  clientSecret: string,
  toleranceSec = 300
): boolean {
  // No secret configured means we cannot verify anything — fail closed.
  if (!header || !clientSecret) {
    return false;
  }

  // Header format: "t=<ts>,s=<hex>"
  const parts = Object.fromEntries(
    header.split(',').map((kv) => kv.split('='))
  ) as { t?: string; s?: string };
  const { t, s } = parts;
  if (!t || !s) {
    return false;
  }

  // Reject stale timestamps. TikTok documents no explicit tolerance window;
  // 5 minutes is a sane default. Pair with idempotency to dedupe retries.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > toleranceSec) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(`${t}.${rawBody}`, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(s, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // length mismatch = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body — required for signature verification.
  const rawBody = await request.text();
  const signature = request.headers.get('tiktok-signature');

  // Verify before parsing.
  if (!verifyTikTokWebhook(rawBody, signature, process.env.TIKTOK_CLIENT_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Safe to parse now that the signature checks out.
  const payload = JSON.parse(rawBody);
  const { event, user_openid: userOpenId, create_time: createTime } = payload;

  // `content` is a serialized JSON string — parse it separately.
  let content: Record<string, unknown> = {};
  try {
    content = payload.content ? JSON.parse(payload.content) : {};
  } catch {
    content = {};
  }

  console.log(`Received ${event} for ${userOpenId ?? '(no openid)'} at ${createTime}`);

  // Delivery is at-least-once — dedupe on a stable key before doing real work.
  switch (event) {
    case 'authorization.removed':
      // content.reason: 0 unknown, 1 user disconnect, 2 account deleted,
      // 3 age change, 4 account banned, 5 developer revoked.
      console.log(`Authorization removed (reason ${content.reason})`);
      // TODO: purge stored tokens for userOpenId, stop syncing.
      break;

    case 'video.upload.failed':
      console.log(`Video upload failed: ${content.share_id}`);
      // TODO: surface the failure / retry.
      break;

    case 'video.publish.completed':
      console.log(`Video published: ${content.share_id}`);
      // TODO: mark the post live, record the published video.
      break;

    case 'portability.download.ready':
      console.log(`Data export ready: request ${content.request_id}`);
      // TODO: fetch the export, notify the requesting user.
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Acknowledge quickly (within TikTok's window) so it does not retry.
  return NextResponse.json({ received: true });
}
