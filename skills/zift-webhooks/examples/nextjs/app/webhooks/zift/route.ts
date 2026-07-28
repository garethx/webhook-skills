// Generated with: zift-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';

/**
 * Build the Zift acknowledgement body.
 *
 * Zift notifications have NO signature/HMAC header — there is nothing to
 * cryptographically verify. Instead, an endpoint acknowledges a delivery by
 * echoing the received `notificationId` back in the JSON response body. Zift
 * accepts the id as an int or a string; pass it straight through so the echoed
 * value matches what was received.
 *
 * Returning "OK", an empty body, or {"received": true} is NOT an
 * acknowledgement — Zift will retry at +5m, +15m, +60m, +24h, then mark the
 * notification "Failed".
 */
export function ackBody(payload: { notificationId: number | string }): {
  notificationId: number | string;
} {
  return { notificationId: payload.notificationId };
}

/**
 * Classify a notification by its eventCode prefix.
 *
 * eventCode is `category.entity-action`, e.g. "billing.subscription-created" or
 * "processing.chargeback". Dispatching on the prefix is robust even if a
 * specific suffix differs from the documented examples — confirm exact literals
 * with Zift support at onboarding.
 */
export function eventCategory(eventCode: unknown): 'billing' | 'processing' | 'unknown' {
  if (typeof eventCode !== 'string') return 'unknown';
  const category = eventCode.split('.')[0];
  return category === 'billing' || category === 'processing' ? category : 'unknown';
}

export async function POST(request: NextRequest) {
  // No body signature to protect, so ordinary JSON parsing is safe here.
  const payload = await request.json();

  // Without a notificationId we cannot acknowledge the delivery. Surface the
  // misdelivery with a 400 rather than silently returning 200.
  if (payload.notificationId === undefined || payload.notificationId === null) {
    console.error('Zift notification missing notificationId');
    return NextResponse.json({ error: 'Missing notificationId' }, { status: 400 });
  }

  const category = eventCategory(payload.eventCode);

  console.log(
    `Received Zift notification ${payload.notificationId} (${payload.eventCode})`
  );

  // Dispatch on the event category, then branch on the specific eventCode.
  // Make handling idempotent — a retry may redeliver a notification you already
  // processed (dedupe on notificationId before side effects).
  switch (category) {
    case 'billing':
      console.log('Billing event:', payload.eventCode, 'dataType:', payload.dataType);
      // TODO: update subscription / payment option / allocation records.
      break;

    case 'processing':
      console.log('Processing event:', payload.eventCode, 'dataType:', payload.dataType);
      // TODO: handle chargeback / return / reversal / NOC (ACH detail in data).
      break;

    default:
      console.log(`Unhandled eventCode: ${payload.eventCode}`);
  }

  // Acknowledge by echoing the notificationId. THIS is the ack.
  return NextResponse.json(ackBody(payload));
}
