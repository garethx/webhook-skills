const request = require('supertest');

// Set test environment variables before importing app
process.env.MERAKI_WEBHOOK_SECRET = 'test_shared_secret';

const { app, verifyMerakiWebhook } = require('../src/index');

const SECRET = process.env.MERAKI_WEBHOOK_SECRET;

/**
 * Build a Meraki-style payload with the given shared secret and alert type.
 */
function buildPayload({ sharedSecret = SECRET, alertTypeId = 'motion_alert', alertType = 'Motion detected' } = {}) {
  return JSON.stringify({
    version: '0.1',
    sharedSecret,
    sentAt: '2026-07-23T18:04:20.123Z',
    occurredAt: '2026-07-23T18:02:53.000Z',
    organizationId: '2930418',
    organizationName: 'My Organization',
    networkId: 'N_24329156',
    networkName: 'Main Office',
    deviceSerial: 'Q234-ABCD-5678',
    alertId: '0000000000000000',
    alertType,
    alertTypeId,
    alertData: {},
  });
}

describe('verifyMerakiWebhook', () => {
  it('returns true when sharedSecret matches', () => {
    expect(verifyMerakiWebhook(buildPayload(), SECRET)).toBe(true);
  });

  it('returns false when sharedSecret does not match', () => {
    expect(verifyMerakiWebhook(buildPayload({ sharedSecret: 'wrong' }), SECRET)).toBe(false);
  });

  it('returns false when sharedSecret is missing', () => {
    const body = JSON.stringify({ alertTypeId: 'motion_alert' });
    expect(verifyMerakiWebhook(body, SECRET)).toBe(false);
  });

  it('returns false for non-JSON body', () => {
    expect(verifyMerakiWebhook('not json', SECRET)).toBe(false);
  });

  it('accepts and warns when no secret is configured (Meraki secret is optional)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const body = JSON.stringify({ alertTypeId: 'motion_alert' });
    expect(verifyMerakiWebhook(body, '')).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('POST /webhooks/meraki', () => {
  it('returns 401 when sharedSecret is missing', async () => {
    const response = await request(app)
      .post('/webhooks/meraki')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ alertTypeId: 'motion_alert' }));

    expect(response.status).toBe(401);
    expect(response.text).toBe('Missing or invalid sharedSecret in payload');
  });

  it('returns 401 when sharedSecret is wrong', async () => {
    const response = await request(app)
      .post('/webhooks/meraki')
      .set('Content-Type', 'application/json')
      .send(buildPayload({ sharedSecret: 'wrong' }));

    expect(response.status).toBe(401);
  });

  it('returns 200 for a valid motion_alert', async () => {
    const response = await request(app)
      .post('/webhooks/meraki')
      .set('Content-Type', 'application/json')
      .send(buildPayload({ alertTypeId: 'motion_alert', alertType: 'Motion detected' }));

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  it('handles settings_changed alert', async () => {
    const response = await request(app)
      .post('/webhooks/meraki')
      .set('Content-Type', 'application/json')
      .send(buildPayload({ alertTypeId: 'settings_changed', alertType: 'Settings changed' }));

    expect(response.status).toBe(200);
  });

  it('handles sensor_alert alert', async () => {
    const response = await request(app)
      .post('/webhooks/meraki')
      .set('Content-Type', 'application/json')
      .send(buildPayload({ alertTypeId: 'sensor_alert', alertType: 'Sensor change detected' }));

    expect(response.status).toBe(200);
  });

  it('handles stopped_reporting alert', async () => {
    const response = await request(app)
      .post('/webhooks/meraki')
      .set('Content-Type', 'application/json')
      .send(buildPayload({ alertTypeId: 'stopped_reporting', alertType: 'APs went down' }));

    expect(response.status).toBe(200);
  });

  it('returns 200 for an unhandled alert type with a valid secret', async () => {
    const response = await request(app)
      .post('/webhooks/meraki')
      .set('Content-Type', 'application/json')
      .send(buildPayload({ alertTypeId: 'some_new_alert', alertType: 'Something new' }));

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
