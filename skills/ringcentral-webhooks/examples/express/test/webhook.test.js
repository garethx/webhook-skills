const request = require('supertest');

// Set test environment variables before importing app
process.env.RINGCENTRAL_VERIFICATION_TOKEN = 'test_verification_token';

const { app, tokenMatches, eventCategory } = require('../src/index');

const EXPECTED_TOKEN = process.env.RINGCENTRAL_VERIFICATION_TOKEN;

describe('RingCentral Webhook Endpoint', () => {
  describe('tokenMatches', () => {
    it('should return true for matching token', () => {
      expect(tokenMatches(EXPECTED_TOKEN, EXPECTED_TOKEN)).toBe(true);
    });

    it('should return false for a different token', () => {
      expect(tokenMatches('wrong_token', EXPECTED_TOKEN)).toBe(false);
    });

    it('should return false for a missing token', () => {
      expect(tokenMatches(null, EXPECTED_TOKEN)).toBe(false);
    });

    it('should return false for different-length tokens', () => {
      expect(tokenMatches('short', 'a_much_longer_token')).toBe(false);
    });
  });

  describe('eventCategory', () => {
    it('classifies instant messages', () => {
      expect(
        eventCategory('/restapi/v1.0/account/1/extension/2/message-store/instant?type=SMS')
      ).toBe('instant-message');
    });

    it('classifies message-store events', () => {
      expect(
        eventCategory('/restapi/v1.0/account/1/extension/2/message-store')
      ).toBe('message-store');
    });

    it('classifies presence events', () => {
      expect(
        eventCategory('/restapi/v1.0/account/1/extension/2/presence')
      ).toBe('presence');
    });

    it('classifies telephony session events', () => {
      expect(
        eventCategory('/restapi/v1.0/account/1/telephony/sessions')
      ).toBe('telephony-session');
    });

    it('classifies extension events', () => {
      expect(eventCategory('/restapi/v1.0/account/1/extension')).toBe('extension');
    });

    it('returns unknown for empty filter', () => {
      expect(eventCategory('')).toBe('unknown');
    });
  });

  describe('POST /webhooks/ringcentral — Validation-Token handshake', () => {
    it('echoes the Validation-Token and returns 200', async () => {
      const response = await request(app)
        .post('/webhooks/ringcentral')
        .set('Validation-Token', 'handshake-token-abc')
        .send('');

      expect(response.status).toBe(200);
      expect(response.headers['validation-token']).toBe('handshake-token-abc');
    });

    it('completes the handshake even without a verification token', async () => {
      const response = await request(app)
        .post('/webhooks/ringcentral')
        .set('Validation-Token', 'handshake-token-xyz')
        .send({ anything: true });

      expect(response.status).toBe(200);
      expect(response.headers['validation-token']).toBe('handshake-token-xyz');
    });
  });

  describe('POST /webhooks/ringcentral — notifications', () => {
    const notification = {
      uuid: 'a7c1f0e2-1234',
      event: '/restapi/v1.0/account/111/extension/222/message-store',
      timestamp: '2024-01-15T10:00:00.000Z',
      subscriptionId: 'sub-1',
      ownerId: '222',
      body: { changes: [{ type: 'SMS', newCount: 1 }] },
    };

    it('returns 200 for a valid Verification-Token', async () => {
      const response = await request(app)
        .post('/webhooks/ringcentral')
        .set('Verification-Token', EXPECTED_TOKEN)
        .send(notification);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });

    it('returns 401 for an invalid Verification-Token', async () => {
      const response = await request(app)
        .post('/webhooks/ringcentral')
        .set('Verification-Token', 'wrong_token')
        .send(notification);

      expect(response.status).toBe(401);
    });

    it('returns 401 for a missing Verification-Token', async () => {
      const response = await request(app)
        .post('/webhooks/ringcentral')
        .send(notification);

      expect(response.status).toBe(401);
    });

    it('handles a telephony session notification', async () => {
      const response = await request(app)
        .post('/webhooks/ringcentral')
        .set('Verification-Token', EXPECTED_TOKEN)
        .send({
          ...notification,
          event: '/restapi/v1.0/account/111/telephony/sessions',
          body: { telephonyStatus: 'CallConnected' },
        });

      expect(response.status).toBe(200);
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
