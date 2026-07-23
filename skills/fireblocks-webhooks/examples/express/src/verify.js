// Generated with: fireblocks-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { createRemoteJWKSet, compactVerify } from 'jose';

// Regional JWKS endpoints. Keys rotate automatically; `jose` fetches + caches them
// and selects the correct key by the JWS `kid`.
export const JWKS_URLS = {
  production: 'https://keys.fireblocks.io/.well-known/jwks.json',
  eu: 'https://eu-keys.fireblocks.io/.well-known/jwks.json',
  eu2: 'https://eu2-keys.fireblocks.io/.well-known/jwks.json',
  sandbox: 'https://sandbox-keys.fireblocks.io/.well-known/jwks.json',
};

/**
 * Build a remote JWKS key resolver for the configured environment.
 * `FIREBLOCKS_JWKS_URL` overrides the environment lookup entirely.
 */
export function getFireblocksJWKS(env = process.env.FIREBLOCKS_WEBHOOK_ENV || 'production') {
  const url = process.env.FIREBLOCKS_JWKS_URL || JWKS_URLS[env] || JWKS_URLS.production;
  return createRemoteJWKSet(new URL(url));
}

/**
 * Verify a Fireblocks Webhooks v2 signature and return the parsed event.
 *
 * The `Fireblocks-Webhook-Signature` header is a *detached* compact JWS
 * (`<header>..<signature>`) signed with RS512 over the RAW request body.
 * We reinsert the raw body (base64url) as the payload, then verify against the JWKS.
 *
 * @param {Buffer|string} rawBody - the RAW request body bytes (do NOT JSON.parse first)
 * @param {string} signatureHeader - value of the `Fireblocks-Webhook-Signature` header
 * @param {import('jose').JWTVerifyGetKey} jwks - a JWKS key resolver
 * @returns {Promise<object>} the verified, parsed event envelope
 * @throws if the header is missing/malformed or the signature is invalid
 */
export async function verifyFireblocksWebhook(rawBody, signatureHeader, jwks) {
  if (!signatureHeader) {
    throw new Error('Missing Fireblocks-Webhook-Signature header');
  }
  const parts = signatureHeader.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Fireblocks-Webhook-Signature header');
  }
  const [header, , signature] = parts;
  const payload = Buffer.from(rawBody).toString('base64url');
  const fullJws = `${header}.${payload}.${signature}`;

  const { payload: verified } = await compactVerify(fullJws, jwks, {
    algorithms: ['RS512'], // pin the algorithm to avoid alg-confusion attacks
  });

  return JSON.parse(Buffer.from(verified).toString('utf8'));
}
