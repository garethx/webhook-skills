// Generated with: supabase-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Supabase DATABASE WEBHOOKS receiver.
 *
 * Database Webhooks are Postgres triggers calling `pg_net`. Supabase defines
 * NO signature, NO HMAC, NO signing secret and NO verification header for this
 * surface — there is nothing to verify. The only authentication is whatever you
 * put in the trigger's headers JSON, e.g.
 *   '{"Content-Type":"application/json","Authorization":"Bearer <secret>"}'
 *
 * The signed Auth Hook surface lives at ./auth-hook/route.ts.
 */

/** Constant-time string compare that tolerates a length mismatch. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const x = Buffer.from(a || '', 'utf8');
  const y = Buffer.from(b || '', 'utf8');
  if (x.length !== y.length) return false; // length is not the secret here
  return crypto.timingSafeEqual(x, y);
}

/**
 * Authenticate a Supabase Database Webhook against a DEVELOPER-CONFIGURED
 * shared secret. Accepts `Authorization: Bearer <secret>` or `x-webhook-secret`.
 */
export function authenticateDatabaseWebhook(
  headers: Headers,
  secret: string | undefined
): boolean {
  if (!secret) return false;
  const authorization = headers.get('authorization') || '';
  const presented = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : headers.get('x-webhook-secret') || '';
  return timingSafeEqualStr(presented, secret);
}

/**
 * Database Webhook payload. These are the exact top-level fields Supabase
 * documents — there are no others. `record` / `old_record` mirror your table's
 * columns, so their inner shape is defined by your schema.
 */
export type DatabaseWebhookPayload =
  | {
      type: 'INSERT';
      table: string;
      schema: string;
      record: Record<string, unknown>;
      old_record: null;
    }
  | {
      type: 'UPDATE';
      table: string;
      schema: string;
      record: Record<string, unknown>;
      old_record: Record<string, unknown>;
    }
  | {
      type: 'DELETE';
      table: string;
      schema: string;
      record: null;
      old_record: Record<string, unknown>;
    };

export async function POST(request: NextRequest) {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SUPABASE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (!authenticateDatabaseWebhook(request.headers, secret)) {
    // 401, not 400: this is an authentication failure, not a malformed body
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Read the RAW body so the same handler shape works if you later front this
  // endpoint with a signed gateway.
  const rawBody = await request.text();

  let payload: DatabaseWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // `type` is the discriminator and is UPPERCASE
  switch (payload.type) {
    case 'INSERT':
      console.log(`INSERT on ${payload.schema}.${payload.table}:`, payload.record);
      // TODO: index the new row, enqueue onboarding, etc.
      // No delivery id is sent — dedupe on a primary key inside `record`
      break;

    case 'UPDATE':
      console.log(`UPDATE on ${payload.schema}.${payload.table}:`, {
        record: payload.record,
        old_record: payload.old_record,
      });
      // TODO: diff `record` against `old_record` and sync downstream
      break;

    case 'DELETE':
      console.log(`DELETE on ${payload.schema}.${payload.table}:`, payload.old_record);
      // TODO: tombstone downstream records; `record` is null here
      break;

    default:
      console.log(
        'Unhandled Supabase Database Webhook type:',
        (payload as { type?: string }).type
      );
  }

  // pg_net is fire-and-forget within the trigger's timeout_ms and Supabase
  // documents no retry policy — acknowledge fast, do slow work out of band.
  return NextResponse.json({ received: true });
}
