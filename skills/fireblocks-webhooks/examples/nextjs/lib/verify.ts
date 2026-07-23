// Generated with: fireblocks-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { createRemoteJWKSet, compactVerify, type JWTVerifyGetKey } from 'jose';

// Regional JWKS endpoints. Keys rotate automatically; `jose` fetches + caches them
// and selects the correct key by the JWS `kid`.
export const JWKS_URLS: Record<string, string> = {
  production: 'https://keys.fireblocks.io/.well-known/jwks.json',
  eu: 'https://eu-keys.fireblocks.io/.well-known/jwks.json',
  eu2: 'https://eu2-keys.fireblocks.io/.well-known/jwks.json',
  sandbox: 'https://sandbox-keys.fireblocks.io/.well-known/jwks.json',
};

export function getFireblocksJWKS(
  env: string = process.env.FIREBLOCKS_WEBHOOK_ENV || 'production'
): JWTVerifyGetKey {
  const url = process.env.FIREBLOCKS_JWKS_URL || JWKS_URLS[env] || JWKS_URLS.production;
  return createRemoteJWKSet(new URL(url));
}

// Lazily-created, cached resolver. `setJWKS` lets tests inject a local key set.
let _jwks: JWTVerifyGetKey | null = null;

export function getJWKS(): JWTVerifyGetKey {
  if (!_jwks) _jwks = getFireblocksJWKS();
  return _jwks;
}

export function setJWKS(jwks: JWTVerifyGetKey): void {
  _jwks = jwks;
}

/**
 * Verify a Fireblocks Webhooks v2 signature and return the parsed event.
 *
 * `Fireblocks-Webhook-Signature` is a *detached* compact JWS (`<header>..<signature>`)
 * signed with RS512 over the RAW request body. We reinsert the raw body (base64url)
 * as the payload, then verify against the JWKS.
 */
export async function verifyFireblocksWebhook(
  rawBody: Buffer,
  signatureHeader: string | null,
  jwks: JWTVerifyGetKey = getJWKS()
): Promise<Record<string, any>> {
  if (!signatureHeader) {
    throw new Error('Missing Fireblocks-Webhook-Signature header');
  }
  const parts = signatureHeader.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Fireblocks-Webhook-Signature header');
  }
  const [header, , signature] = parts;
  const payload = rawBody.toString('base64url');
  const fullJws = `${header}.${payload}.${signature}`;

  const { payload: verified } = await compactVerify(fullJws, jwks, {
    algorithms: ['RS512'], // pin the algorithm to avoid alg-confusion attacks
  });

  return JSON.parse(Buffer.from(verified).toString('utf8'));
}
