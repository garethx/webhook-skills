const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.OURA_CLIENT_SECRET = 'test_client_secret';
process.env.OURA_VERIFICATION_TOKEN = 'test_verification_token';

const { app, verifyOuraSignature } = require('../src/index');

/**
 * Generate a valid Oura signature for testing.
 * HMAC-SHA256 over (timestamp + rawBody), hex, UPPERCASE.
 */
function generateOuraSignature(rawBody, timestamp, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(timestamp + rawBody)
    .digest('hex')
    .toUpperCase();
}

describe('verifyOuraSignature', () => {
  const secret = process.env.OURA_CLIENT_SECRET;
  const timestamp = '1700000000';

  it('returns true for a valid signature', () => {
    const body = JSON.stringify({ event_type: 'update', data_type: 'sleep' });
    const signature = generateOuraSignature(body, timestamp, secret);

    expect(verifyOuraSignature(body, signature, timestamp, secret)).toBe(true);
  });

  it('returns an UPPERCASE hex digest (matches Oura)', () => {
    const body = '{"data_type":"sleep"}';
    const signature = generateOuraSignature(body, timestamp, secret);

    expect(signature).toMatch(/^[A-F0-9]{64}$/);
  });

  it('returns false for an invalid signature', () => {
    const body = '{"data_type":"sleep"}';

    expect(verifyOuraSignature(body, 'INVALID', timestamp, secret)).toBe(false);
  });

  it('returns false for a missing signature', () => {
    const body = '{"data_type":"sleep"}';

    expect(verifyOuraSignature(body, undefined, timestamp, secret)).toBe(false);
  });

  it('returns false for a missing timestamp', () => {
    const body = '{"data_type":"sleep"}';
    const signature = generateOuraSignature(body, timestamp, secret);

    expect(verifyOuraSignature(body, signature, undefined, secret)).toBe(false);
  });

  it('returns false when the body is tampered', () => {
    const original = JSON.stringify({ data_type: 'sleep', object_id: '1' });
    const signature = generateOuraSignature(original, timestamp, secret);
    const tampered = JSON.stringify({ data_type: 'sleep', object_id: '999' });

    expect(verifyOuraSignature(tampered, signature, timestamp, secret)).toBe(false);
  });

  it('returns false when the timestamp is tampered', () => {
    const body = '{"data_type":"sleep"}';
    const signature = generateOuraSignature(body, timestamp, secret);

    expect(verifyOuraSignature(body, signature, '1700009999', secret)).toBe(false);
  });

  it('returns false for the wrong secret', () => {
    const body = '{"data_type":"sleep"}';
    const signature = generateOuraSignature(body, timestamp, secret);

    expect(verifyOuraSignature(body, signature, timestamp, 'wrong_secret')).toBe(false);
  });
});

describe('GET /webhooks/oura (handshake)', () => {
  it('echoes the challenge for a valid verification_token', async () => {
    const response = await request(app)
      .get('/webhooks/oura')
      .query({ verification_token: 'test_verification_token', challenge: 'abc123' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ challenge: 'abc123' });
  });

  it('returns 401 for an invalid verification_token', async () => {
    const response = await request(app)
      .get('/webhooks/oura')
      .query({ verification_token: 'wrong', challenge: 'abc123' });

    expect(response.status).toBe(401);
  });

  it('returns 401 when verification_token is missing', async () => {
    const response = await request(app)
      .get('/webhooks/oura')
      .query({ challenge: 'abc123' });

    expect(response.status).toBe(401);
  });
});

describe('POST /webhooks/oura (events)', () => {
  const secret = process.env.OURA_CLIENT_SECRET;
  const timestamp = '1700000000';

  function post(body, signature, ts = timestamp) {
    const req = request(app)
      .post('/webhooks/oura')
      .set('Content-Type', 'application/json');
    if (signature !== null) req.set('x-oura-signature', signature);
    if (ts !== null) req.set('x-oura-timestamp', ts);
    return req.send(body);
  }

  it('returns 200 for a valid signature', async () => {
    const body = JSON.stringify({
      event_type: 'update',
      data_type: 'sleep',
      object_id: '12345abc',
      event_time: '2023-01-01T08:00:00+00:00',
      user_id: 'user123',
    });
    const signature = generateOuraSignature(body, timestamp, secret);

    const response = await post(body, signature);

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  it('returns 401 for an invalid signature', async () => {
    const body = JSON.stringify({ event_type: 'update', data_type: 'sleep' });

    const response = await post(body, 'INVALID');

    expect(response.status).toBe(401);
  });

  it('returns 401 for a missing signature', async () => {
    const body = JSON.stringify({ event_type: 'update', data_type: 'sleep' });

    const response = await post(body, null);

    expect(response.status).toBe(401);
  });

  it('handles a daily_readiness event', async () => {
    const body = JSON.stringify({
      event_type: 'create',
      data_type: 'daily_readiness',
      object_id: 'r1',
      event_time: '2023-01-01T08:00:00+00:00',
      user_id: 'user123',
    });
    const signature = generateOuraSignature(body, timestamp, secret);

    const response = await post(body, signature);

    expect(response.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
