// Generated with: twitter-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Build an X/Twitter signature value.
 *
 * `sha256=` + base64(HMAC-SHA256(consumerSecret, message)). The same primitive
 * produces the CRC `response_token` (message = crc_token) and the expected
 * `x-twitter-webhooks-signature` for POST events (message = raw body).
 */
export function buildSignature(message: string, consumerSecret: string): string {
  return (
    'sha256=' +
    crypto.createHmac('sha256', consumerSecret).update(message).digest('base64')
  );
}

/**
 * Verify the x-twitter-webhooks-signature header against the raw body.
 */
export function verifyTwitterSignature(
  rawBody: string,
  signatureHeader: string | null,
  consumerSecret: string
): boolean {
  if (!signatureHeader || !consumerSecret) return false;
  const expected = buildSignature(rawBody, consumerSecret);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // different lengths = invalid
  }
}

// CRC (Challenge-Response Check): X sends GET ?crc_token=... at registration,
// roughly hourly, and on demand. Reply with the response_token or X marks the
// webhook invalid and stops delivering events.
export async function GET(request: NextRequest) {
  const crcToken = request.nextUrl.searchParams.get('crc_token');
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;

  if (!crcToken) {
    return NextResponse.json({ error: 'Missing crc_token' }, { status: 400 });
  }
  if (!consumerSecret) {
    return NextResponse.json(
      { error: 'Server misconfigured: TWITTER_CONSUMER_SECRET not set' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    response_token: buildSignature(crcToken, consumerSecret),
  });
}

export async function POST(request: NextRequest) {
  // Read the raw body — X signs the raw bytes, not parsed JSON
  const rawBody = await request.text();
  const signature = request.headers.get('x-twitter-webhooks-signature');

  if (!verifyTwitterSignature(rawBody, signature, process.env.TWITTER_CONSUMER_SECRET!)) {
    console.error('Twitter signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The same endpoint receives every event type — dispatch on the event key
  // present in the payload. `for_user_id` names the subscribed user.
  const forUser = payload.for_user_id;

  if (payload.tweet_create_events) {
    console.log(`tweet_create_events for ${forUser}: ${payload.tweet_create_events.length} tweet(s)`);
    // TODO: Process new Posts, mentions, replies, quotes
  } else if (payload.tweet_delete_events) {
    console.log(`tweet_delete_events for ${forUser}`);
    // TODO: Handle deletion compliance notices
  } else if (payload.favorite_events) {
    console.log(`favorite_events for ${forUser}: ${payload.favorite_events.length} like(s)`);
    // TODO: Handle likes
  } else if (payload.follow_events) {
    console.log(`follow_events for ${forUser}: ${payload.follow_events[0]?.type}`); // follow | unfollow
    // TODO: Handle follow / unfollow
  } else if (payload.block_events) {
    console.log(`block_events for ${forUser}: ${payload.block_events[0]?.type}`); // block | unblock
    // TODO: Handle block / unblock
  } else if (payload.mute_events) {
    console.log(`mute_events for ${forUser}: ${payload.mute_events[0]?.type}`); // mute | unmute
    // TODO: Handle mute / unmute
  } else if (payload.direct_message_events) {
    console.log(`direct_message_events for ${forUser}: ${payload.direct_message_events.length} message(s)`);
    // TODO: Handle direct messages
  } else if (payload.direct_message_indicate_typing_events) {
    console.log(`direct_message_indicate_typing_events for ${forUser}`);
  } else if (payload.direct_message_mark_read_events) {
    console.log(`direct_message_mark_read_events for ${forUser}`);
  } else if (payload.user_event) {
    console.log('user_event: authorization revoked');
    // TODO: Clean up the revoked user's subscription/state
  } else {
    console.log('Unhandled event payload keys:', Object.keys(payload).join(', '));
  }

  // Acknowledge within 10 seconds. Delivery is at-most-once (no documented
  // retries), so process idempotently.
  return NextResponse.json({ received: true });
}
