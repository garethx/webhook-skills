const request = require('supertest');
const nacl = require('tweetnacl');

// Generate a real Ed25519 keypair for testing
const keypair = nacl.sign.keyPair();
const PUBLIC_KEY_HEX = Buffer.from(keypair.publicKey).toString('hex');
const SECRET_KEY = keypair.secretKey;

process.env.DISCORD_PUBLIC_KEY = PUBLIC_KEY_HEX;

const { app, server } = require('../src/index');

function signPayload(rawBody, timestamp) {
  const message = Buffer.concat([Buffer.from(timestamp), Buffer.from(rawBody)]);
  const signature = nacl.sign.detached(message, SECRET_KEY);
  return Buffer.from(signature).toString('hex');
}

function sendSigned(payloadObj, { tamperBody = false, omitHeaders = false, badSig = false } = {}) {
  const rawBody = JSON.stringify(payloadObj);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  let signature = signPayload(rawBody, timestamp);

  if (badSig) {
    signature = '00'.repeat(64);
  }

  const sentBody = tamperBody ? rawBody.replace(/}$/, ',"injected":true}') : rawBody;

  const req = request(app)
    .post('/webhooks/discord')
    .set('Content-Type', 'application/json');

  if (!omitHeaders) {
    req.set('X-Signature-Ed25519', signature);
    req.set('X-Signature-Timestamp', timestamp);
  }

  return req.send(sentBody);
}

describe('Discord Webhook Handler', () => {
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('health check works', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('responds 204 to a valid PING (type 0)', async () => {
    const response = await sendSigned({
      version: 1,
      application_id: '123456789012345678',
      type: 0
    });

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });

  test('responds 204 to a valid APPLICATION_AUTHORIZED event', async () => {
    const response = await sendSigned({
      version: 1,
      application_id: '123456789012345678',
      type: 1,
      event: {
        type: 'APPLICATION_AUTHORIZED',
        timestamp: new Date().toISOString(),
        data: {
          user: { id: '987654321098765432', username: 'testuser' },
          scopes: ['applications.commands']
        }
      }
    });

    expect(response.status).toBe(204);
  });

  test('rejects request with missing signature headers (401)', async () => {
    const response = await sendSigned(
      { version: 1, application_id: '1', type: 0 },
      { omitHeaders: true }
    );

    expect(response.status).toBe(401);
    expect(response.text).toMatch(/Missing signature/i);
  });

  test('rejects request with invalid signature (401)', async () => {
    const response = await sendSigned(
      { version: 1, application_id: '1', type: 0 },
      { badSig: true }
    );

    expect(response.status).toBe(401);
    expect(response.text).toMatch(/Invalid request signature/i);
  });

  test('rejects when body is tampered after signing (401)', async () => {
    const response = await sendSigned(
      {
        version: 1,
        application_id: '1',
        type: 1,
        event: {
          type: 'APPLICATION_AUTHORIZED',
          timestamp: new Date().toISOString(),
          data: { user: { id: '1' } }
        }
      },
      { tamperBody: true }
    );

    expect(response.status).toBe(401);
  });

  test('handles all common event types', async () => {
    const eventTypes = [
      'APPLICATION_AUTHORIZED',
      'APPLICATION_DEAUTHORIZED',
      'ENTITLEMENT_CREATE',
      'ENTITLEMENT_UPDATE',
      'ENTITLEMENT_DELETE',
      'QUEST_USER_ENROLLMENT',
      'LOBBY_MESSAGE_CREATE',
      'LOBBY_MESSAGE_UPDATE',
      'LOBBY_MESSAGE_DELETE',
      'GAME_DIRECT_MESSAGE_CREATE',
      'GAME_DIRECT_MESSAGE_UPDATE',
      'GAME_DIRECT_MESSAGE_DELETE'
    ];

    for (const eventType of eventTypes) {
      const response = await sendSigned({
        version: 1,
        application_id: '123456789012345678',
        type: 1,
        event: {
          type: eventType,
          timestamp: new Date().toISOString(),
          data: { id: 'resource_1', user_id: 'user_1', content: 'hi', lobby_id: 'lobby_1' }
        }
      });

      expect(response.status).toBe(204);
    }
  });

  test('handles unknown event types gracefully (204)', async () => {
    const response = await sendSigned({
      version: 1,
      application_id: '123456789012345678',
      type: 1,
      event: {
        type: 'SOME_FUTURE_EVENT',
        timestamp: new Date().toISOString(),
        data: {}
      }
    });

    expect(response.status).toBe(204);
  });
});
