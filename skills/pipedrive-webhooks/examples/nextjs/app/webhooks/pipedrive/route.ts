// Generated with: pipedrive-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Timing-safe string comparison. crypto.timingSafeEqual throws when the two
 * buffers differ in length, so we length-check first (and return false).
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Pipedrive does NOT sign webhooks (no HMAC, no signature header). It sends the
 * credentials you configured (http_auth_user / http_auth_password) as HTTP Basic
 * Auth on every delivery. Verify them here.
 */
export function verifyBasicAuth(
  authHeader: string | null,
  user: string,
  pass: string
): boolean {
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':'); // password may itself contain ':'
  if (sep === -1) return false;
  return safeEqual(decoded.slice(0, sep), user) && safeEqual(decoded.slice(sep + 1), pass);
}

export async function POST(request: NextRequest) {
  // 1. Authenticate the delivery
  const authorized = verifyBasicAuth(
    request.headers.get('authorization'),
    process.env.PIPEDRIVE_WEBHOOK_USER ?? '',
    process.env.PIPEDRIVE_WEBHOOK_PASSWORD ?? ''
  );
  if (!authorized) {
    console.error('Pipedrive webhook authentication failed');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse and validate payload structure
  let body: { meta?: { action?: string; entity?: string; entity_id?: string; correlation_id?: string }; data?: { id?: number }; previous?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const meta = body.meta;
  if (!meta || !meta.action || !meta.entity) {
    return NextResponse.json({ error: 'Invalid payload structure' }, { status: 400 });
  }

  // 3. Build the v2 event type from meta.action + meta.entity
  const event = `${meta.action}.${meta.entity}`;
  console.log(`Received ${event} (correlation_id=${meta.correlation_id})`);

  // 4. Dispatch on the event type
  switch (event) {
    case 'create.deal':
      console.log('Deal created:', body.data?.id);
      // TODO: sync new deal, notify sales, etc.
      break;

    case 'change.deal':
      console.log('Deal changed:', body.data?.id, 'changed fields:', body.previous);
      // TODO: react to stage/value/owner changes
      break;

    case 'delete.deal':
      console.log('Deal deleted:', meta.entity_id);
      // TODO: remove records, audit trail
      break;

    case 'change.person':
      console.log('Person changed:', body.data?.id);
      // TODO: keep contact records in sync
      break;

    case 'create.activity':
      console.log('Activity created:', body.data?.id);
      // TODO: trigger reminders, calendar sync
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // 5. Acknowledge quickly with any 2XX (do heavy work asynchronously)
  return NextResponse.json({ received: true });
}
