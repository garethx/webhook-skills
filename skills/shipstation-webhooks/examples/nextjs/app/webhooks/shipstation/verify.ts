// Generated with: shipstation-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// V1 resource_url hosts are reportedly numbered (ssapi1/ssapi2.shipstation.com),
// so match a pattern rather than a single fixed hostname.
export const SHIPSTATION_HOST_RE = /^ssapi\d*\.shipstation\.com$/;

// ShipStation V1 events (the resource_type field on every delivery)
export type ShipStationEvent =
  | 'ORDER_NOTIFY'
  | 'ITEM_ORDER_NOTIFY'
  | 'SHIP_NOTIFY'
  | 'ITEM_SHIP_NOTIFY'
  | 'FULFILLMENT_SHIPPED'
  | 'FULFILLMENT_REJECTED';

export interface ShipStationWebhook {
  resource_url: string;
  resource_type: ShipStationEvent | string;
}

/**
 * ShipStation V1 has NO signature. Secure the endpoint by comparing an
 * unguessable token from the ?token= query string, timing-safe.
 */
export function verifyToken(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — guard it
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Fetch the thin payload's resource_url with HTTP Basic auth.
 * Only ShipStation's own host is ever requested (SSRF guard).
 */
export async function fetchResource(
  resourceUrl: string,
  key: string | undefined,
  secret: string | undefined
): Promise<unknown> {
  if (!key || !secret) return null; // no credentials configured — skip fetch

  if (!SHIPSTATION_HOST_RE.test(new URL(resourceUrl).hostname)) {
    throw new Error(`Refusing to fetch non-ShipStation host: ${resourceUrl}`);
  }

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await fetch(resourceUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (res.status === 429) {
    // V1 rate limit: 40 req/min per key
    throw new Error(`Rate limited; reset in ${res.headers.get('X-Rate-Limit-Reset')}s`);
  }
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}
