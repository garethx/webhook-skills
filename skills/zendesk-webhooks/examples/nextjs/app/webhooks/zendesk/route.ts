// Generated with: zendesk-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Zendesk webhook signature.
 *
 * Zendesk signs: base64(HMAC_SHA256(secret, timestamp + rawBody)) — the
 * timestamp is prepended directly to the raw body with no separator.
 */
function verifyZendeskWebhook(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(timestamp); // timestamp first...
  hmac.update(rawBody); //    ...then the raw body, no separator
  const expected = hmac.digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false; // different lengths = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body BEFORE parsing so the signature matches exactly
  const rawBody = await request.text();
  const signature = request.headers.get('x-zendesk-webhook-signature');
  const timestamp = request.headers.get('x-zendesk-webhook-signature-timestamp');

  // Both headers are required
  if (!signature || !timestamp) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Verify webhook signature before trusting anything in the payload
  if (!verifyZendeskWebhook(rawBody, signature, timestamp, process.env.ZENDESK_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload after verification. Empty body = no event to dispatch.
  const payload = rawBody.length ? JSON.parse(rawBody) : {};

  // Event subscriptions carry a CloudEvents-style `type` field.
  // Webhooks connected to a trigger/automation send custom JSON (no `type`).
  const eventType: string | undefined = payload.type;
  console.log(`Received Zendesk webhook: ${eventType || '(custom trigger payload)'}`);

  switch (eventType) {
    case 'zen:event-type:ticket.created':
      console.log('Ticket created:', payload.detail?.id);
      // TODO: Sync ticket to CRM, alert on-call, etc.
      break;

    case 'zen:event-type:ticket.status_changed':
      console.log('Ticket status changed:', payload.detail?.id);
      // TODO: Update dashboards, SLA tracking, etc.
      break;

    case 'zen:event-type:ticket.comment_added':
      console.log('Ticket comment added:', payload.detail?.id);
      // TODO: Mirror comment to chat, notify watchers, etc.
      break;

    case 'zen:event-type:ticket.priority_changed':
      console.log('Ticket priority changed:', payload.detail?.id);
      // TODO: Escalation routing, etc.
      break;

    case 'zen:event-type:ticket.agent_assignment_changed':
      console.log('Ticket assignee changed:', payload.detail?.id);
      // TODO: Notify the newly assigned agent, etc.
      break;

    case 'zen:event-type:user.created':
      console.log('User created:', payload.detail?.id);
      // TODO: Provision account, send welcome flow, etc.
      break;

    case 'zen:event-type:organization.created':
      console.log('Organization created:', payload.detail?.id);
      // TODO: Sync organization to billing/CRM, etc.
      break;

    default:
      // Either an event type you haven't subscribed to handle, or a custom
      // trigger/automation payload without a `type` field.
      console.log('Unhandled Zendesk webhook payload');
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
