const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app.
process.env.TALLY_SIGNING_SECRET = 'test_tally_signing_secret';

const { app, verifyTallyWebhook, getAnswer } = require('../src/index');

const signingSecret = process.env.TALLY_SIGNING_SECRET;

/** Generate a valid Tally signature: base64(HMAC-SHA256(secret, rawBody)). */
function generateTallySignature(rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
}

function samplePayload() {
  return JSON.stringify({
    eventId: 'evt_123',
    eventType: 'FORM_RESPONSE',
    createdAt: '2024-01-01T00:00:00.000Z',
    data: {
      responseId: 'resp_1',
      submissionId: 'sub_1',
      respondentId: 'rsp_1',
      formId: 'wMKq5R',
      formName: 'Contact form',
      fields: [
        { key: 'q1', label: 'Email', type: 'INPUT_EMAIL', value: 'ada@example.com' },
      ],
    },
  });
}

describe('verifyTallyWebhook', () => {
  it('returns true for a valid signature', () => {
    const body = samplePayload();
    const signature = generateTallySignature(body, signingSecret);
    expect(verifyTallyWebhook(body, signature, signingSecret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const body = samplePayload();
    expect(verifyTallyWebhook(body, 'invalid', signingSecret)).toBe(false);
  });

  it('returns false for a missing signature', () => {
    const body = samplePayload();
    expect(verifyTallyWebhook(body, undefined, signingSecret)).toBe(false);
  });

  it('returns false when the payload is tampered', () => {
    const body = samplePayload();
    const signature = generateTallySignature(body, signingSecret);
    const tampered = samplePayload().replace('ada@example.com', 'evil@example.com');
    expect(verifyTallyWebhook(tampered, signature, signingSecret)).toBe(false);
  });

  it('returns false with the wrong secret', () => {
    const body = samplePayload();
    const signature = generateTallySignature(body, signingSecret);
    expect(verifyTallyWebhook(body, signature, 'wrong_secret')).toBe(false);
  });
});

describe('getAnswer', () => {
  it('looks up a field value by label', () => {
    const fields = [
      { label: 'Email', value: 'ada@example.com' },
      { label: 'Name', value: 'Ada' },
    ];
    expect(getAnswer(fields, 'Email')).toBe('ada@example.com');
    expect(getAnswer(fields, 'Missing')).toBeUndefined();
  });
});

describe('POST /webhooks/tally (signing secret configured)', () => {
  it('returns 400 for a missing signature', async () => {
    const response = await request(app)
      .post('/webhooks/tally')
      .set('Content-Type', 'application/json')
      .send(samplePayload());

    expect(response.status).toBe(400);
    expect(response.text).toBe('Invalid signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const response = await request(app)
      .post('/webhooks/tally')
      .set('Content-Type', 'application/json')
      .set('Tally-Signature', 'invalid_signature')
      .send(samplePayload());

    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const body = samplePayload();
    const signature = generateTallySignature(body, signingSecret);

    const response = await request(app)
      .post('/webhooks/tally')
      .set('Content-Type', 'application/json')
      .set('Tally-Signature', signature)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  it('handles the FORM_RESPONSE event', async () => {
    const body = samplePayload();
    const signature = generateTallySignature(body, signingSecret);

    const response = await request(app)
      .post('/webhooks/tally')
      .set('Content-Type', 'application/json')
      .set('Tally-Signature', signature)
      .send(body);

    expect(response.status).toBe(200);
  });
});

describe('POST /webhooks/tally (no signing secret configured)', () => {
  const original = process.env.TALLY_SIGNING_SECRET;

  beforeAll(() => {
    delete process.env.TALLY_SIGNING_SECRET;
  });

  afterAll(() => {
    process.env.TALLY_SIGNING_SECRET = original;
  });

  it('processes unsigned requests with a 200', async () => {
    const response = await request(app)
      .post('/webhooks/tally')
      .set('Content-Type', 'application/json')
      .send(samplePayload());

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
