import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { verifyWalmartWebhook, isTimestampFresh } from '../app/webhooks/walmart/route';

beforeAll(() => {
  process.env.WALMART_WEBHOOK_SECRET = 'test_walmart_secret';
});

const SECRET = 'test_walmart_secret';
const PATH = '/webhooks/walmart';

/**
 * Generate a valid Walmart signature for testing, mirroring Walmart's algorithm:
 *   base64(HMAC_SHA256(secret, METHOD\nPATH\nTIMESTAMP\nSHA256_HEX(body)))
 */
function generateWalmartSignature(
  pathWithQuery: string,
  timestamp: string,
  body: string,
  secret: string,
  method = 'POST'
): string {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const stringToSign = [method.toUpperCase(), pathWithQuery, timestamp, bodyHash].join('\n');
  return crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
}

function nowSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

describe('verifyWalmartWebhook', () => {
  it('validates a correct signature', () => {
    const timestamp = nowSeconds();
    const body = JSON.stringify({ eventType: 'PO_CREATED' });
    const signature = generateWalmartSignature(PATH, timestamp, body, SECRET);

    expect(
      verifyWalmartWebhook({ method: 'POST', pathWithQuery: PATH, timestamp, rawBody: body, signature, secret: SECRET })
    ).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const timestamp = nowSeconds();
    expect(
      verifyWalmartWebhook({ method: 'POST', pathWithQuery: PATH, timestamp, rawBody: '{}', signature: 'nope', secret: SECRET })
    ).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const timestamp = nowSeconds();
    const body = JSON.stringify({ eventType: 'PO_CREATED', amount: 100 });
    const signature = generateWalmartSignature(PATH, timestamp, body, SECRET);

    expect(
      verifyWalmartWebhook({
        method: 'POST', pathWithQuery: PATH, timestamp,
        rawBody: JSON.stringify({ eventType: 'PO_CREATED', amount: 999 }), signature, secret: SECRET,
      })
    ).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const timestamp = nowSeconds();
    const body = JSON.stringify({ eventType: 'PO_CREATED' });
    const signature = generateWalmartSignature(PATH, timestamp, body, SECRET);

    expect(
      verifyWalmartWebhook({ method: 'POST', pathWithQuery: PATH, timestamp, rawBody: body, signature, secret: 'wrong' })
    ).toBe(false);
  });

  it('binds the signature to the path + query string', () => {
    const timestamp = nowSeconds();
    const pathWithQuery = `${PATH}?tenant=abc`;
    const body = JSON.stringify({ eventType: 'PO_CREATED' });
    const signature = generateWalmartSignature(pathWithQuery, timestamp, body, SECRET);

    expect(
      verifyWalmartWebhook({ method: 'POST', pathWithQuery, timestamp, rawBody: body, signature, secret: SECRET })
    ).toBe(true);
    // Dropping the query string must invalidate the same signature
    expect(
      verifyWalmartWebhook({ method: 'POST', pathWithQuery: PATH, timestamp, rawBody: body, signature, secret: SECRET })
    ).toBe(false);
  });

  it('rejects missing headers', () => {
    expect(
      verifyWalmartWebhook({ method: 'POST', pathWithQuery: PATH, timestamp: null, rawBody: '{}', signature: null, secret: SECRET })
    ).toBe(false);
  });
});

describe('isTimestampFresh', () => {
  it('accepts a current timestamp', () => {
    expect(isTimestampFresh(nowSeconds())).toBe(true);
  });

  it('rejects an old timestamp', () => {
    expect(isTimestampFresh(String(Math.floor(Date.now() / 1000) - 10 * 60))).toBe(false);
  });

  it('rejects a non-numeric timestamp', () => {
    expect(isTimestampFresh('not-a-number')).toBe(false);
  });
});
