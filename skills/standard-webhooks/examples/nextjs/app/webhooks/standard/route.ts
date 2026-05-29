// Generated with: standard-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

type StandardWebhookEvent = {
  type: string;
  timestamp?: string;
  data?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return NextResponse.json(
      { error: 'Missing required webhook headers (webhook-id, webhook-timestamp, webhook-signature)' },
      { status: 400 }
    );
  }

  // CRITICAL: Read the body as text (not JSON) — signature is over the raw bytes
  const rawBody = await request.text();

  try {
    const wh = new Webhook(secret);
    const event = wh.verify(rawBody, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    }) as StandardWebhookEvent | undefined;
    if (!event) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    console.log(`Received Standard Webhook: ${event.type}`);

    switch (event.type) {
      case 'contact.created':
        console.log('Contact created:', { id: event.data?.id, email: event.data?.email });
        break;
      case 'contact.updated':
        console.log('Contact updated:', { id: event.data?.id });
        break;
      case 'contact.deleted':
        console.log('Contact deleted:', { id: event.data?.id });
        break;
      case 'message.sent':
        console.log('Message sent:', { id: event.data?.id });
        break;
      case 'message.failed':
        console.log('Message failed:', { id: event.data?.id, error: event.data?.error });
        break;
      default:
        console.log('Unhandled event type:', event.type);
    }

    return NextResponse.json({ success: true, type: event.type }, { status: 200 });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Webhook verification failed';
    console.error('Webhook verification failed:', raw);
    let message = 'Webhook verification failed';
    if (raw === 'Message timestamp too old') message = 'Timestamp too old';
    else if (raw === 'Message timestamp too new') message = 'Timestamp too new';
    else if (raw === 'No matching signature found') message = 'Invalid signature';
    else if (raw) message = raw;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
