// Generated with: meraki-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Cisco Meraki webhook.
 *
 * Meraki does NOT sign webhooks with an HMAC header. It echoes the "Shared
 * secret" you configured on the HTTP server back inside the JSON body as
 * `sharedSecret`. Verification is a timing-safe string compare on that field.
 */
export function verifyMerakiWebhook(rawBody: string, secret: string): boolean {
  let payload: { sharedSecret?: unknown };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return false;
  }

  const received = Buffer.from(String(payload.sharedSecret ?? ''));
  const expected = Buffer.from(String(secret ?? ''));

  // timingSafeEqual throws if lengths differ — guard first.
  if (received.length !== expected.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body so we control JSON parsing/verification
  const body = await request.text();

  // Verify the shared secret (carried in the body, not a header)
  if (!verifyMerakiWebhook(body, process.env.MERAKI_WEBHOOK_SECRET!)) {
    console.error('Meraki webhook verification failed');
    return NextResponse.json({ error: 'Invalid shared secret' }, { status: 401 });
  }

  // Parse the payload after verification
  const payload = JSON.parse(body);
  const alertTypeId = payload.alertTypeId;

  console.log(
    `Received "${payload.alertType}" (${alertTypeId}) for network ${payload.networkName} (alertId: ${payload.alertId})`
  );

  // Dispatch on alertTypeId (stable id), not alertType (human label)
  switch (alertTypeId) {
    case 'motion_alert':
      console.log(`Motion detected on device ${payload.deviceSerial}`);
      // TODO: capture snapshot, notify security, etc.
      break;

    case 'settings_changed':
      console.log(`Settings changed in ${payload.networkName}`);
      // TODO: audit the change, alert compliance, etc.
      break;

    case 'sensor_alert':
      console.log(`Sensor alert on ${payload.deviceSerial}:`, payload.alertData);
      // TODO: create incident, page facilities, etc.
      break;

    case 'stopped_reporting':
      console.log(`Device(s) stopped reporting in ${payload.networkName}`);
      // TODO: open uptime incident, page on-call, etc.
      break;

    default:
      console.log(`Unhandled alert type: ${alertTypeId}`);
  }

  // Return 200 quickly to acknowledge receipt (avoid auto-disable)
  return NextResponse.json({ received: true });
}
