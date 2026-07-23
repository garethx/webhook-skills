// Generated with: statsig-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Statsig Event Webhook request.
 *
 * Statsig signs `v0:{timestamp}:{raw_body}` with HMAC-SHA256 using the
 * integration's signing secret and sends the result as
 * `X-Statsig-Signature: v0=<hex>`. The `X-Statsig-Request-Timestamp` header is a
 * Unix timestamp in MILLISECONDS.
 */
export function verifyStatsigRequest(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  signingSecret: string
): boolean {
  if (!signatureHeader || !timestampHeader || !signingSecret) {
    return false;
  }

  // Statsig's timestamp is a Unix time in MILLISECONDS (13 digits)
  const timestamp = parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  // Replay protection: reject requests older than 5 minutes
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
    return false;
  }

  // Statsig signs the literal string: "v0:" + timestamp + ":" + raw body
  const basestring = `v0:${timestampHeader}:${rawBody}`;
  const expected =
    'v0=' +
    crypto
      .createHmac('sha256', signingSecret)
      .update(basestring, 'utf8')
      .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body — Statsig signs the raw bytes, not parsed JSON
  const rawBody = await request.text();
  const signature = request.headers.get('x-statsig-signature');
  const timestamp = request.headers.get('x-statsig-request-timestamp');

  if (!verifyStatsigRequest(rawBody, signature, timestamp, process.env.STATSIG_WEBHOOK_SECRET!)) {
    console.error('Statsig signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Statsig delivers batches. Config changes arrive as { data: [...] };
  // exposure events arrive as a top-level JSON array.
  const items = Array.isArray(payload) ? payload : (payload.data ?? []);

  for (const item of items) {
    const meta = item.metadata ?? {};

    if (meta.action) {
      // Config change — metadata: type / name / description / action
      console.log(`Config change: ${meta.type} "${meta.name}" was ${meta.action}`);
      // TODO: sync config state, audit log, notify a channel
    } else {
      // Exposure event
      console.log(`Exposure event: ${item.eventName} (user: ${item.user?.userID ?? 'unknown'})`);
      // TODO: analytics, monitoring
    }
  }

  // Acknowledge quickly; process heavy work asynchronously
  return NextResponse.json({ received: true });
}
