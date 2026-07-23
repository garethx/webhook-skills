import request from 'supertest';
import { SignJWT } from 'jose';

// Set test environment variables before importing app
const TEST_SECRET = 'test_monday_signing_secret';
process.env.MONDAY_SIGNING_SECRET = TEST_SECRET;

const { app, verifyMondayJwt } = await import('../src/index.js');

/**
 * Generate a valid monday.com Authorization JWT for testing.
 * monday.com signs each request with an HS256 JWT using the Signing Secret.
 */
async function generateMondayJwt(secret, claims = {}) {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ accountId: 123, userId: 456, ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

function eventBody(type, extra = {}) {
  return JSON.stringify({
    event: {
      type,
      userId: 456,
      boardId: 1771812698,
      pulseId: 1772099344,
      pulseName: 'Test item',
      triggerUuid: 'b12b4f2b58e83e2b4b6e2f7e6f4b1a2c',
      ...extra
    }
  });
}

describe('monday.com Webhook Endpoint', () => {
  describe('challenge handshake', () => {
    it('should echo the challenge token with 200 (no JWT required)', async () => {
      const challenge = '3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P';

      const response = await request(app)
        .post('/webhooks/monday')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ challenge }));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ challenge });
    });
  });

  describe('POST /webhooks/monday', () => {
    it('should return 401 for missing Authorization header', async () => {
      const response = await request(app)
        .post('/webhooks/monday')
        .set('Content-Type', 'application/json')
        .send(eventBody('create_item'));

      expect(response.status).toBe(401);
    });

    it('should return 401 for an invalid JWT', async () => {
      const response = await request(app)
        .post('/webhooks/monday')
        .set('Content-Type', 'application/json')
        .set('Authorization', 'invalid.jwt.token')
        .send(eventBody('create_item'));

      expect(response.status).toBe(401);
    });

    it('should return 401 for a JWT signed with the wrong secret', async () => {
      const token = await generateMondayJwt('wrong_secret');

      const response = await request(app)
        .post('/webhooks/monday')
        .set('Content-Type', 'application/json')
        .set('Authorization', token)
        .send(eventBody('create_item'));

      expect(response.status).toBe(401);
    });

    it('should return 200 for a valid JWT', async () => {
      const token = await generateMondayJwt(TEST_SECRET);

      const response = await request(app)
        .post('/webhooks/monday')
        .set('Content-Type', 'application/json')
        .set('Authorization', token)
        .send(eventBody('create_item'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should accept a "Bearer "-prefixed token', async () => {
      const token = await generateMondayJwt(TEST_SECRET);

      const response = await request(app)
        .post('/webhooks/monday')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${token}`)
        .send(eventBody('create_item'));

      expect(response.status).toBe(200);
    });

    it('should handle different event types', async () => {
      const token = await generateMondayJwt(TEST_SECRET);
      const eventTypes = [
        'create_item',
        'change_column_value',
        'change_status_column_value',
        'change_name',
        'create_update',
        'create_subitem',
        'item_archived',
        'item_deleted',
        'unknown_event_type'
      ];

      for (const type of eventTypes) {
        const response = await request(app)
          .post('/webhooks/monday')
          .set('Content-Type', 'application/json')
          .set('Authorization', token)
          .send(eventBody(type, { parentItemId: 999 }));

        expect(response.status).toBe(200);
      }
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

describe('verifyMondayJwt', () => {
  it('should throw for a missing Authorization header', async () => {
    await expect(verifyMondayJwt(undefined, TEST_SECRET)).rejects.toThrow();
  });

  it('should return the decoded payload for a valid token', async () => {
    const token = await generateMondayJwt(TEST_SECRET, { userId: 789 });
    const payload = await verifyMondayJwt(token, TEST_SECRET);
    expect(payload.userId).toBe(789);
  });

  it('should throw for a token signed with the wrong secret', async () => {
    const token = await generateMondayJwt('wrong_secret');
    await expect(verifyMondayJwt(token, TEST_SECRET)).rejects.toThrow();
  });
});
