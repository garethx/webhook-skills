import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { verifyVercelSignature, parseLogs, POST } from '../app/webhooks/vercel-log-drains/route';

const secret = 'test_drain_secret';
const verifyToken = 'test_verify_token';

beforeAll(() => {
  process.env.VERCEL_LOG_DRAIN_SECRET = secret;
  process.env.VERCEL_VERIFY = verifyToken;
});

/** Generate a valid Vercel log drain signature (HMAC-SHA1 hex, no prefix). */
function generateSignature(payload: string, secretKey: string): string {
  return crypto.createHmac('sha1', secretKey).update(payload).digest('hex');
}

const jsonBatch = JSON.stringify([
  { id: '1', source: 'build', level: 'info', message: 'Build completed', buildId: 'bld_1', timestamp: 1 },
  { id: '2', source: 'lambda', level: 'info', message: 'API request', statusCode: 200, path: '/api/users', timestamp: 2 },
]);

const ndjsonBatch =
  '{"id":"a","source":"edge","level":"info","message":"edge log","timestamp":1}\n' +
  '{"id":"b","source":"firewall","level":"warning","path":"/admin","proxy":{"wafAction":"deny","clientIp":"1.2.3.4"}}';

function makeRequest(body: string, signature?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature !== undefined) {
    headers['x-vercel-signature'] = signature;
  }
  return new Request('http://localhost/webhooks/vercel-log-drains', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyVercelSignature', () => {
  it('validates a correct signature', () => {
    const signature = generateSignature(jsonBatch, secret);
    expect(verifyVercelSignature(jsonBatch, signature, secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyVercelSignature(jsonBatch, 'deadbeef', secret)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyVercelSignature(jsonBatch, null, secret)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const signature = generateSignature(jsonBatch, secret);
    const tampered = jsonBatch.replace('200', '500');
    expect(verifyVercelSignature(tampered, signature, secret)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const signature = generateSignature(jsonBatch, secret);
    expect(verifyVercelSignature(jsonBatch, signature, 'wrong_secret')).toBe(false);
  });
});

describe('parseLogs', () => {
  it('parses a JSON array batch', () => {
    const logs = parseLogs(jsonBatch);
    expect(logs).toHaveLength(2);
    expect(logs[0].source).toBe('build');
    expect(logs[1].source).toBe('lambda');
  });

  it('parses an NDJSON batch', () => {
    const logs = parseLogs(ndjsonBatch);
    expect(logs).toHaveLength(2);
    expect(logs[0].source).toBe('edge');
    expect(logs[1].source).toBe('firewall');
  });

  it('returns an empty array for an empty body', () => {
    expect(parseLogs('')).toEqual([]);
  });
});

describe('POST /webhooks/vercel-log-drains', () => {
  it('acknowledges the unsigned handshake with 200 and the verify header', async () => {
    const response = await POST(makeRequest(''));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-vercel-verify')).toBe(verifyToken);
    expect(await response.json()).toEqual({ received: true, handshake: true });
  });

  it('returns 403 for an invalid signature', async () => {
    const response = await POST(makeRequest(jsonBatch, 'deadbeef'));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'invalid_signature' });
  });

  it('returns 200 and processes a valid JSON batch', async () => {
    const signature = generateSignature(jsonBatch, secret);
    const response = await POST(makeRequest(jsonBatch, signature));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, count: 2 });
  });

  it('returns 200 and processes a valid NDJSON batch', async () => {
    const signature = generateSignature(ndjsonBatch, secret);
    const response = await POST(makeRequest(ndjsonBatch, signature));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, count: 2 });
  });
});
