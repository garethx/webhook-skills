const request = require('supertest');
const crypto = require('crypto');

process.env.PERSONA_WEBHOOK_SECRET = 'wbhsec_test_signing_secret_value';

const app = require('../src/index');
const { verifyPersonaSignature } = require('../src/index');

const SECRET = process.env.PERSONA_WEBHOOK_SECRET;

/**
 * Generate a valid Persona-Signature header for testing.
 *
 * Header format:  t=<unix_seconds>,v1=<hex_signature>
 * Signed content: `${t}.${raw_body}`
 * Algorithm:      HMAC-SHA256 keyed with the webhook secret, hex-encoded.
 */
function generatePersonaSignature(payload, secret, timestamp = null) {
  const t = timestamp == null ? Math.floor(Date.now() / 1000).toString() : String(timestamp);
  const v1 = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${payload}`)
    .digest('hex');
  return `t=${t},v1=${v1}`;
}

/** Build an envelope matching Persona's JSON:API webhook shape. */
function buildEvent(name, objectId = 'obj_1') {
  return JSON.stringify({
    data: {
      type: 'event',
      id: `evt_${name.replace(/[./]/g, '_')}`,
      attributes: {
        name,
        'created-at': '2026-07-22T00:00:00.000Z',
        payload: {
          data: { type: name.split(/[./]/)[0], id: objectId },
        },
      },
    },
  });
}

describe('verifyPersonaSignature', () => {
  it('accepts a valid signature', () => {
    const payload = buildEvent('inquiry.completed');
    const header = generatePersonaSignature(payload, SECRET);
    expect(verifyPersonaSignature(payload, header, SECRET)).toEqual({ valid: true });
  });

  it('accepts one matching pair during secret rotation (two space-separated pairs)', () => {
    const payload = buildEvent('inquiry.approved');
    const good = generatePersonaSignature(payload, SECRET);
    const stale = generatePersonaSignature(payload, 'wbhsec_old_rotated_out_secret');
    // Persona sends "<old> <new>"; we hold the new secret, so the second pair matches.
    expect(verifyPersonaSignature(payload, `${stale} ${good}`, SECRET)).toEqual({ valid: true });
  });

  it('rejects when the header is missing', () => {
    expect(verifyPersonaSignature('{}', undefined, SECRET)).toMatchObject({
      valid: false,
      error: expect.stringContaining('Missing'),
    });
  });

  it('rejects a malformed header', () => {
    expect(verifyPersonaSignature('{}', 'garbage', SECRET)).toMatchObject({
      valid: false,
      error: expect.stringContaining('Malformed'),
    });
  });

  it('rejects a tampered payload', () => {
    const original = buildEvent('inquiry.completed', 'inq_original');
    const header = generatePersonaSignature(original, SECRET);
    const tampered = buildEvent('inquiry.completed', 'inq_tampered');
    expect(verifyPersonaSignature(tampered, header, SECRET)).toMatchObject({
      valid: false,
      error: 'Invalid signature',
    });
  });
});

describe('POST /webhooks/persona', () => {
  it('returns 400 when the signature header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/persona')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(400);
    expect(res.text).toContain('Missing Persona-Signature header');
  });

  it('returns 400 for a malformed header', async () => {
    const res = await request(app)
      .post('/webhooks/persona')
      .set('Content-Type', 'application/json')
      .set('Persona-Signature', 'not-a-real-header')
      .send('{}');

    expect(res.status).toBe(400);
    expect(res.text).toContain('Malformed');
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = buildEvent('inquiry.completed');
    const header = `t=${Math.floor(Date.now() / 1000)},v1=deadbeef`;

    const res = await request(app)
      .post('/webhooks/persona')
      .set('Content-Type', 'application/json')
      .set('Persona-Signature', header)
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.text).toContain('Invalid signature');
  });

  it('returns 400 for a tampered payload', async () => {
    const original = buildEvent('inquiry.completed', 'inq_orig');
    const header = generatePersonaSignature(original, SECRET);
    const tampered = buildEvent('inquiry.completed', 'inq_TAMPERED');

    const res = await request(app)
      .post('/webhooks/persona')
      .set('Content-Type', 'application/json')
      .set('Persona-Signature', header)
      .send(tampered);

    expect(res.status).toBe(400);
    expect(res.text).toContain('Invalid signature');
  });

  it('returns 200 for a valid signature', async () => {
    const payload = buildEvent('inquiry.approved', 'inq_valid');
    const header = generatePersonaSignature(payload, SECRET);

    const res = await request(app)
      .post('/webhooks/persona')
      .set('Content-Type', 'application/json')
      .set('Persona-Signature', header)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('handles every documented event type', async () => {
    const eventTypes = [
      'inquiry.created',
      'inquiry.started',
      'inquiry.completed',
      'inquiry.approved',
      'inquiry.declined',
      'inquiry.marked-for-review',
      'inquiry.failed',
      'inquiry.expired',
      'verification.passed',
      'verification.failed',
      'account.created',
      'account.archived',
      'case.created',
      'case.resolved',
      'report/watchlist.ready',
      'unknown.event.type',
    ];

    for (const name of eventTypes) {
      const payload = buildEvent(name);
      const header = generatePersonaSignature(payload, SECRET);

      const res = await request(app)
        .post('/webhooks/persona')
        .set('Content-Type', 'application/json')
        .set('Persona-Signature', header)
        .send(payload);

      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
