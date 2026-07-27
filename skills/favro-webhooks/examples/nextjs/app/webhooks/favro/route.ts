// Generated with: favro-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Favro webhook.
 *
 * Favro does NOT use Standard Webhooks. The signature is in the
 * `X-Favro-Webhook` header and is computed over `payloadId + webhookUrl` —
 * NOT the request body:
 *
 *   X-Favro-Webhook = base64( HMAC-SHA1( secret, payloadId + webhookUrl ) )
 *
 * - payloadId  : the top-level string in the JSON body.
 * - webhookUrl : the postToUrl you registered, verbatim (FAVRO_WEBHOOK_URL).
 */
export function verifyFavroWebhook(
  payloadId: string,
  webhookUrl: string,
  secret: string,
  signature: string
): boolean {
  if (!payloadId || !webhookUrl || !secret || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac('sha1', secret)
    .update(payloadId + webhookUrl, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Derive a `<type>.<action>` event key. Favro reuses the same `action` across
 * object types, so the type comes from which object the payload carries.
 */
export function eventKey(body: {
  action?: string;
  card?: unknown;
  comment?: unknown;
}): string {
  if (body.action === 'ping') {
    return 'ping';
  }
  const type = body.card ? 'card' : body.comment ? 'comment' : 'unknown';
  return `${type}.${body.action}`;
}

export async function POST(request: NextRequest) {
  // The signature is over payloadId + URL, not the body, so we read the body
  // only to extract payloadId and dispatch on the action.
  const rawBody = await request.text();
  const signature = request.headers.get('x-favro-webhook') ?? '';

  let body: { payloadId?: string; action?: string; card?: unknown; comment?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Verify before trusting anything in the payload.
  if (
    !verifyFavroWebhook(
      body.payloadId ?? '',
      process.env.FAVRO_WEBHOOK_URL ?? '',
      process.env.FAVRO_WEBHOOK_SECRET ?? '',
      signature
    )
  ) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = eventKey(body);

  // The setup ping validates the endpoint — just acknowledge it.
  if (event === 'ping') {
    console.log('Received Favro setup ping — endpoint validated');
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  console.log(`Received ${event} (payloadId ${body.payloadId})`);

  // Dispatch on the event. Return 200 quickly; do slow work asynchronously.
  switch (event) {
    case 'card.created':
      // TODO: sync new card
      break;
    case 'card.committed':
      // TODO: kick off work / notify assignees
      break;
    case 'card.moved':
      // TODO: stage automation / status sync
      break;
    case 'card.updated':
      // TODO: keep external record in sync (payload may be partial — fetch if needed)
      break;
    case 'card.deleted':
      // TODO: clean up mirror record
      break;
    case 'comment.created':
      // TODO: notifications / activity feed
      break;
    case 'comment.updated':
      // TODO: sync edited comment
      break;
    case 'comment.deleted':
      // TODO: clean up mirror record
      break;
    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Acknowledge quickly so Favro does not retry.
  return NextResponse.json({ received: true });
}
