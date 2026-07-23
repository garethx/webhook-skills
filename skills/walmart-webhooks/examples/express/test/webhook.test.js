const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.WALMART_WEBHOOK_SECRET = 'test_walmart_secret';

const { app, verifyWalmartWebhook, isTimestampFresh } = require('../src/index');

const SECRET = process.env.WALMART_WEBHOOK_SECRET;

/**
 * Generate a valid Walmart signature for testing, mirroring Walmart's algorithm:
 *   base64(HMAC_SHA256(secret, METHOD\nPATH\nTIMESTAMP\nSHA256_HEX(body)))
 */
function generateWalmartSignature({ method = 'POST', pathWithQuery, timestamp, body, secret }) {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const stringToSign = [method.toUpperCase(), pathWithQuery, String(timestamp), bodyHash].join('\n');
  return crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

describe('verifyWalmartWebhook', () => {
  const path = '/webhooks/walmart';

  it('returns true for a valid signature', () => {
    const timestamp = String(nowSeconds());
    const body = '{"eventType":"PO_CREATED"}';
    const signature = generateWalmartSignature({ pathWithQuery: path, timestamp, body, secret: SECRET });

    expect(verifyWalmartWebhook({
      method: 'POST', pathWithQuery: path, timestamp, rawBody: body, signature, secret: SECRET,
    })).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const timestamp = String(nowSeconds());
    expect(verifyWalmartWebhook({
      method: 'POST', pathWithQuery: path, timestamp, rawBody: '{}', signature: 'not-a-signature', secret: SECRET,
    })).toBe(false);
  });

  it('returns false when the body is tampered', () => {
    const timestamp = String(nowSeconds());
    const body = '{"eventType":"PO_CREATED","amount":100}';
    const signature = generateWalmartSignature({ pathWithQuery: path, timestamp, body, secret: SECRET });

    expect(verifyWalmartWebhook({
      method: 'POST', pathWithQuery: path, timestamp,
      rawBody: '{"eventType":"PO_CREATED","amount":999}', signature, secret: SECRET,
    })).toBe(false);
  });

  it('returns false for the wrong secret', () => {
    const timestamp = String(nowSeconds());
    const body = '{"eventType":"PO_CREATED"}';
    const signature = generateWalmartSignature({ pathWithQuery: path, timestamp, body, secret: SECRET });

    expect(verifyWalmartWebhook({
      method: 'POST', pathWithQuery: path, timestamp, rawBody: body, signature, secret: 'wrong_secret',
    })).toBe(false);
  });

  it('includes the query string in the signed path', () => {
    const timestamp = String(nowSeconds());
    const pathWithQuery = '/webhooks/walmart?tenant=abc';
    const body = '{"eventType":"PO_CREATED"}';
    const signature = generateWalmartSignature({ pathWithQuery, timestamp, body, secret: SECRET });

    expect(verifyWalmartWebhook({
      method: 'POST', pathWithQuery, timestamp, rawBody: body, signature, secret: SECRET,
    })).toBe(true);
    // Same signature must fail if the query string is dropped
    expect(verifyWalmartWebhook({
      method: 'POST', pathWithQuery: path, timestamp, rawBody: body, signature, secret: SECRET,
    })).toBe(false);
  });

  it('returns false when headers are missing', () => {
    expect(verifyWalmartWebhook({
      method: 'POST', pathWithQuery: path, timestamp: undefined, rawBody: '{}', signature: undefined, secret: SECRET,
    })).toBe(false);
  });
});

describe('isTimestampFresh', () => {
  it('accepts a current timestamp', () => {
    expect(isTimestampFresh(String(nowSeconds()))).toBe(true);
  });

  it('rejects an old timestamp', () => {
    expect(isTimestampFresh(String(nowSeconds() - 10 * 60))).toBe(false);
  });

  it('rejects a non-numeric timestamp', () => {
    expect(isTimestampFresh('not-a-number')).toBe(false);
  });
});

describe('POST /webhooks/walmart', () => {
  const path = '/webhooks/walmart';

  function post(body, { timestamp, signature } = {}) {
    const req = request(app).post(path).set('Content-Type', 'application/json');
    if (timestamp !== undefined) req.set('WM_SEC.TIMESTAMP', String(timestamp));
    if (signature !== undefined) req.set('WM_SEC.SIGNATURE', signature);
    return req.send(body);
  }

  it('returns 400 for a missing signature', async () => {
    const timestamp = nowSeconds();
    const res = await post('{"eventType":"PO_CREATED"}', { timestamp });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const timestamp = nowSeconds();
    const res = await post('{"eventType":"PO_CREATED"}', { timestamp, signature: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a stale timestamp', async () => {
    const timestamp = nowSeconds() - 10 * 60; // 10 minutes old
    const body = '{"eventType":"PO_CREATED"}';
    const signature = generateWalmartSignature({ pathWithQuery: path, timestamp, body, secret: SECRET });
    const res = await post(body, { timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Stale timestamp');
  });

  it('returns 200 for a valid signature', async () => {
    const timestamp = nowSeconds();
    const body = JSON.stringify({ eventType: 'PO_CREATED', resourceName: 'ORDER', sellerId: '123', resource: { purchaseOrderId: 'PO-1' } });
    const signature = generateWalmartSignature({ pathWithQuery: path, timestamp, body, secret: SECRET });
    const res = await post(body, { timestamp, signature });
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  // Only PO_CREATED, INVENTORY_OOS, BUY_BOX_CHANGED and RETURN_CREATED are confirmed
  // event type names; the rest are illustrative. Confirm the full set via Walmart's
  // Get event types API for your account.
  it('handles the event types the dispatcher knows about', async () => {
    const eventTypes = [
      'PO_CREATED', 'PO_LINE_AUTOCANCELLED', 'INTENT_TO_CANCEL', 'INVENTORY_OOS',
      'OFFER_PUBLISHED', 'OFFER_UNPUBLISHED', 'BUY_BOX_CHANGED', 'RETURN_CREATED',
      'REPORT_STATUS', 'SELLER_PERFORMANCE_ALARMS',
    ];
    for (const eventType of eventTypes) {
      const timestamp = nowSeconds();
      const body = JSON.stringify({ eventType, resourceName: 'ORDER', sellerId: '123', resource: {} });
      const signature = generateWalmartSignature({ pathWithQuery: path, timestamp, body, secret: SECRET });
      const res = await post(body, { timestamp, signature });
      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
