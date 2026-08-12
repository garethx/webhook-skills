// Generated with: vapi-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// The four message.type values that REQUIRE a JSON response body.
export const REQUEST_RESPONSE_TYPES = [
  'assistant-request',
  'tool-calls',
  'transfer-destination-request',
  'knowledge-base-request',
] as const;

// Informational message.type values — acknowledge with 200 (no body needed).
export const INFORMATIONAL_TYPES = [
  'status-update',
  'end-of-call-report',
  'hang',
  'conversation-update',
  'transcript',
  'speech-update',
  'model-output',
  'transfer-update',
  'user-interrupted',
  'language-change-detected',
  'phone-call-control',
  'chat.created',
  'chat.deleted',
  'session.created',
  'session.updated',
  'session.deleted',
] as const;

/**
 * Timing-safe string comparison that tolerates length mismatch
 * (crypto.timingSafeEqual throws when buffer lengths differ).
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Read the shared secret from whichever header the Server URL credential sends:
 * `Authorization: Bearer <token>` (strip the prefix) or the legacy
 * `X-Vapi-Secret` header.
 */
export function extractToken(headers: Headers): string | undefined {
  const auth = headers.get('authorization');
  if (auth) return auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  return headers.get('x-vapi-secret') ?? undefined;
}

/**
 * Verify a Vapi webhook using the shared-secret path (literal compare).
 */
export function verifyVapiSecret(headers: Headers, expected: string | undefined): boolean {
  const token = extractToken(headers);
  if (!token || !expected) return false;
  return safeEqual(token, expected);
}

export async function POST(request: NextRequest) {
  const expected = process.env.VAPI_WEBHOOK_SECRET;

  // Authenticate first (the secret is in a header, not the body).
  if (!verifyVapiSecret(request.headers, expected)) {
    console.error('Vapi webhook authentication failed: shared secret mismatch');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  // The event type is NESTED at message.type — not a top-level field.
  const message = body?.message ?? {};
  const type: string | undefined = message.type;
  const callId = message.call?.id;
  console.log(`Received Vapi message ${type} (call ${callId})`);

  // --- Request/response types: MUST return a JSON body ---

  if (type === 'assistant-request') {
    // Answer within ~7.5s. Return { assistantId } | { assistant } | { destination } | { error }.
    return NextResponse.json({
      assistantId: process.env.VAPI_ASSISTANT_ID || 'YOUR_ASSISTANT_ID',
    });
  }

  if (type === 'tool-calls') {
    const toolCallList: any[] = message.toolCallList ?? [];
    const results = toolCallList.map((tc) => ({
      name: tc.function?.name ?? tc.name,
      toolCallId: tc.id ?? tc.toolCallId,
      // TODO: execute the tool and put its return value here.
      result: 'TODO: your tool result',
    }));
    return NextResponse.json({ results });
  }

  if (type === 'transfer-destination-request') {
    return NextResponse.json({
      destination: { type: 'number', number: process.env.VAPI_TRANSFER_NUMBER || '+15551234567' },
      message: { type: 'request-start', message: 'Transferring you now.' },
    });
  }

  if (type === 'knowledge-base-request') {
    // TODO: look up relevant documents for the query.
    return NextResponse.json({ documents: [] });
  }

  // --- Informational types: acknowledge with 200, no body required ---

  switch (type) {
    case 'status-update':
      console.log('Call status:', message.status);
      break;
    case 'end-of-call-report':
      console.log('End of call:', message.endedReason, 'cost:', message.cost);
      // TODO: store the report / transcript / recording.
      break;
    case 'transcript':
      console.log('Transcript:', message.role, message.transcript);
      break;
    default:
      if (!INFORMATIONAL_TYPES.includes(type as (typeof INFORMATIONAL_TYPES)[number])) {
        console.log(`Unhandled Vapi message type: ${type}`);
      }
  }

  return NextResponse.json({ received: true });
}
