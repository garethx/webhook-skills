const request = require('supertest');

// Set test environment variables before importing app
process.env.STRAVA_VERIFY_TOKEN = 'test_verify_token';
process.env.STRAVA_SUBSCRIPTION_ID = '120475';

const app = require('../src/index');

describe('Strava Webhook Endpoint', () => {
  describe('GET /webhooks/strava (subscription validation)', () => {
    it('should echo the challenge for a valid verify token', async () => {
      const response = await request(app)
        .get('/webhooks/strava')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'test_verify_token',
          'hub.challenge': 'abc123challenge',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ 'hub.challenge': 'abc123challenge' });
    });

    it('should return 403 for an invalid verify token', async () => {
      const response = await request(app)
        .get('/webhooks/strava')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token',
          'hub.challenge': 'abc123challenge',
        });

      expect(response.status).toBe(403);
    });

    it('should return 403 when hub.mode is not subscribe', async () => {
      const response = await request(app)
        .get('/webhooks/strava')
        .query({
          'hub.mode': 'unsubscribe',
          'hub.verify_token': 'test_verify_token',
          'hub.challenge': 'abc123challenge',
        });

      expect(response.status).toBe(403);
    });

    it('should return 403 when the verify token is missing', async () => {
      const response = await request(app)
        .get('/webhooks/strava')
        .query({ 'hub.mode': 'subscribe', 'hub.challenge': 'abc123challenge' });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /webhooks/strava (events)', () => {
    function event(overrides = {}) {
      return {
        object_type: 'activity',
        object_id: 1360128428,
        aspect_type: 'create',
        owner_id: 134815,
        subscription_id: 120475,
        event_time: 1516126040,
        updates: {},
        ...overrides,
      };
    }

    it('should return 200 for a valid activity create event', async () => {
      const response = await request(app)
        .post('/webhooks/strava')
        .set('Content-Type', 'application/json')
        .send(event());

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle all activity/athlete event combinations', async () => {
      const cases = [
        { object_type: 'activity', aspect_type: 'create' },
        { object_type: 'activity', aspect_type: 'update', updates: { title: 'New title' } },
        { object_type: 'activity', aspect_type: 'delete' },
        { object_type: 'athlete', aspect_type: 'update', updates: { authorized: 'false' } },
      ];

      for (const c of cases) {
        const response = await request(app)
          .post('/webhooks/strava')
          .set('Content-Type', 'application/json')
          .send(event(c));

        expect(response.status).toBe(200);
      }
    });

    it('should return 403 for an unknown subscription_id', async () => {
      const response = await request(app)
        .post('/webhooks/strava')
        .set('Content-Type', 'application/json')
        .send(event({ subscription_id: 999999 }));

      expect(response.status).toBe(403);
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
