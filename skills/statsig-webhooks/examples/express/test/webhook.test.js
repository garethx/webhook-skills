const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.STATSIG_WEBHOOK_SECRET = 'test_statsig_signing_secret';

const { app, verifyStatsigRequest } = require('../src/index');

const SIGNING_SECRET = process.env.STATSIG_WEBHOOK_SECRET;

/**
 * Generate a valid Statsig signature for testing.
 * Matches Statsig's algorithm: HMAC-SHA256("v0:{ts}:{body}", secret) hex-encoded.
 */
function generateStatsigSignature(body, timestamp, secret) {
  const basestring = `v0:${timestamp}:${body}`;
  const hex = crypto.createHmac('sha256', secret).update(basestring, 'utf8').digest('hex');
  return `v0=${hex}`;
}

// Statsig timestamps are in MILLISECONDS
function currentTimestamp() {
  return Date.now().toString();
}

describe('verifyStatsigRequest', () => {
  it('returns true for a valid signature', () => {
    const body = '{"data":[]}';
    const ts = currentTimestamp();
    const sig = generateStatsigSignature(body, ts, SIGNING_SECRET);

    expect(verifyStatsigRequest(body, sig, ts, SIGNING_SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const body = '{"data":[]}';
    const ts = currentTimestamp();

    expect(verifyStatsigRequest(body, 'v0=deadbeef', ts, SIGNING_SECRET)).toBe(false);
  });

  it('returns false when the signature header is missing', () => {
    const ts = currentTimestamp();
    expect(verifyStatsigRequest('{}', null, ts, SIGNING_SECRET)).toBe(false);
  });

  it('returns false when the timestamp header is missing', () => {
    const body = '{}';
    const sig = generateStatsigSignature(body, currentTimestamp(), SIGNING_SECRET);
    expect(verifyStatsigRequest(body, sig, null, SIGNING_SECRET)).toBe(false);
  });

  it('returns false when timestamp is more than 5 minutes old (replay protection)', () => {
    const body = '{}';
    const staleTs = (Date.now() - 6 * 60 * 1000).toString();
    const sig = generateStatsigSignature(body, staleTs, SIGNING_SECRET);

    expect(verifyStatsigRequest(body, sig, staleTs, SIGNING_SECRET)).toBe(false);
  });

  it('returns false when the body has been tampered with', () => {
    const original = '{"data":[{"metadata":{"action":"created"}}]}';
    const tampered = '{"data":[{"metadata":{"action":"updated"}}]}';
    const ts = currentTimestamp();
    const sig = generateStatsigSignature(original, ts, SIGNING_SECRET);

    expect(verifyStatsigRequest(tampered, sig, ts, SIGNING_SECRET)).toBe(false);
  });

  it('returns false when the signing secret is wrong', () => {
    const body = '{}';
    const ts = currentTimestamp();
    const sig = generateStatsigSignature(body, ts, SIGNING_SECRET);

    expect(verifyStatsigRequest(body, sig, ts, 'wrong_secret')).toBe(false);
  });

  it('returns false for a non-numeric timestamp', () => {
    const body = '{}';
    const sig = generateStatsigSignature(body, '123', SIGNING_SECRET);
    expect(verifyStatsigRequest(body, sig, 'not-a-number', SIGNING_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/statsig', () => {
  it('returns 401 when signature header is missing', async () => {
    const body = JSON.stringify({ data: [] });

    const res = await request(app)
      .post('/webhooks/statsig')
      .set('Content-Type', 'application/json')
      .set('X-Statsig-Request-Timestamp', currentTimestamp())
      .send(body);

    expect(res.status).toBe(401);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 401 when signature is invalid', async () => {
    const body = JSON.stringify({ data: [] });
    const ts = currentTimestamp();

    const res = await request(app)
      .post('/webhooks/statsig')
      .set('Content-Type', 'application/json')
      .set('X-Statsig-Signature', 'v0=invalid')
      .set('X-Statsig-Request-Timestamp', ts)
      .send(body);

    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid config-change batch', async () => {
    const body = JSON.stringify({
      data: [
        {
          eventName: 'statsig::config_change',
          timestamp: 1671672194836,
          metadata: {
            type: 'Feature Gate',
            name: 'my_feature_gate',
            description: 'Enabled the gate for the beta segment',
            action: 'updated'
          }
        }
      ]
    });
    const ts = currentTimestamp();
    const sig = generateStatsigSignature(body, ts, SIGNING_SECRET);

    const res = await request(app)
      .post('/webhooks/statsig')
      .set('Content-Type', 'application/json')
      .set('X-Statsig-Signature', sig)
      .set('X-Statsig-Request-Timestamp', ts)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('returns 200 for a valid exposure array batch', async () => {
    const body = JSON.stringify([
      {
        eventName: 'statsig::gate_exposure',
        user: { userID: 'user-123' },
        timestamp: 1671672194836,
        metadata: { gate: 'my_feature_gate', gateValue: 'true' }
      }
    ]);
    const ts = currentTimestamp();
    const sig = generateStatsigSignature(body, ts, SIGNING_SECRET);

    const res = await request(app)
      .post('/webhooks/statsig')
      .set('Content-Type', 'application/json')
      .set('X-Statsig-Signature', sig)
      .set('X-Statsig-Request-Timestamp', ts)
      .send(body);

    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const body = 'not valid json';
    const ts = currentTimestamp();
    const sig = generateStatsigSignature(body, ts, SIGNING_SECRET);

    const res = await request(app)
      .post('/webhooks/statsig')
      .set('Content-Type', 'application/json')
      .set('X-Statsig-Signature', sig)
      .set('X-Statsig-Request-Timestamp', ts)
      .send(body);

    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
