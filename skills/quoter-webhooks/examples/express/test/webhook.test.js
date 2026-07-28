const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.QUOTER_HASH_KEY = 'test_hash_key';

const app = require('../src/index');

const HASH_KEY = process.env.QUOTER_HASH_KEY;

/**
 * Build a Quoter form body (hash, timestamp, data) for testing.
 * Quoter computes hash = md5(HASH_KEY + timestamp + data).
 */
function buildQuoterBody(data, { hashKey = HASH_KEY, timestamp } = {}) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000).toString();
  const hash = crypto.createHash('md5').update(hashKey + ts + data).digest('hex');
  return { hash, timestamp: ts, data };
}

describe('Quoter Webhook Endpoint', () => {
  const validData = JSON.stringify({ id: 'quot_123', status: 'accepted' });

  describe('POST /webhooks/quoter', () => {
    it('should return 400 when fields are missing', async () => {
      const response = await request(app)
        .post('/webhooks/quoter')
        .type('form')
        .send({ data: '{}' }); // no hash / timestamp

      expect(response.status).toBe(400);
    });

    it('should return 400 for an invalid hash', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const response = await request(app)
        .post('/webhooks/quoter')
        .type('form')
        .send({ hash: 'deadbeef', timestamp, data: validData });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid signature');
    });

    it('should return 400 for a tampered payload', async () => {
      const { hash, timestamp } = buildQuoterBody(validData);
      const tampered = JSON.stringify({ id: 'quot_123', status: 'ordered' });

      const response = await request(app)
        .post('/webhooks/quoter')
        .type('form')
        .send({ hash, timestamp, data: tampered });

      expect(response.status).toBe(400);
    });

    it('should return 400 for a stale timestamp', async () => {
      const oldTs = (Math.floor(Date.now() / 1000) - 400).toString();
      const body = buildQuoterBody(validData, { timestamp: oldTs });

      const response = await request(app)
        .post('/webhooks/quoter')
        .type('form')
        .send(body);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid event', async () => {
      const body = buildQuoterBody(validData);

      const response = await request(app)
        .post('/webhooks/quoter?object=quote')
        .type('form')
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle the different object types', async () => {
      for (const object of ['quote', 'person', 'payment']) {
        const data = JSON.stringify({ id: `${object}_1` });
        const body = buildQuoterBody(data);

        const response = await request(app)
          .post(`/webhooks/quoter?object=${object}`)
          .type('form')
          .send(body);

        expect(response.status).toBe(200);
      }
    });

    it('should return 400 for invalid JSON in the data field', async () => {
      const body = buildQuoterBody('not-json');

      const response = await request(app)
        .post('/webhooks/quoter?object=quote')
        .type('form')
        .send(body);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
