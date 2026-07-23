const request = require('supertest');

// Set test environment variables before importing app
process.env.MICROSOFT_GRAPH_CLIENT_STATE = 'test-client-state-secret';

const { app, verifyClientState } = require('../src/index');

const CLIENT_STATE = process.env.MICROSOFT_GRAPH_CLIENT_STATE;

function changeNotification(overrides = {}) {
  return {
    value: [
      {
        subscriptionId: 'sub-123',
        subscriptionExpirationDateTime: '2026-07-22T22:11:09.952Z',
        changeType: 'updated',
        resource: 'Users/user-1/messages/msg-1',
        clientState: CLIENT_STATE,
        tenantId: 'tenant-1',
        resourceData: {
          '@odata.type': '#Microsoft.Graph.Message',
          '@odata.id': 'Users/user-1/Messages/msg-1',
          id: 'msg-1',
        },
        ...overrides,
      },
    ],
  };
}

describe('verifyClientState', () => {
  it('returns true when clientState matches', () => {
    expect(verifyClientState(CLIENT_STATE, CLIENT_STATE)).toBe(true);
  });

  it('returns false when clientState does not match', () => {
    expect(verifyClientState('wrong', CLIENT_STATE)).toBe(false);
  });

  it('returns false when received clientState is missing', () => {
    expect(verifyClientState(undefined, CLIENT_STATE)).toBe(false);
  });

  it('returns false when expected clientState is missing', () => {
    expect(verifyClientState(CLIENT_STATE, undefined)).toBe(false);
  });

  it('returns false for different-length values (no throw)', () => {
    expect(verifyClientState('short', 'a-much-longer-secret-value')).toBe(false);
  });
});

describe('POST /webhooks/microsoft-graph — validation handshake', () => {
  it('echoes the URL-decoded validationToken as text/plain 200', async () => {
    const token = 'Validation: Testing client-side notifications endpoint';

    const res = await request(app)
      .post('/webhooks/microsoft-graph')
      .query({ validationToken: token })
      .send();

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toBe(token);
  });
});

describe('POST /webhooks/microsoft-graph — change notifications', () => {
  it('returns 202 for a valid updated notification', async () => {
    const res = await request(app)
      .post('/webhooks/microsoft-graph')
      .set('Content-Type', 'application/json')
      .send(changeNotification({ changeType: 'updated' }));

    expect(res.status).toBe(202);
  });

  it('returns 202 for a valid created notification', async () => {
    const res = await request(app)
      .post('/webhooks/microsoft-graph')
      .set('Content-Type', 'application/json')
      .send(changeNotification({ changeType: 'created' }));

    expect(res.status).toBe(202);
  });

  it('returns 202 for a valid deleted notification', async () => {
    const res = await request(app)
      .post('/webhooks/microsoft-graph')
      .set('Content-Type', 'application/json')
      .send(changeNotification({ changeType: 'deleted' }));

    expect(res.status).toBe(202);
  });

  it('returns 400 when clientState does not match', async () => {
    const res = await request(app)
      .post('/webhooks/microsoft-graph')
      .set('Content-Type', 'application/json')
      .send(changeNotification({ clientState: 'attacker-supplied' }));

    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid clientState');
  });

  it('returns 400 when clientState is missing', async () => {
    const res = await request(app)
      .post('/webhooks/microsoft-graph')
      .set('Content-Type', 'application/json')
      .send(changeNotification({ clientState: undefined }));

    expect(res.status).toBe(400);
  });

  it('returns 202 for an empty value array', async () => {
    const res = await request(app)
      .post('/webhooks/microsoft-graph')
      .set('Content-Type', 'application/json')
      .send({ value: [] });

    expect(res.status).toBe(202);
  });
});

describe('POST /webhooks/microsoft-graph — lifecycle events', () => {
  it('returns 202 for a reauthorizationRequired lifecycle event', async () => {
    const res = await request(app)
      .post('/webhooks/microsoft-graph')
      .set('Content-Type', 'application/json')
      .send({
        value: [
          {
            subscriptionId: 'sub-123',
            subscriptionExpirationDateTime: '2026-07-22T22:11:09.952Z',
            clientState: CLIENT_STATE,
            tenantId: 'tenant-1',
            lifecycleEvent: 'reauthorizationRequired',
          },
        ],
      });

    expect(res.status).toBe(202);
  });

  it('returns 202 for a missed lifecycle event', async () => {
    const res = await request(app)
      .post('/webhooks/microsoft-graph')
      .set('Content-Type', 'application/json')
      .send({
        value: [
          {
            subscriptionId: 'sub-123',
            clientState: CLIENT_STATE,
            lifecycleEvent: 'missed',
          },
        ],
      });

    expect(res.status).toBe(202);
  });

  it('returns 400 when a lifecycle event has an invalid clientState', async () => {
    const res = await request(app)
      .post('/webhooks/microsoft-graph')
      .set('Content-Type', 'application/json')
      .send({
        value: [
          {
            subscriptionId: 'sub-123',
            clientState: 'wrong',
            lifecycleEvent: 'subscriptionRemoved',
          },
        ],
      });

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
