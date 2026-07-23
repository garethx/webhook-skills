// Generated with: vercel-log-drains-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import crypto from 'crypto';

interface VercelLog {
  id?: string;
  source?: string;
  level?: string;
  message?: string;
  statusCode?: number;
  path?: string;
  buildId?: string;
  destination?: string;
  requestId?: string;
  proxy?: { wafAction?: string; clientIp?: string };
  [key: string]: unknown;
}

/**
 * Verify a Vercel Log Drain signature.
 *
 * Vercel signs the RAW request body with HMAC-SHA1 keyed on the drain's
 * signature secret and sends the hex digest in `x-vercel-signature`
 * (no `sha1=` prefix).
 */
export function verifyVercelSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Parse a batch of log entries. Vercel delivers either a JSON array
 * (`[{…},{…}]`) or NDJSON (one JSON object per line).
 */
export function parseLogs(rawBody: string): VercelLog[] {
  const text = rawBody.trim();
  if (!text) {
    return [];
  }
  if (text.startsWith('[')) {
    return JSON.parse(text) as VercelLog[];
  }
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as VercelLog);
}

/**
 * Dispatch a single log entry based on its `source`.
 */
function handleLogEntry(log: VercelLog): void {
  switch (log.source) {
    case 'lambda':
      console.log(`[lambda] ${log.level} ${log.statusCode ?? ''} ${log.path ?? ''}: ${log.message ?? ''}`);
      // TODO: forward function logs / errors to your observability stack
      break;
    case 'edge':
      console.log(`[edge] ${log.level} ${log.path ?? ''}: ${log.message ?? ''}`);
      break;
    case 'build':
      console.log(`[build] ${log.level} (${log.buildId ?? 'n/a'}): ${log.message ?? ''}`);
      break;
    case 'static':
      console.log(`[static] ${log.statusCode ?? ''} ${log.path ?? ''}`);
      break;
    case 'external':
      console.log(`[external] ${log.destination ?? ''} ${log.path ?? ''}`);
      break;
    case 'firewall':
      console.log(`[firewall] ${log.proxy?.wafAction ?? 'denied'} ${log.proxy?.clientIp ?? ''} ${log.path ?? ''}`);
      break;
    case 'redirect':
      console.log(`[redirect] ${log.path ?? ''} -> ${log.destination ?? ''}`);
      break;
    default:
      console.log(`[${log.source ?? 'unknown'}] ${log.message ?? ''}`);
  }

  if (log.statusCode === -1) {
    console.warn(`Lambda crashed (no response): request ${log.requestId ?? 'unknown'}`);
  }
}

export async function POST(request: Request) {
  // Echo the verification token so the create/test handshake succeeds.
  const verifyHeaders: Record<string, string> = {};
  if (process.env.VERCEL_VERIFY) {
    verifyHeaders['x-vercel-verify'] = process.env.VERCEL_VERIFY;
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-vercel-signature');

  // The create/test probe is unsigned. Treat a missing signature as the
  // handshake: acknowledge with 200 and do not process logs.
  if (!signature) {
    return NextResponse.json(
      { received: true, handshake: true },
      { headers: verifyHeaders }
    );
  }

  // Verify signed deliveries against the raw body.
  if (!verifyVercelSignature(rawBody, signature, process.env.VERCEL_LOG_DRAIN_SECRET as string)) {
    console.error('Vercel log drain signature verification failed');
    return NextResponse.json(
      { code: 'invalid_signature', error: "signature didn't match" },
      { status: 403, headers: verifyHeaders }
    );
  }

  // Parse the batch only after verification succeeds.
  let logs: VercelLog[];
  try {
    logs = parseLogs(rawBody);
  } catch {
    return NextResponse.json(
      { error: 'Invalid log payload' },
      { status: 400, headers: verifyHeaders }
    );
  }

  console.log(`Received ${logs.length} log entr${logs.length === 1 ? 'y' : 'ies'}`);
  for (const log of logs) {
    handleLogEntry(log);
  }

  return NextResponse.json(
    { received: true, count: logs.length },
    { headers: verifyHeaders }
  );
}
