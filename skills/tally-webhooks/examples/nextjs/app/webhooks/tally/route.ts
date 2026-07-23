// Generated with: tally-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Tally webhook signature.
 *
 * Tally signs the raw JSON body with HMAC-SHA256 keyed on the webhook's signing
 * secret, and sends the digest as base64 in the `Tally-Signature` header.
 */
export function verifyTallyWebhook(
  rawBody: string,
  signatureHeader: string | null,
  signingSecret: string
): boolean {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', signingSecret)
    .update(rawBody)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // length mismatch = invalid
  }
}

interface TallyField {
  key: string;
  label: string;
  type: string;
  value: unknown;
}

/** Look up an answer in data.fields by its label (order-independent). */
function getAnswer(fields: TallyField[] | undefined, label: string): unknown {
  return (fields || []).find((f) => f.label === label)?.value;
}

export async function POST(request: NextRequest) {
  // Read the raw body BEFORE parsing — signature is over the exact bytes.
  const rawBody = await request.text();
  const signature = request.headers.get('tally-signature');
  const signingSecret = process.env.TALLY_SIGNING_SECRET;

  // Signing is optional in Tally. If a secret is configured, require and verify
  // the signature. Otherwise the request is unsigned — process with a warning.
  if (signingSecret) {
    if (!verifyTallyWebhook(rawBody, signature, signingSecret)) {
      console.error('Tally webhook signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
  } else {
    console.warn(
      'TALLY_SIGNING_SECRET not set — skipping verification. Set a signing secret ' +
        'in the form Integrations tab for production endpoints.'
    );
  }

  const payload = JSON.parse(rawBody);
  const { eventId, eventType, data } = payload;

  switch (eventType) {
    case 'FORM_RESPONSE': {
      console.log(
        `FORM_RESPONSE ${eventId} for form "${data.formName}" (${data.formId})`
      );
      const email = getAnswer(data.fields, 'Email');
      if (email) console.log('Email answer:', email);
      // TODO: persist submission, sync to CRM, notify, etc.
      // Use eventId or data.submissionId as an idempotency key.
      break;
    }

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // Acknowledge receipt within Tally's 10s timeout.
  return NextResponse.json({ received: true });
}
