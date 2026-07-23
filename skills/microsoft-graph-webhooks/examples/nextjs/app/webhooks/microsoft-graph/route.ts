// Generated with: microsoft-graph-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify the clientState echoed on a Microsoft Graph notification.
 *
 * Graph does NOT sign notifications with an HMAC. The opaque `clientState` you
 * set when creating the subscription is echoed on every notification. Compare it
 * (timing-safe, length-checked) to your stored secret.
 */
export function verifyClientState(
  received: string | undefined | null,
  expected: string | undefined
): boolean {
  if (!received || !expected) {
    return false;
  }
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // crypto.timingSafeEqual throws on length mismatch
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

interface GraphNotification {
  subscriptionId?: string;
  changeType?: string;
  resource?: string;
  clientState?: string;
  lifecycleEvent?: string;
  resourceData?: { id?: string; '@odata.type'?: string };
}

export async function POST(request: NextRequest) {
  // 1) Endpoint validation handshake.
  //    On subscription create/renewal Graph sends ?validationToken=... and
  //    expects the URL-decoded token echoed back as text/plain, 200, within 10s.
  //    searchParams values are already URL-decoded.
  const validationToken = request.nextUrl.searchParams.get('validationToken');
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  let payload: { value?: GraphNotification[] };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const notifications = Array.isArray(payload?.value) ? payload.value : [];
  const expected = process.env.MICROSOFT_GRAPH_CLIENT_STATE;

  // Validate clientState on every item before processing any of them.
  for (const notification of notifications) {
    if (!verifyClientState(notification.clientState, expected)) {
      console.error('clientState mismatch — rejecting notification batch');
      return NextResponse.json({ error: 'Invalid clientState' }, { status: 400 });
    }
  }

  for (const notification of notifications) {
    if (notification.lifecycleEvent) {
      handleLifecycleEvent(notification);
    } else {
      handleChangeNotification(notification);
    }
  }

  // Acknowledge within 3 seconds. Return 202 and do heavy work asynchronously.
  return new NextResponse(null, { status: 202 });
}

function handleChangeNotification(notification: GraphNotification) {
  const { changeType, resource, subscriptionId } = notification;
  const resourceId = notification.resourceData?.id;

  console.log(`Received ${changeType} for ${resource} (subscription: ${subscriptionId})`);

  switch (changeType) {
    case 'created':
      console.log(`Resource created: ${resourceId}`);
      // TODO: Fetch the full resource from Graph, or use rich notifications
      break;

    case 'updated':
      console.log(`Resource updated: ${resourceId}`);
      // TODO: Re-fetch and reconcile
      break;

    case 'deleted':
      console.log(`Resource deleted: ${resourceId}`);
      // TODO: Remove local copy
      break;

    default:
      console.log(`Unhandled changeType: ${changeType}`);
  }
}

function handleLifecycleEvent(notification: GraphNotification) {
  const { lifecycleEvent, subscriptionId } = notification;

  console.log(`Lifecycle event ${lifecycleEvent} for subscription ${subscriptionId}`);

  switch (lifecycleEvent) {
    case 'reauthorizationRequired':
      console.log('Reauthorize/renew the subscription (POST /reauthorize or PATCH expirationDateTime)');
      // TODO: Reauthorize and/or renew the subscription
      break;

    case 'subscriptionRemoved':
      console.log('Subscription removed — recreate it and resync via delta query');
      // TODO: Recreate subscription, then delta-sync missed changes
      break;

    case 'missed':
      console.log('Missed notifications — resync via delta query');
      // TODO: Delta-sync to recover missed changes
      break;

    default:
      console.log(`Unhandled lifecycleEvent: ${lifecycleEvent}`);
  }
}
