// Generated with: baselinker-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest } from 'next/server';
import crypto from 'crypto';

// BaseLinker (Base.com) is NOT a normal webhook source:
//
//   1. Deliveries are HTTP HEAD requests. A HEAD request has NO BODY by
//      definition — never `await request.json()`, and export HEAD (not POST).
//   2. The entire payload is in the QUERY STRING
//      (request.nextUrl.searchParams). Query values are always STRINGS: coerce
//      numerics explicitly and never assume a param is present. Observed params
//      are `order_id` (e.g. 42) and `state` (e.g. "packed") — observed examples,
//      NOT a documented or exhaustive list.
//   3. There is NO signature verification. No HMAC, no signature header, no
//      timestamp/replay check, no shared secret, no handshake. Do not write a
//      verifier — there is nothing to verify with.
//
// Note: X-BLToken is BaseLinker's REQUEST auth header for YOUR outbound calls to
// api.baselinker.com. It is not a webhook signature and never arrives inbound.

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
 * Check the token YOU appended to the endpoint URL.
 *
 * This is NOT a BaseLinker signature — BaseLinker signs nothing. It is your own
 * secret round-tripped back to you in the query string, so it is visible in the
 * URL and in proxy logs. Returns true when no token is configured.
 */
export function verifyUrlToken(
  searchParams: URLSearchParams,
  expected: string | undefined
): boolean {
  if (!expected) return true; // not configured — nothing to check
  const provided = searchParams.get('token');
  if (provided === null) return false;
  return safeEqual(provided, expected);
}

/**
 * Read a BaseLinker delivery out of the query string.
 *
 * Every value arrives as a string, so `order_id` is coerced explicitly and
 * validated. Nothing is assumed present.
 */
export function parseDelivery(searchParams: URLSearchParams): {
  orderId: number | null;
  state: string | null;
} {
  const rawOrderId = searchParams.get('order_id');
  const state = searchParams.get('state');

  // Query values are ALWAYS strings — coerce, then validate the result.
  const orderId = rawOrderId === null ? NaN : Number(rawOrderId);
  const validOrderId = Number.isInteger(orderId) && orderId > 0;

  return { orderId: validOrderId ? orderId : null, state };
}

/**
 * Fetch the authoritative order from the documented BaseLinker API.
 *
 * The HEAD delivery carries no body and no proof of origin, so it tells you THAT
 * something changed, not WHAT — treat it as an untrusted hint. X-BLToken is the
 * request auth header here (outbound only).
 */
export async function fetchOrder(orderId: number): Promise<any | null> {
  const token = process.env.BASELINKER_API_TOKEN;
  if (!token) return null;

  const response = await fetch('https://api.baselinker.com/connector.php', {
    method: 'POST',
    headers: {
      'X-BLToken': token,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      method: 'getOrders',
      parameters: JSON.stringify({ order_id: orderId }),
    }),
  });

  return response.json();
}

// HEAD, not POST — BaseLinker only ever sends HEAD requests. Exporting POST here
// would mean never receiving a delivery.
export async function HEAD(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Optional URL-token check (see verifyUrlToken — not a provider signature).
  if (!verifyUrlToken(searchParams, process.env.BASELINKER_URL_TOKEN)) {
    console.error('BaseLinker webhook rejected: URL token missing or mismatched');
    // Bodyless, like every response on this route.
    return new Response(null, { status: 401 });
  }

  const { orderId, state } = parseDelivery(searchParams);

  if (orderId === null) {
    // `order_id` was absent or not a positive integer. Nothing actionable.
    // (If you would rather never signal failure to an undocumented sender, log
    // and return 200 here instead.)
    console.error('BaseLinker webhook rejected: missing or invalid order_id');
    return new Response(null, { status: 400 });
  }

  // `state` is an opaque string (observed: "packed"). It is NOT an event-type
  // discriminator and NOT a documented enum — don't switch over a fixed list.
  console.log(`BaseLinker change for order ${orderId} (state: ${state ?? 'none'})`);

  // Enrich: re-fetch the authoritative order before acting on it. In production
  // push this onto a queue (or use `after()` / waitUntil) so the acknowledgement
  // is not delayed by the API round-trip.
  try {
    const order = await fetchOrder(orderId);
    if (order) console.log(`Fetched order ${orderId}:`, order.status);
  } catch (err) {
    console.error(`Failed to fetch order ${orderId}:`, (err as Error).message);
  }

  // TODO: replace the logging above with your own processing (dedupe on
  // order_id + state so a redelivery doesn't action the same change twice).

  // A bare, bodyless 200. RFC 9110 section 9.3.2 forbids a body on a HEAD
  // response — never NextResponse.json(...) here.
  return new Response(null, { status: 200 });
}
