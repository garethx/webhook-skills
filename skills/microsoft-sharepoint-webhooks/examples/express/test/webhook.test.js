const request = require('supertest');

// Set test environment variables before importing app
process.env.SHAREPOINT_CLIENT_STATE = 'test-client-state-secret';

const app = require('../src/index');

const CLIENT_STATE = process.env.SHAREPOINT_CLIENT_STATE;

/**
 * Build a SharePoint notification batch payload.
 */
function buildNotification(clientState = CLIENT_STATE) {
  return JSON.stringify({
    value: [
      {
        subscriptionId: '91779246-afe9-4525-b122-6c199ae89211',
        clientState,
        expirationDateTime: '2016-04-30T17:27:00.0000000Z',
        resource: 'b9f6f714-9df8-470b-b22e-653855e1c181',
        tenantId: '00000000-0000-0000-0000-000000000000',
        siteUrl: '/',
        webId: 'dbc5a806-e4d4-46e5-951c-6344d70b62fa',
      },
    ],
  });
}

describe('Microsoft SharePoint Webhook Endpoint', () => {
  describe('Validation handshake', () => {
    it('should echo the validationtoken as text/plain with 200', async () => {
      const token = 'random-validation-token-123';
      const response = await request(app)
        .post('/webhooks/microsoft-sharepoint')
        .query({ validationtoken: token })
        .set('Content-Length', '0')
        .send();

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/plain/);
      expect(response.text).toBe(token);
    });

    it('should echo the token even when the body is empty', async () => {
      const token = 'another-token-456';
      const response = await request(app)
        .post('/webhooks/microsoft-sharepoint')
        .query({ validationtoken: token });

      expect(response.status).toBe(200);
      expect(response.text).toBe(token);
    });
  });

  describe('Notifications', () => {
    it('should return 200 for a valid clientState', async () => {
      const response = await request(app)
        .post('/webhooks/microsoft-sharepoint')
        .set('Content-Type', 'application/json')
        .send(buildNotification());

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should return 400 for a mismatched clientState', async () => {
      const response = await request(app)
        .post('/webhooks/microsoft-sharepoint')
        .set('Content-Type', 'application/json')
        .send(buildNotification('wrong-secret'));

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid clientState');
    });

    it('should return 400 for invalid JSON', async () => {
      const response = await request(app)
        .post('/webhooks/microsoft-sharepoint')
        .set('Content-Type', 'application/json')
        .send('not-json{');

      expect(response.status).toBe(400);
    });

    it('should handle a batch of multiple notifications', async () => {
      const payload = JSON.stringify({
        value: [
          {
            subscriptionId: 'sub-1',
            clientState: CLIENT_STATE,
            resource: 'list-guid-1',
            siteUrl: '/',
          },
          {
            subscriptionId: 'sub-2',
            clientState: CLIENT_STATE,
            resource: 'list-guid-2',
            siteUrl: '/sites/team',
          },
        ],
      });

      const response = await request(app)
        .post('/webhooks/microsoft-sharepoint')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should reject a batch where any notification has a bad clientState', async () => {
      const payload = JSON.stringify({
        value: [
          { subscriptionId: 'sub-1', clientState: CLIENT_STATE, resource: 'list-1' },
          { subscriptionId: 'sub-2', clientState: 'tampered', resource: 'list-2' },
        ],
      });

      const response = await request(app)
        .post('/webhooks/microsoft-sharepoint')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should accept an empty value array', async () => {
      const response = await request(app)
        .post('/webhooks/microsoft-sharepoint')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ value: [] }));

      expect(response.status).toBe(200);
    });
  });

  describe('Change type mapping', () => {
    it('should map GetChanges ChangeType values to list events', () => {
      expect(app.CHANGE_TYPES.Add).toBe('ItemAdded');
      expect(app.CHANGE_TYPES.Update).toBe('ItemUpdated');
      expect(app.CHANGE_TYPES.DeleteObject).toBe('ItemDeleted');
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
