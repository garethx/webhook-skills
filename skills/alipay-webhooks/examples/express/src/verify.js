// Generated with: alipay-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Alipay (Antom / Alipay+) RSA256 (SHA256withRSA) signing + verification.
// Shared by the Express handler and the tests.

const { createVerify, createSign } = require('crypto');

// The acknowledgement body Antom expects, verbatim. Antom stops retrying once it
// receives a signed 200 with this body.
const ACK_BODY = JSON.stringify({
  result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'Success' },
});

// PEM values are commonly stored on one line with literal "\n"; restore newlines.
function normalizePem(pem) {
  return (pem || '').replace(/\\n/g, '\n');
}

// Parse "algorithm=RSA256,keyVersion=1,signature=<value>" into an object.
// Only splits on the FIRST "=" per part so base64 "=" padding survives.
function parseSignatureHeader(header) {
  return Object.fromEntries(
    String(header || '')
      .split(',')
      .map((part) => {
        const i = part.indexOf('=');
        if (i === -1) return [part.trim(), ''];
        return [part.slice(0, i).trim(), part.slice(i + 1).trim()];
      })
  );
}

// Two-line signed content: "<METHOD> <URI>\n<Client-Id>.<Time>.<Body>"
function buildSignedContent({ method, uri, clientId, time, body }) {
  return `${method} ${uri}\n${clientId}.${time}.${body}`;
}

// Verify an inbound notification signature with Antom's PUBLIC key.
function verifyAlipaySignature({ method, uri, clientId, requestTime, rawBody, signatureHeader, publicKey }) {
  const { signature } = parseSignatureHeader(signatureHeader);
  if (!signature || !clientId || !requestTime) return false;

  const content = buildSignedContent({ method, uri, clientId, time: requestTime, body: rawBody });

  // The signature is base64URL and often percent-encoded on the wire:
  // percent-decode, normalize URL-safe alphabet to standard base64, then decode.
  let sigBytes;
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
    // Malformed key or signature buffer — fail closed.
    return false;
  }
}

// Sign the acknowledgement response with YOUR merchant PRIVATE key.
// Returns the value for the response `Signature` header.
function signAlipayResponse({ method, uri, clientId, responseTime, body, privateKey, keyVersion = 1 }) {
  const content = buildSignedContent({ method, uri, clientId, time: responseTime, body });
  const signer = createSign('RSA-SHA256');
  signer.update(content, 'utf8');
  signer.end();
  const signature = signer.sign(normalizePem(privateKey)).toString('base64url');
  return `algorithm=RSA256,keyVersion=${keyVersion},signature=${signature}`;
}

module.exports = {
  ACK_BODY,
  normalizePem,
  parseSignatureHeader,
  buildSignedContent,
  verifyAlipaySignature,
  signAlipayResponse,
};
