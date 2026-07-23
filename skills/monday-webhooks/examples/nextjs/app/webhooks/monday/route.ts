// Generated with: monday-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, type JWTPayload } from 'jose';

/**
 * Verify the JWT monday.com sends in the Authorization header.
 *
 * monday.com signs each request with a JWT (HS256) using your app's Signing
 * Secret (board webhooks) or Client Secret (app lifecycle webhooks). The JWT is
 * self-contained — it authenticates the sender but is NOT an HMAC over the body,
 * so parsing JSON before this call is safe. jwtVerify throws on a bad signature
 * or an expired token.
 *
 * Set MONDAY_WEBHOOK_URL to also enforce the `aud` (audience) claim in production.
 */
export async function verifyMondayJwt(
  authHeader: string | null,
  secret: string
): Promise<JWTPayload> {
  if (!authHeader) throw new Error('Missing Authorization header');
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader; // monday.com usually sends the raw token, no "Bearer " prefix

  const options: Parameters<typeof jwtVerify>[2] = { algorithms: ['HS256'] };
  if (process.env.MONDAY_WEBHOOK_URL) {
    options.audience = process.env.MONDAY_WEBHOOK_URL;
  }

  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(secret),
    options
  );
  return payload;
}

export async function POST(request: NextRequest) {
  // JSON body parsing is fine here — the JWT signature does not cover the body.
  const body = await request.json();

  // 1. Challenge handshake — sent when the webhook is first registered.
  //    Echo the token back BEFORE any JWT check: challenge requests may not
  //    carry an Authorization header.
  if (body && typeof body.challenge === 'string') {
    return NextResponse.json({ challenge: body.challenge });
  }

  // 2. Verify the JWT when a Signing Secret is configured (integration-app
  //    webhooks). No-code / personal-token webhooks may not send a JWT — see
  //    ../../references/verification.md for how to secure those.
  const secret = process.env.MONDAY_SIGNING_SECRET;
  if (secret) {
    try {
      await verifyMondayJwt(request.headers.get('authorization'), secret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('JWT verification failed:', message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  // 3. Handle the event. Real events wrap their data in an `event` object.
  const event = body.event ?? {};
  const eventType: string | undefined = event.type;

  switch (eventType) {
    case 'create_item':
      console.log('Item created:', event.pulseId, event.pulseName);
      // TODO: Sync the new item to external systems
      break;

    case 'change_column_value':
      console.log('Column changed:', event.pulseId, event.columnId, event.value);
      // TODO: Mirror the column value to an external record
      break;

    case 'change_status_column_value':
      console.log('Status changed:', event.pulseId, event.value?.label?.text);
      // TODO: Kick off a workflow when status reaches "Done", etc.
      break;

    case 'change_name':
      console.log('Item renamed:', event.pulseId, event.pulseName);
      // TODO: Keep external titles in sync
      break;

    case 'create_update':
      console.log('Update posted on item:', event.pulseId);
      // TODO: Notify Slack, log activity, etc.
      break;

    case 'create_subitem':
      console.log('Subitem created:', event.pulseId, 'parent:', event.parentItemId);
      // TODO: Track sub-task creation
      break;

    case 'item_archived':
      console.log('Item archived:', event.pulseId);
      // TODO: Soft-delete the downstream record
      break;

    case 'item_deleted':
      console.log('Item deleted:', event.pulseId);
      // TODO: Clean up external records
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // Return 200 quickly to acknowledge receipt. monday.com retries once a minute
  // for 30 minutes on non-2xx responses.
  return NextResponse.json({ received: true });
}
