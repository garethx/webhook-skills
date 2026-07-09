import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const webhookSecret = process.env.STATSIG_WEBHOOK_SECRET!;

// Verify the Statsig webhook signature.
// Signature is `v0=<hmac-sha256-hex>` over the basestring `v0:<timestamp>:<rawBody>`.
function verifyStatsigWebhook(
  rawBody: string,
  timestamp: string | null,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!timestamp || !signatureHeader) return false;

  const basestring = `v0:${timestamp}:${rawBody}`;
  const expected =
    'v0=' + crypto.createHmac('sha256', secret).update(basestring).digest('hex');

  const sigBuf = Buffer.from(signatureHeader, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}

interface StatsigEvent {
  eventName: string;
  user?: Record<string, unknown>;
  userID?: string;
  timestamp?: string;
  value?: unknown;
  metadata?: Record<string, unknown>;
  timeUUID?: string;
  unitID?: string;
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const rawBody = await request.text();
  const timestamp = request.headers.get('x-statsig-request-timestamp');
  const signature = request.headers.get('x-statsig-signature');

  if (!verifyStatsigWebhook(rawBody, timestamp, signature, webhookSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Signature verified - safe to parse
  const payload = JSON.parse(rawBody);

  // Statsig delivers events in batches: { "data": [ ... ] }
  const events: StatsigEvent[] = Array.isArray(payload.data) ? payload.data : [];

  for (const event of events) {
    switch (event.eventName) {
      case 'statsig::gate_exposure':
        console.log('Gate exposure:', event.metadata?.gate);
        // TODO: record exposure, update analytics, etc.
        break;

      case 'statsig::config_exposure':
        console.log('Config exposure:', event.metadata?.config);
        // TODO: record exposure, etc.
        break;

      case 'statsig::experiment_exposure':
        console.log('Experiment exposure:', event.metadata?.config);
        // TODO: record experiment assignment, etc.
        break;

      case 'statsig::config_change':
        console.log('Config change:', event.metadata);
        // TODO: audit configuration changes, etc.
        break;

      default:
        // Custom events logged via logEvent
        console.log('Custom event:', event.eventName);
    }
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
