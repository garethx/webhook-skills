const request = require('supertest');

// Set test environment variables before importing app
process.env.PIPEDRIVE_WEBHOOK_USER = 'test-user';
process.env.PIPEDRIVE_WEBHOOK_PASSWORD = 'test-password';

const app = require('../src/index');

/**
 * Build an HTTP Basic Auth header, exactly as Pipedrive sends it:
 * "Basic " + base64("user:password").
 */
function basicAuth(user, password) {
  return 'Basic ' + Buffer.from(`${user}:${password}`, 'utf8').toString('base64');
}

const validAuth = basicAuth('test-user', 'test-password');

function payload(action, entity, overrides = {}) {
  return {
    meta: {
      action,
      entity,
      entity_id: '123',
      correlation_id: 'corr-abc',
      version: '2.0',
    },
    data: { id: 123, title: 'Test deal' },
    previous: null,
    ...overrides,
  };
}

describe('Pipedrive Webhook Endpoint', () => {
  describe('POST /webhooks/pipedrive', () => {
    it('returns 401 when the Authorization header is missing', async () => {
      const res = await request(app)
        .post('/webhooks/pipedrive')
        .set('Content-Type', 'application/json')
        .send(payload('create', 'deal'));

      expect(res.status).toBe(401);
    });

    it('returns 401 for wrong credentials', async () => {
      const res = await request(app)
        .post('/webhooks/pipedrive')
        .set('Authorization', basicAuth('test-user', 'wrong-password'))
        .set('Content-Type', 'application/json')
        .send(payload('create', 'deal'));

      expect(res.status).toBe(401);
    });

    it('returns 401 for a malformed Authorization header', async () => {
      const res = await request(app)
        .post('/webhooks/pipedrive')
        .set('Authorization', 'Bearer some-token')
        .set('Content-Type', 'application/json')
        .send(payload('create', 'deal'));

      expect(res.status).toBe(401);
    });

    it('returns 400 for a valid credential but invalid payload', async () => {
      const res = await request(app)
        .post('/webhooks/pipedrive')
        .set('Authorization', validAuth)
        .set('Content-Type', 'application/json')
        .send({ not: 'a webhook' });

      expect(res.status).toBe(400);
    });

    it('returns 200 for a valid delivery', async () => {
      const res = await request(app)
        .post('/webhooks/pipedrive')
        .set('Authorization', validAuth)
        .set('Content-Type', 'application/json')
        .send(payload('create', 'deal'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('handles the documented event types', async () => {
      const events = [
        ['create', 'deal'],
        ['change', 'deal'],
        ['delete', 'deal'],
        ['change', 'person'],
        ['create', 'activity'],
        ['change', 'organization'], // unhandled -> still 200
      ];

      for (const [action, entity] of events) {
        const res = await request(app)
          .post('/webhooks/pipedrive')
          .set('Authorization', validAuth)
          .set('Content-Type', 'application/json')
          .send(payload(action, entity));

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
});
