// Generated with: smartcar-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import smartcar from 'smartcar';

export async function POST(request: NextRequest) {
  // Application Management Token (AMT) — keys the HMAC for both the VERIFY
  // challenge and per-payload SC-Signature verification.
  const AMT = process.env.SMARTCAR_MANAGEMENT_TOKEN as string;

  // Read the raw body first, then parse. The Smartcar Node SDK re-serializes
  // the parsed body internally when verifying, so we pass the parsed object.
  const rawBody = await request.text();

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 1. VERIFY handshake — echo the challenge hashed with the AMT within 15s so
  //    the webhook activates. A correct hash proves you hold the AMT.
  if (event.eventType === 'VERIFY') {
    const hmac = smartcar.hashChallenge(AMT, event.data.challenge);
    return NextResponse.json({ challenge: hmac }, { status: 200 });
  }

  // 2. Verify the SC-Signature header (hex HMAC-SHA256 of the raw body).
  const signature = request.headers.get('sc-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing SC-Signature header' }, { status: 401 });
  }
  if (!smartcar.verifyPayload(AMT, signature, event)) {
    console.error('Smartcar signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 3. Handle the event. Dedupe on event.eventId (stable across retries).
  switch (event.eventType) {
    case 'VEHICLE_STATE': {
      const triggers = (event.data.triggers || []).map((t: any) => t.name).join(', ');
      console.log(`VEHICLE_STATE for ${event.vehicleId} — triggered by: ${triggers}`);
      // TODO: persist event.data.signals, update dashboards, fire alerts, etc.
      break;
    }

    case 'VEHICLE_ERROR': {
      for (const err of event.data.errors || []) {
        console.log(`VEHICLE_ERROR for ${event.vehicleId}: ${err.code} (${err.state})`);
      }
      // TODO: surface connection issues; clear them on a follow-up event with
      //       errors[].state === 'RESOLVED'.
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.eventType}`);
  }

  // Acknowledge quickly (respond within 15s). Do heavy work asynchronously.
  return NextResponse.json({ received: true }, { status: 200 });
}
