// Generated with: alipay-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Alipay (Antom / Alipay+) RSA256 (SHA256withRSA) signing + verification.

import { createVerify, createSign } from 'crypto';

// The acknowledgement body Antom expects, verbatim.
export const ACK_BODY = JSON.stringify({
  result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'Success' },
});

// PEM values are commonly stored on one line with literal "\n"; restore newlines.
export function normalizePem(pem: string): string {
  return (pem || '').replace(/\\n/g, '\n');
}

// Parse "algorithm=RSA256,keyVersion=1,signature=<value>" into an object.
export function parseSignatureHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// Two-line signed content: "<METHOD> <URI>\n<Client-Id>.<Time>.<Body>"
function buildSignedContent(method: string, uri: string, clientId: string, time: string, body: string): string {
  return `${method} ${uri}\n${clientId}.${time}.${body}`;
}

export interface VerifyParams {
  method: string;
  uri: string;
  clientId: string | null;
  requestTime: string | null;
  rawBody: string;
  signatureHeader: string | null;
  publicKey: string;
}

// Verify an inbound notification signature with Antom's PUBLIC key.
export function verifyAlipaySignature(params: VerifyParams): boolean {
  const { method, uri, clientId, requestTime, rawBody, signatureHeader, publicKey } = params;
  const { signature } = parseSignatureHeader(signatureHeader || '');
  if (!signature || !clientId || !requestTime) return false;

  const content = buildSignedContent(method, uri, clientId, requestTime, rawBody);

  // base64URL, often percent-encoded on the wire: decode, normalize, decode.
  let sigBytes: Buffer;
  try {
    sigBytes = Buffer.from(
      decodeURIComponent(signature).replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    );
  } catch {
    return false;
  }

  const verifier = createVerify('RSA-SHA256');
  verifier.update(content, 'utf8');
  verifier.end();
  try {
    return verifier.verify(normalizePem(publicKey), sigBytes);
  } catch {
    return false;
  }
}

export interface SignParams {
  method: string;
  uri: string;
  clientId: string;
  responseTime: string;
  body: string;
  privateKey: string;
  keyVersion?: string | number;
}

// Sign the acknowledgement response with YOUR merchant PRIVATE key.
export function signAlipayResponse(params: SignParams): string {
  const { method, uri, clientId, responseTime, body, privateKey, keyVersion = 1 } = params;
  const content = buildSignedContent(method, uri, clientId, responseTime, body);
  const signer = createSign('RSA-SHA256');
  signer.update(content, 'utf8');
  signer.end();
  const signature = signer.sign(normalizePem(privateKey)).toString('base64url');
  return `algorithm=RSA256,keyVersion=${keyVersion},signature=${signature}`;
}
