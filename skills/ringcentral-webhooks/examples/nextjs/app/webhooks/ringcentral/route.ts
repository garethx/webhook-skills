// Generated with: ringcentral-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Optional shared secret. Set the same value as `verificationToken` when creating
// the subscription. If unset, the Verification-Token check is skipped.
const EXPECTED_TOKEN = process.env.RINGCENTRAL_VERIFICATION_TOKEN;

/**
 * Timing-safe comparison for the Verification-Token header.
 */
export function tokenMatches(received: string | null, expected: string | undefined): boolean {
  const a = Buffer.from(received || '', 'utf8');
  const b = Buffer.from(expected || '', 'utf8');
  // timingSafeEqual throws on length mismatch — guard first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Map a RingCentral event filter (the notification `event` field) to a category.
 * The filter is a resource path containing concrete IDs, so match by substring.
 */
export function eventCategory(eventFilter: string | undefined): string {
  if (!eventFilter) return 'unknown';
  if (eventFilter.includes('/message-store/instant')) return 'instant-message';
  if (eventFilter.includes('/message-store')) return 'message-store';
  if (eventFilter.includes('/presence')) return 'presence';
  if (eventFilter.includes('/telephony/sessions')) return 'telephony-session';
  if (eventFilter.includes('/extension')) return 'extension';
  return 'other';
}

export async function POST(request: NextRequest) {
  // 1. Validation-Token handshake (subscription create/renew).
  //    Echo the token back in the response header and return 200 fast.
  const validationToken = request.headers.get('validation-token');
  if (validationToken) {
    return NextResponse.json(
      { status: 'ok' },
      { status: 200, headers: { 'Validation-Token': validationToken } }
    );
  }

  // 2. Verification-Token check (optional per-notification authenticity).
  if (EXPECTED_TOKEN && !tokenMatches(request.headers.get('verification-token'), EXPECTED_TOKEN)) {
    console.error('Verification token mismatch');
    return NextResponse.json({ error: 'Invalid verification token' }, { status: 401 });
  }

  // 3. Parse and dispatch.
  const payload = await request.json().catch(() => ({}));
  const eventFilter: string | undefined = payload.event;
  const category = eventCategory(eventFilter);

  console.log(
    `Received notification for ${eventFilter} (subscription ${payload.subscriptionId})`
  );

  switch (category) {
    case 'instant-message':
      console.log('Inbound instant message (SMS):', payload.body);
      // TODO: Reply to SMS, route to an agent, etc.
      break;

    case 'message-store':
      console.log('Message store change:', payload.body?.changes);
      // TODO: Fetch the new message, log voicemail/fax, etc.
      break;

    case 'presence':
      console.log('Presence change for extension', payload.ownerId);
      // TODO: Update agent availability, dashboards, etc.
      break;

    case 'telephony-session':
      console.log('Telephony session event:', payload.body);
      // TODO: Screen-pop, call logging, analytics, etc.
      break;

    case 'extension':
      console.log('Extension change:', payload.body);
      // TODO: Sync provisioning, update directory, etc.
      break;

    default:
      console.log(`Unhandled event filter: ${eventFilter}`);
  }

  // 4. Acknowledge fast — respond within a few seconds or risk blacklisting.
  return NextResponse.json({ status: 'ok' });
}
