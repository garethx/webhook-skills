// Generated with: linkedin-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Compute the challengeResponse for LinkedIn endpoint validation (GET).
 * challengeResponse = hex(HMACSHA256(challengeCode, clientSecret))
 */
export function challengeResponse(challengeCode: string, clientSecret: string): string {
  return crypto.createHmac('sha256', clientSecret).update(challengeCode).digest('hex');
}

/**
 * Verify a LinkedIn push-event signature (POST).
 * X-LI-Signature = hex(HMACSHA256("hmacsha256=" + rawBody, clientSecret))
 * The "hmacsha256=" prefix is part of the string-to-sign only, not the header.
 */
export function verifyLinkedInWebhook(
  rawBody: string,
  signatureHeader: string | null,
  clientSecret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update('hmacsha256=' + rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Classify a LinkedIn notification. LinkedIn sends no event-type header, so the
 * product is derived from the payload. Adapt the field checks to the products
 * your app subscribes to.
 */
export function getNotificationType(payload: Record<string, unknown>): string {
  if (payload.eventType) {
    return payload.eventType as string;
  }
  if ('leadType' in payload || 'leadAction' in payload || 'leadMetadata' in payload) {
    return 'LEAD_ACTION';
  }
  if ('organizationSocialAction' in payload || 'socialAction' in payload) {
    return 'ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS';
  }
  return 'UNKNOWN';
}

// Dedupe store — notifications may be delivered more than once.
// Replace with Redis/DB in production.
const processedNotifications = new Set<string>();

// GET: LinkedIn endpoint validation. Must respond within 3s as JSON.
export async function GET(request: NextRequest) {
  const challengeCode = request.nextUrl.searchParams.get('challengeCode');
  if (!challengeCode) {
    return NextResponse.json({ error: 'Missing challengeCode' }, { status: 400 });
  }

  return NextResponse.json({
    challengeCode,
    challengeResponse: challengeResponse(challengeCode, process.env.LINKEDIN_CLIENT_SECRET!),
  });
}

// POST: LinkedIn event delivery. Read the raw body for signature verification.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-li-signature');

  if (!verifyLinkedInWebhook(rawBody, signature, process.env.LINKEDIN_CLIENT_SECRET!)) {
    console.error('LinkedIn webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verifying.
  const payload = JSON.parse(rawBody);
  const notificationType = getNotificationType(payload);
  const notificationId: string | undefined = payload.notificationId;

  // Dedupe on notificationId before processing.
  if (notificationId && processedNotifications.has(notificationId)) {
    console.log(`Duplicate notification ${notificationId}, skipping`);
    return NextResponse.json({ received: true });
  }
  if (notificationId) {
    processedNotifications.add(notificationId);
  }

  console.log(`Received ${notificationType} notification (${notificationId})`);

  switch (notificationType) {
    case 'LEAD_ACTION':
      console.log('Lead Sync action:', payload.leadType);
      // TODO: fetch full lead via the Lead Sync pull API, enqueue to CRM, etc.
      break;

    case 'ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS':
      console.log('Org social action on:', payload.organizationSocialAction || payload.object);
      // TODO: moderate comment, notify community manager, etc.
      break;

    default:
      console.log(`Unhandled notification type: ${notificationType}`);
  }

  // Acknowledge with a 2xx so LinkedIn does not retry.
  return NextResponse.json({ received: true });
}
