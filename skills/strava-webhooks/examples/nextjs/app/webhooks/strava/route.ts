// Generated with: strava-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const VERIFY_TOKEN = process.env.STRAVA_VERIFY_TOKEN || '';
const SUBSCRIPTION_ID = process.env.STRAVA_SUBSCRIPTION_ID; // optional

/**
 * Timing-safe comparison of the verify token from the validation handshake.
 * crypto.timingSafeEqual throws on length mismatch, so guard on length first.
 */
function tokenMatches(received: string | null, expected: string): boolean {
  const a = Buffer.from(received || '');
  const b = Buffer.from(expected || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Subscription validation handshake.
// Strava sends: GET /webhooks/strava?hub.mode=subscribe
//   &hub.verify_token=<your token>&hub.challenge=<random>
// Respond 200 with {"hub.challenge": "<echoed value>"} within 2 seconds.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && tokenMatches(token, VERIFY_TOKEN)) {
    // The response key must be the literal string "hub.challenge" (with the dot).
    return NextResponse.json({ 'hub.challenge': challenge });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// Event delivery. Strava events are NOT signed — trust is established by the
// validation handshake and (optionally) by checking the subscription_id.
export async function POST(request: NextRequest) {
  const event = await request.json();

  // Optional: reject events that aren't from our subscription.
  if (SUBSCRIPTION_ID && String(event.subscription_id) !== String(SUBSCRIPTION_ID)) {
    return new NextResponse('Unknown subscription', { status: 403 });
  }

  // Dispatch by object_type + aspect_type (there is no single event-name field).
  const { object_type, aspect_type, object_id, owner_id, updates } = event;

  switch (`${object_type}:${aspect_type}`) {
    case 'activity:create':
      console.log(`Activity created: ${object_id} (athlete ${owner_id})`);
      // TODO: fetch the activity from the Strava REST API using object_id.
      break;

    case 'activity:update':
      console.log(`Activity updated: ${object_id}`, updates);
      // TODO: re-sync cached activity metadata (title/type/private).
      break;

    case 'activity:delete':
      console.log(`Activity deleted: ${object_id}`);
      // TODO: remove the activity from your store.
      break;

    case 'athlete:update':
      if (updates && updates.authorized === 'false') {
        console.log(`Athlete ${owner_id} deauthorized the app`);
        // TODO: revoke tokens and stop syncing this athlete.
      } else {
        console.log(`Athlete ${owner_id} updated`, updates);
      }
      break;

    default:
      console.log(`Unhandled event: ${object_type}:${aspect_type}`);
  }

  // Acknowledge receipt (Strava expects a 200 within 2 seconds).
  return NextResponse.json({ received: true });
}
