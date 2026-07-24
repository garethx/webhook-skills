// Generated with: microsoft-sharepoint-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ChangeType values returned by the list GetChanges API. The notification itself
// carries no change details — these describe what you find once you call it.
export const CHANGE_TYPES: Record<string, string> = {
  Add: 'ItemAdded',
  Update: 'ItemUpdated',
  DeleteObject: 'ItemDeleted',
  Rename: 'ItemRenamed',
  Restore: 'ItemRestored',
  MoveAway: 'ItemMovedOut',
  MoveInto: 'ItemMovedInto',
};

interface SharePointNotification {
  subscriptionId: string;
  clientState?: string;
  expirationDateTime?: string;
  resource: string;
  tenantId?: string;
  siteUrl?: string;
  webId?: string;
}

// Timing-safe compare of the clientState shared secret.
function clientStateMatches(received: unknown, expected: string | undefined): boolean {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  // 1. Validation handshake — echo the validationtoken back as text/plain.
  //    Must happen before body parsing and within ~5 seconds.
  const validationToken = request.nextUrl.searchParams.get('validationtoken');
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // 2. Parse the thin, batched notification payload.
  const raw = await request.text();
  let notifications: SharePointNotification[];
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    notifications = Array.isArray(parsed.value) ? parsed.value : [];
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // 3. Validate the clientState shared secret on every notification.
  const expected = process.env.SHAREPOINT_CLIENT_STATE;
  const allValid = notifications.every((n) => clientStateMatches(n.clientState, expected));
  if (!allValid) {
    console.error('clientState validation failed');
    return NextResponse.json({ error: 'Invalid clientState' }, { status: 400 });
  }

  // 4. Acknowledge quickly, then process asynchronously. SharePoint retries 5x
  //    at 5-minute intervals on any non-2xx response or timeout.
  for (const n of notifications) {
    console.log(
      `Change in list ${n.resource} (subscription ${n.subscriptionId}, site ${n.siteUrl})`
    );
    // TODO: enqueue GetChanges for list `n.resource` using your stored change
    // token, then map each change via CHANGE_TYPES and persist the new token.
  }

  return NextResponse.json({ received: true });
}
