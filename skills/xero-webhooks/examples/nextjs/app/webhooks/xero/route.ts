// Generated with: xero-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

interface XeroEvent {
  resourceUrl: string;
  resourceId: string;
  eventDateUtc: string;
  eventType: 'CREATE' | 'UPDATE';
  eventCategory: 'CONTACT' | 'INVOICE' | 'CREDITNOTE' | 'SUBSCRIPTION';
  tenantId: string;
  tenantType: 'ORGANISATION' | 'APPLICATION';
}

/**
 * Verify a Xero webhook signature.
 *
 * Xero computes HMAC-SHA256 over the RAW request body using the app's webhook
 * signing key, base64-encodes it, and sends it in the `x-xero-signature` header.
 */
function verifyXeroSignature(
  rawBody: string,
  signatureHeader: string | null,
  signingKey: string
): boolean {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(rawBody, 'utf8')
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

/**
 * Handle a single Xero event. Payloads are thin: fetch the resource from
 * `event.resourceUrl` (authenticated with an OAuth2 token + `Xero-tenant-id`)
 * to get the full record. Dedupe on resourceId + eventDateUtc for idempotency.
 */
function handleEvent(event: XeroEvent): void {
  const key = `${event.eventCategory}/${event.eventType}`;

  switch (key) {
    case 'CONTACT/CREATE':
      console.log('New contact:', event.resourceId);
      // TODO: fetch event.resourceUrl, sync new contact to your CRM
      break;
    case 'CONTACT/UPDATE':
      console.log('Contact updated:', event.resourceId);
      // TODO: fetch event.resourceUrl, update local contact record
      break;
    case 'INVOICE/CREATE':
      console.log('New invoice:', event.resourceId);
      // TODO: fetch event.resourceUrl, record receivable/payable
      break;
    case 'INVOICE/UPDATE':
      console.log('Invoice updated:', event.resourceId);
      // TODO: fetch event.resourceUrl, reconcile payment/status change
      break;
    case 'CREDITNOTE/CREATE':
      console.log('New credit note:', event.resourceId);
      // TODO: fetch event.resourceUrl, track refund/adjustment
      break;
    case 'CREDITNOTE/UPDATE':
      console.log('Credit note updated:', event.resourceId);
      // TODO: fetch event.resourceUrl, update refund/adjustment
      break;
    case 'SUBSCRIPTION/CREATE':
      console.log('New subscription:', event.resourceId);
      // TODO: provision access for new app-store subscription
      break;
    case 'SUBSCRIPTION/UPDATE':
      console.log('Subscription updated:', event.resourceId);
      // TODO: handle upgrade/cancellation/renewal
      break;
    default:
      console.log(`Unhandled event: ${key} (${event.resourceId})`);
  }
}

export async function POST(request: NextRequest) {
  // Read the RAW body for signature verification (do NOT parse first).
  const rawBody = await request.text();
  const signature = request.headers.get('x-xero-signature');

  // Verify first. Xero's Intent to Receive (ITR) requires 200 for a valid
  // signature and 401 for an invalid one. Return 401 (NOT 400) for a bad
  // signature or ITR will fail and the webhook will stay inactive.
  if (!verifyXeroSignature(rawBody, signature, process.env.XERO_WEBHOOK_KEY as string)) {
    console.error('Xero signature verification failed');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Valid signature. Parse and dispatch real events; empty ITR probes just 200.
  try {
    const payload = JSON.parse(rawBody);
    if (Array.isArray(payload.events)) {
      for (const event of payload.events as XeroEvent[]) {
        handleEvent(event);
      }
    }
  } catch {
    // Valid signature but unparseable body (e.g. an empty ITR probe): still 200.
  }

  // Respond fast; do heavy work (resource fetches) asynchronously.
  return new NextResponse('OK', { status: 200 });
}
