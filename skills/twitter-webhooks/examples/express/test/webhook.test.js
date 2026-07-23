const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.TWITTER_CONSUMER_SECRET = 'test_consumer_secret';

const { app, buildSignature, verifyTwitterSignature } = require('../src/index');

const CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET;

/**
 * Generate a valid X signature for testing.
 * Matches X's algorithm: sha256= + base64(HMAC-SHA256(secret, message)).
 */
function generateSignature(message, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(message).digest('base64');
}

describe('verifyTwitterSignature', () => {
  it('returns true for a valid signature', () => {
    const body = '{"for_user_id":"123","follow_events":[]}';
    const sig = generateSignature(body, CONSUMER_SECRET);
    expect(verifyTwitterSignature(body, sig, CONSUMER_SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const body = '{"for_user_id":"123"}';
    expect(verifyTwitterSignature(body, 'sha256=deadbeef', CONSUMER_SECRET)).toBe(false);
  });

  it('returns false when the signature header is missing', () => {
    expect(verifyTwitterSignature('{}', undefined, CONSUMER_SECRET)).toBe(false);
  });

  it('returns false when the body has been tampered with', () => {
    const original = '{"follow_events":[{"type":"follow"}]}';
    const tampered = '{"follow_events":[{"type":"unfollow"}]}';
    const sig = generateSignature(original, CONSUMER_SECRET);
    expect(verifyTwitterSignature(tampered, sig, CONSUMER_SECRET)).toBe(false);
  });

  it('returns false when the consumer secret is wrong', () => {
    const body = '{}';
    const sig = generateSignature(body, CONSUMER_SECRET);
    expect(verifyTwitterSignature(body, sig, 'wrong_secret')).toBe(false);
  });
});

describe('buildSignature', () => {
  it('produces a sha256= prefixed base64 value', () => {
    const sig = buildSignature('crc_token_value', CONSUMER_SECRET);
    expect(sig).toMatch(/^sha256=[A-Za-z0-9+/]+=*$/);
  });

  it('matches the documented CRC computation', () => {
    const crcToken = 'abc123';
    const expected = 'sha256=' + crypto
      .createHmac('sha256', CONSUMER_SECRET)
      .update(crcToken)
      .digest('base64');
    expect(buildSignature(crcToken, CONSUMER_SECRET)).toBe(expected);
  });
});

describe('GET /webhooks/twitter (CRC)', () => {
  it('returns the response_token for a valid crc_token', async () => {
    const crcToken = 'crc_challenge_token';
    const res = await request(app)
      .get('/webhooks/twitter')
      .query({ crc_token: crcToken });

    expect(res.status).toBe(200);
    expect(res.body.response_token).toBe(generateSignature(crcToken, CONSUMER_SECRET));
  });

  it('returns 400 when crc_token is missing', async () => {
    const res = await request(app).get('/webhooks/twitter');
    expect(res.status).toBe(400);
  });
});

describe('POST /webhooks/twitter', () => {
  it('returns 400 when the signature header is missing', async () => {
    const body = JSON.stringify({ for_user_id: '123' });
    const res = await request(app)
      .post('/webhooks/twitter')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 when the signature is invalid', async () => {
    const body = JSON.stringify({ for_user_id: '123' });
    const res = await request(app)
      .post('/webhooks/twitter')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', 'sha256=invalid')
      .send(body);

    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid tweet_create_events delivery', async () => {
    const body = JSON.stringify({
      for_user_id: '3198576760',
      tweet_create_events: [{ id_str: '1', text: 'hello' }],
    });
    const sig = generateSignature(body, CONSUMER_SECRET);

    const res = await request(app)
      .post('/webhooks/twitter')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('returns 200 for a valid follow_events delivery', async () => {
    const body = JSON.stringify({
      for_user_id: '3198576760',
      follow_events: [{
        type: 'follow',
        source: { id: '44196397' },
        target: { id: '3198576760' },
      }],
    });
    const sig = generateSignature(body, CONSUMER_SECRET);

    const res = await request(app)
      .post('/webhooks/twitter')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', sig)
      .send(body);

    expect(res.status).toBe(200);
  });

  it('returns 200 for a valid direct_message_events delivery', async () => {
    const body = JSON.stringify({
      for_user_id: '3198576760',
      direct_message_events: [{ type: 'message_create' }],
    });
    const sig = generateSignature(body, CONSUMER_SECRET);

    const res = await request(app)
      .post('/webhooks/twitter')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', sig)
      .send(body);

    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
