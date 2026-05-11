// Generated with: discord-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { verifyKey } from 'discord-interactions';

export const dynamic = 'force-dynamic';

type DiscordEvent = {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
};

type DiscordWebhookPayload = {
  version: number;
  application_id: string;
  type: number; // 0 = PING, 1 = event
  event?: DiscordEvent;
};

export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    console.error('DISCORD_PUBLIC_KEY is not configured');
    return new NextResponse('Server configuration error', { status: 500 });
  }

  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  if (!signature || !timestamp) {
    return new NextResponse('Missing signature headers', { status: 401 });
  }

  // Read raw body BEFORE parsing — Ed25519 verification operates on raw bytes.
  const rawBody = await request.text();

  let isValid: boolean;
  try {
    isValid = await verifyKey(rawBody, signature, timestamp, publicKey);
  } catch {
    isValid = false;
  }

  if (!isValid) {
    return new NextResponse('Invalid request signature', { status: 401 });
  }

  let payload: DiscordWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON payload', { status: 400 });
  }

  // type 0 = PING (endpoint validation). Reply 204 with empty body.
  if (payload.type === 0) {
    console.log('Received Discord PING');
    return new NextResponse(null, { status: 204 });
  }

  // type 1 = webhook event
  if (payload.type === 1 && payload.event) {
    const event = payload.event;
    const data = (event.data ?? {}) as Record<string, unknown>;
    console.log(`Received Discord event: ${event.type}`);

    switch (event.type) {
      case 'APPLICATION_AUTHORIZED':
        console.log('App authorized:', {
          userId: (data.user as { id?: string } | undefined)?.id,
          scopes: data.scopes
        });
        break;
      case 'APPLICATION_DEAUTHORIZED':
        console.log('App deauthorized:', {
          userId: (data.user as { id?: string } | undefined)?.id
        });
        break;
      case 'ENTITLEMENT_CREATE':
        console.log('Entitlement created:', {
          entitlementId: data.id,
          userId: data.user_id,
          skuId: data.sku_id
        });
        break;
      case 'ENTITLEMENT_UPDATE':
        console.log('Entitlement updated:', { entitlementId: data.id });
        break;
      case 'ENTITLEMENT_DELETE':
        console.log('Entitlement deleted:', { entitlementId: data.id });
        break;
      case 'QUEST_USER_ENROLLMENT':
        console.log('Quest enrollment:', {
          userId: data.user_id,
          questId: data.quest_id
        });
        break;
      case 'LOBBY_MESSAGE_CREATE':
        console.log('Lobby message:', {
          lobbyId: data.lobby_id,
          content: data.content
        });
        break;
      case 'GAME_DIRECT_MESSAGE_CREATE':
        console.log('Game DM:', {
          channelId: data.channel_id,
          content: data.content
        });
        break;
      default:
        console.log('Unhandled event type:', event.type);
    }
  }

  return new NextResponse(null, { status: 204 });
}
