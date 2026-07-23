// Generated with: twitch-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Twitch EventSub message types (Twitch-Eventsub-Message-Type header)
const MESSAGE_TYPE_VERIFICATION = 'webhook_callback_verification';
const MESSAGE_TYPE_NOTIFICATION = 'notification';
const MESSAGE_TYPE_REVOCATION = 'revocation';

// Reject messages whose timestamp is older than this (replay protection)
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Verify a Twitch EventSub webhook signature.
 *
 * Twitch signs an HMAC-SHA256 over the concatenation of the message id, the
 * message timestamp, and the RAW request body (in that order), and sends it in
 * the Twitch-Eventsub-Message-Signature header as "sha256=<hex>".
 */
function verifyTwitchSignature(
  messageId: string | null,
  timestamp: string | null,
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!messageId || !timestamp || !signatureHeader) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(messageId);
  hmac.update(timestamp);
  hmac.update(rawBody);
  const expected = 'sha256=' + hmac.digest('hex');

  // Timing-safe comparison; throws on length mismatch, so guard it.
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
  // Read the RAW body for signature verification — do not parse first
  const rawBody = await request.text();
  const messageId = request.headers.get('twitch-eventsub-message-id');
  const timestamp = request.headers.get('twitch-eventsub-message-timestamp');
  const signature = request.headers.get('twitch-eventsub-message-signature');
  const messageType = request.headers.get('twitch-eventsub-message-type');

  // 1. Verify the signature (applies to ALL message types)
  if (!verifyTwitchSignature(messageId, timestamp, rawBody, signature, process.env.TWITCH_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return new NextResponse('Invalid signature', { status: 403 });
  }

  // 2. Reject stale messages (replay protection)
  if (Math.abs(Date.now() - new Date(timestamp!).getTime()) > MAX_AGE_MS) {
    console.error('Webhook timestamp too old');
    return new NextResponse('Stale message', { status: 403 });
  }

  // Parse the payload only AFTER the signature is verified
  const payload = JSON.parse(rawBody);

  // 3. Respond to the one-time verification challenge
  if (messageType === MESSAGE_TYPE_VERIFICATION) {
    console.log('Responding to webhook_callback_verification challenge');
    // Must return the raw challenge string as text/plain (not JSON-wrapped)
    return new NextResponse(payload.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // 4. Handle subscription revocation
  if (messageType === MESSAGE_TYPE_REVOCATION) {
    console.warn(
      `Subscription ${payload.subscription.type} revoked:`,
      payload.subscription.status
    );
    return new NextResponse(null, { status: 204 });
  }

  // 5. Handle notifications
  if (messageType === MESSAGE_TYPE_NOTIFICATION) {
    handleEvent(payload.subscription.type, payload.event);
    return new NextResponse(null, { status: 204 });
  }

  console.log(`Unknown message type: ${messageType}`);
  return new NextResponse(null, { status: 204 });
}

/**
 * Dispatch a Twitch EventSub notification by subscription type.
 */
function handleEvent(subscriptionType: string, event: any) {
  console.log(`Received ${subscriptionType} notification`);

  switch (subscriptionType) {
    case 'stream.online':
      console.log(`${event.broadcaster_user_name} went live (${event.type})`);
      // TODO: post "now live" alert, start recording, etc.
      break;

    case 'stream.offline':
      console.log(`${event.broadcaster_user_name} went offline`);
      // TODO: post end-of-stream summary, stop recording, etc.
      break;

    case 'channel.follow':
      console.log(`${event.user_name} followed ${event.broadcaster_user_name}`);
      // TODO: follower alert, welcome message, etc.
      break;

    case 'channel.update':
      console.log(`${event.broadcaster_user_name} updated: ${event.title} (${event.category_name})`);
      // TODO: refresh embeds, log category change, etc.
      break;

    case 'channel.subscribe':
      console.log(`${event.user_name} subscribed (tier ${event.tier})`);
      // TODO: sub alert, loyalty rewards, etc.
      break;

    case 'channel.subscription.gift':
      console.log(`${event.user_name} gifted ${event.total} sub(s)`);
      // TODO: gift-sub alert, leaderboard, etc.
      break;

    case 'channel.cheer':
      console.log(`${event.user_name} cheered ${event.bits} bits`);
      // TODO: bits alert, goal tracking, etc.
      break;

    case 'channel.raid':
      console.log(`${event.from_broadcaster_user_name} raided with ${event.viewers} viewers`);
      // TODO: raid alert, shoutout, etc.
      break;

    case 'channel.ban':
      console.log(`${event.user_name} was banned by ${event.moderator_user_name}`);
      // TODO: moderation log, etc.
      break;

    case 'channel.channel_points_custom_reward_redemption.add':
      console.log(`${event.user_name} redeemed "${event.reward.title}"`);
      // TODO: fulfill reward, queue actions, etc.
      break;

    default:
      console.log(`Unhandled subscription type: ${subscriptionType}`);
  }
}
