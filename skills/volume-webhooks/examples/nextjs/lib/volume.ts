// Generated with: volume-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto, { type KeyObject } from 'crypto';

/**
 * VOLUME WEBHOOK VERIFICATION
 *
 *   header    : Authorization: SHA256withRSA <base64 signature>
 *   algorithm : RSA PKCS#1 v1.5 with SHA-256 (Java "SHA256withRSA"). NOT PSS,
 *               NOT HMAC — there is no shared secret.
 *   signed    : the RAW request body bytes, nothing else (no timestamp, no id)
 *   key       : Volume's RSA-2048 public key, served as bare base64 SPKI
 *               (no BEGIN/END lines) from an environment-specific URL
 *   method    : Volume delivers with HTTP PUT
 */
export const PEM_URLS: Record<string, string> = {
  sandbox: 'https://api.sandbox.volumepay.io/.well-known/signature/pem',
  live: 'https://api.volumepay.io/.well-known/signature/pem',
};
const KEY_CACHE_TTL_MS = 60 * 60 * 1000; // re-fetch the public key hourly

let keyCache: { source: string; key: KeyObject; expiresAt: number } | null = null;

/** Turn either a PEM string or Volume's bare base64 SPKI body into a KeyObject. */
export function parsePublicKey(value: string): KeyObject {
  const text = value.trim();
  if (text.includes('-----BEGIN')) {
    return crypto.createPublicKey(text.replace(/\\n/g, '\n'));
  }
  return crypto.createPublicKey({
    key: Buffer.from(text.replace(/\s+/g, ''), 'base64'),
    format: 'der',
    type: 'spki',
  });
}

function pemUrl(): string {
  if (process.env.VOLUME_PEM_URL) return process.env.VOLUME_PEM_URL;
  const env = (process.env.VOLUME_ENV || 'sandbox').toLowerCase();
  const url = PEM_URLS[env];
  if (!url) throw new Error(`VOLUME_ENV must be "sandbox" or "live", got "${env}"`);
  return url;
}

/**
 * Resolve Volume's public key. VOLUME_PUBLIC_KEY (literal key) wins; otherwise
 * fetch from VOLUME_PEM_URL / the VOLUME_ENV URL and cache it. Throws if the
 * key cannot be obtained — callers must treat that as a rejection.
 */
export async function getVolumePublicKey(): Promise<KeyObject> {
  if (process.env.VOLUME_PUBLIC_KEY) {
    return parsePublicKey(process.env.VOLUME_PUBLIC_KEY);
  }

  const url = pemUrl();
  if (keyCache && keyCache.source === url && keyCache.expiresAt > Date.now()) {
    return keyCache.key;
  }

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetching Volume public key failed: HTTP ${res.status}`);
  const key = parsePublicKey(await res.text());
  keyCache = { source: url, key, expiresAt: Date.now() + KEY_CACHE_TTL_MS };
  return key;
}

export function clearKeyCache(): void {
  keyCache = null;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Verify a Volume webhook. Returns true only for a valid SHA256withRSA
 * signature over the exact raw body.
 */
export function verifyVolumeSignature(
  rawBody: Buffer,
  authorization: string | null | undefined,
  publicKey: KeyObject
): boolean {
  if (!authorization || !publicKey) return false;

  // "SHA256withRSA <signature>": scheme token, then the standard-base64 signature.
  const [scheme, signature, ...rest] = authorization.trim().split(/\s+/);
  if (scheme !== 'SHA256withRSA' || !signature || rest.length > 0) return false;
  if (!BASE64.test(signature)) return false; // rejects base64url / stray chars

  try {
    // PKCS#1 v1.5 padding is Node's default for RSA keys.
    return crypto.verify('sha256', rawBody, publicKey, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

export interface VolumeWebhookPayload {
  paymentId: string;
  merchantPaymentId?: string | null;
  paymentStatus: 'COMPLETED' | 'SETTLED' | 'FAILED' | string;
  errorDescription?: string | null;
  paymentRequest: { amount: number; currency: string; reference?: string | null };
  paymentRefundData?: {
    accountHolderName?: string;
    accountIdentifications?: { type: string; number: string }[];
  } | null;
  paymentMetadata?: Record<string, unknown> | null;
  applicationId?: string;
  isExternal?: boolean;
  [key: string]: unknown; // ignore properties you don't recognise
}

export interface PaymentRecord {
  merchantPaymentId?: string;
  amountMinor: number;
  currency: string;
}

// Idempotency: Volume retries until it gets a 200, and one payment can produce
// COMPLETED and later SETTLED, so dedupe on paymentId + paymentStatus.
// Use a database or Redis in production.
export const processed = new Set<string>();

// Replace with your payments table, keyed by paymentId.
export const payments = new Map<string, PaymentRecord>();

/**
 * Volume's docs: verify amount, currency and merchantPaymentId against the
 * payment record YOU created, and stop processing on any mismatch.
 * `amount` is in MAJOR units (24.23 = £24.23), so convert before comparing.
 */
export function reconcile(payload: VolumeWebhookPayload, record: PaymentRecord | undefined): string[] {
  if (!record) return ['no matching payment record'];
  const problems: string[] = [];
  const amountMinor = Math.round(Number(payload.paymentRequest?.amount) * 100);
  if (amountMinor !== record.amountMinor) problems.push('amount mismatch');
  if (payload.paymentRequest?.currency !== record.currency) problems.push('currency mismatch');
  if (record.merchantPaymentId !== undefined && payload.merchantPaymentId !== record.merchantPaymentId) {
    problems.push('merchantPaymentId mismatch');
  }
  return problems;
}
