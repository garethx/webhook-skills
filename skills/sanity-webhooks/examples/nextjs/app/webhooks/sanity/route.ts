// Generated with: sanity-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { isValidSignature, SIGNATURE_HEADER_NAME } from '@sanity/webhook';

export async function POST(request: NextRequest) {
  // Get the RAW body for signature verification. Do not use request.json()
  // first — parsing + re-stringifying breaks the HMAC.
  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER_NAME); // 'sanity-webhook-signature'

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing sanity-webhook-signature header' },
      { status: 400 }
    );
  }

  // Verify the signature against the raw body using the official SDK.
  // isValidSignature is async in @sanity/webhook v4+ and returns a boolean.
  let valid: boolean;
  try {
    valid = await isValidSignature(rawBody, signature, process.env.SANITY_WEBHOOK_SECRET!);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Signature verification error:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Safe to parse now that the payload is verified.
  let doc: { _type?: string; _id?: string; [key: string]: unknown };
  try {
    doc = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Optional: deduplicate retries using the idempotency-key header.
  const idempotencyKey = request.headers.get('idempotency-key');

  // Sanity has no fixed event names — dispatch on the document `_type`
  // (from the default payload or your GROQ projection).
  switch (doc._type) {
    case 'post':
      console.log('Post changed:', doc._id, `(idempotency-key: ${idempotencyKey})`);
      // TODO: revalidatePath(`/blog/${doc.slug}`), purge CDN cache, etc.
      break;

    case 'author':
      console.log('Author changed:', doc._id);
      // TODO: Revalidate author pages.
      break;

    case 'product':
      console.log('Product changed:', doc._id);
      // TODO: Revalidate storefront, reindex search, etc.
      break;

    case 'category':
      console.log('Category changed:', doc._id);
      // TODO: Rebuild navigation, revalidate listings.
      break;

    case 'page':
      console.log('Page changed:', doc._id);
      // TODO: Revalidate the page route.
      break;

    default:
      console.log(`Unhandled document type: ${doc._type}`);
  }

  // Return 200 to acknowledge receipt.
  return NextResponse.json({ received: true });
}
