const request = require('supertest');

// Set test environment variables before importing app
process.env.SHIPSTATION_WEBHOOK_SECRET = 'test_secret_token';
process.env.SHIPSTATION_API_KEY = 'test_api_key';
process.env.SHIPSTATION_API_SECRET = 'test_api_secret';

const app = require('../src/index');

const RESOURCE_URL = 'https://ssapi.shipstation.com/orders?importBatch=abc-123';

function body(resourceType, resourceUrl = RESOURCE_URL) {
  return { resource_url: resourceUrl, resource_type: resourceType };
}

describe('ShipStation Webhook Endpoint', () => {
  const token = process.env.SHIPSTATION_WEBHOOK_SECRET;

  beforeEach(() => {
    // Mock the authenticated resource fetch so tests never hit the network
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ orders: [{ orderId: 123 }] }),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  describe('POST /webhooks/shipstation', () => {
    it('should return 401 when token is missing', async () => {
      const res = await request(app)
        .post('/webhooks/shipstation')
        .set('Content-Type', 'application/json')
        .send(body('SHIP_NOTIFY'));

      expect(res.status).toBe(401);
    });

    it('should return 401 when token is wrong', async () => {
      const res = await request(app)
        .post('/webhooks/shipstation?token=nope')
        .set('Content-Type', 'application/json')
        .send(body('SHIP_NOTIFY'));

      expect(res.status).toBe(401);
    });

    it('should return 400 when resource fields are missing', async () => {
      const res = await request(app)
        .post(`/webhooks/shipstation?token=${token}`)
        .set('Content-Type', 'application/json')
        .send({ foo: 'bar' });

      expect(res.status).toBe(400);
    });

    it('should return 200 for a valid token and payload', async () => {
      const res = await request(app)
        .post(`/webhooks/shipstation?token=${token}`)
        .set('Content-Type', 'application/json')
        .send(body('ORDER_NOTIFY'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('should fetch resource_url with Basic auth', async () => {
      await request(app)
        .post(`/webhooks/shipstation?token=${token}`)
        .set('Content-Type', 'application/json')
        .send(body('SHIP_NOTIFY'));

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [calledUrl, opts] = global.fetch.mock.calls[0];
      expect(calledUrl).toBe(RESOURCE_URL);
      const expectedAuth =
        'Basic ' + Buffer.from('test_api_key:test_api_secret').toString('base64');
      expect(opts.headers.Authorization).toBe(expectedAuth);
    });

    it('should fetch a numbered ShipStation host (ssapi<N>.shipstation.com)', async () => {
      const numberedUrl = 'https://ssapi2.shipstation.com/orders?importBatch=abc-123';
      const res = await request(app)
        .post(`/webhooks/shipstation?token=${token}`)
        .set('Content-Type', 'application/json')
        .send(body('ORDER_NOTIFY', numberedUrl));

      expect(res.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch.mock.calls[0][0]).toBe(numberedUrl);
    });

    it('should still return 200 when the resource host is not ShipStation (SSRF guard)', async () => {
      const res = await request(app)
        .post(`/webhooks/shipstation?token=${token}`)
        .set('Content-Type', 'application/json')
        .send(body('SHIP_NOTIFY', 'https://evil.example.com/steal'));

      // Fetch is refused, but the webhook is still acknowledged
      expect(res.status).toBe(200);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle all six V1 event types', async () => {
      const events = [
        'ORDER_NOTIFY',
        'ITEM_ORDER_NOTIFY',
        'SHIP_NOTIFY',
        'ITEM_SHIP_NOTIFY',
        'FULFILLMENT_SHIPPED',
        'FULFILLMENT_REJECTED',
      ];

      for (const event of events) {
        const res = await request(app)
          .post(`/webhooks/shipstation?token=${token}`)
          .set('Content-Type', 'application/json')
          .send(body(event));

        expect(res.status).toBe(200);
      }
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
