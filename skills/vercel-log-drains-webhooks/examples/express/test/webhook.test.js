const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.VERCEL_LOG_DRAIN_SECRET = 'test_drain_secret';
process.env.VERCEL_VERIFY = 'test_verify_token';

const { app, verifyVercelSignature, parseLogs } = require('../src/index');

/**
 * Generate a valid Vercel log drain signature for testing.
 * HMAC-SHA1 hex digest of the raw body (no prefix).
 */
function generateSignature(payload, secret) {
  return crypto.createHmac('sha1', secret).update(payload).digest('hex');
}

const secret = process.env.VERCEL_LOG_DRAIN_SECRET;

// A realistic batch of two log entries as a JSON array.
const jsonBatch = JSON.stringify([
  {
    id: '1573817187330377061717300000',
    deploymentId: 'dpl_233NRGRjVZX1caZrXWtz5g1TAksD',
    source: 'build',
    host: 'my-app.vercel.app',
    timestamp: 1573817187330,
    projectId: 'gdufoJxB6b9b1fEqr1jUtFkyavUU',
    level: 'info',
    message: 'Build completed successfully',
    buildId: 'bld_cotnkcr76',
    type: 'stdout',
  },
  {
    id: '1573817250283254651097202070',
    deploymentId: 'dpl_233NRGRjVZX1caZrXWtz5g1TAksD',
    source: 'lambda',
    host: 'my-app.vercel.app',
    timestamp: 1573817250283,
    projectId: 'gdufoJxB6b9b1fEqr1jUtFkyavUU',
    level: 'info',
    message: 'API request processed',
    statusCode: 200,
    path: '/api/users',
    environment: 'production',
  },
]);

// The same two entries encoded as NDJSON.
const ndjsonBatch =
  '{"id":"a","source":"edge","level":"info","message":"edge log","timestamp":1}\n' +
  '{"id":"b","source":"firewall","level":"warning","path":"/admin","proxy":{"wafAction":"deny","clientIp":"1.2.3.4"}}';

describe('verifyVercelSignature', () => {
  it('returns true for a valid signature', () => {
    const body = Buffer.from(jsonBatch);
    const signature = generateSignature(body, secret);
    expect(verifyVercelSignature(body, signature, secret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const body = Buffer.from(jsonBatch);
    expect(verifyVercelSignature(body, 'deadbeef', secret)).toBe(false);
  });

  it('returns false for a missing signature', () => {
    const body = Buffer.from(jsonBatch);
    expect(verifyVercelSignature(body, undefined, secret)).toBe(false);
  });

  it('returns false when the body is tampered', () => {
    const signature = generateSignature(Buffer.from(jsonBatch), secret);
    const tampered = Buffer.from(jsonBatch.replace('200', '500'));
    expect(verifyVercelSignature(tampered, signature, secret)).toBe(false);
  });

  it('returns false for the wrong secret', () => {
    const body = Buffer.from(jsonBatch);
    const signature = generateSignature(body, secret);
    expect(verifyVercelSignature(body, signature, 'wrong_secret')).toBe(false);
  });
});

describe('parseLogs', () => {
  it('parses a JSON array batch', () => {
    const logs = parseLogs(Buffer.from(jsonBatch));
    expect(logs).toHaveLength(2);
    expect(logs[0].source).toBe('build');
    expect(logs[1].source).toBe('lambda');
  });

  it('parses an NDJSON batch', () => {
    const logs = parseLogs(Buffer.from(ndjsonBatch));
    expect(logs).toHaveLength(2);
    expect(logs[0].source).toBe('edge');
    expect(logs[1].source).toBe('firewall');
  });

  it('returns an empty array for an empty body', () => {
    expect(parseLogs(Buffer.from(''))).toEqual([]);
  });
});

describe('POST /webhooks/vercel-log-drains', () => {
  it('acknowledges the unsigned verification handshake with 200 and the verify header', async () => {
    const response = await request(app)
      .post('/webhooks/vercel-log-drains')
      .set('Content-Type', 'application/json')
      .send('');

    expect(response.status).toBe(200);
    expect(response.headers['x-vercel-verify']).toBe('test_verify_token');
    expect(response.body.handshake).toBe(true);
  });

  it('returns 403 for an invalid signature', async () => {
    const response = await request(app)
      .post('/webhooks/vercel-log-drains')
      .set('Content-Type', 'application/json')
      .set('x-vercel-signature', 'deadbeef')
      .send(jsonBatch);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('invalid_signature');
  });

  it('returns 200 and processes a valid JSON batch', async () => {
    const signature = generateSignature(Buffer.from(jsonBatch), secret);

    const response = await request(app)
      .post('/webhooks/vercel-log-drains')
      .set('Content-Type', 'application/json')
      .set('x-vercel-signature', signature)
      .send(jsonBatch);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, count: 2 });
  });

  it('returns 200 and processes a valid NDJSON batch', async () => {
    const signature = generateSignature(Buffer.from(ndjsonBatch), secret);

    const response = await request(app)
      .post('/webhooks/vercel-log-drains')
      .set('Content-Type', 'application/x-ndjson')
      .set('x-vercel-signature', signature)
      .send(ndjsonBatch);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, count: 2 });
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
