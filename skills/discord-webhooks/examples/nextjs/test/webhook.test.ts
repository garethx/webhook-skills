import { describe, test, expect, beforeAll } from 'vitest';
import nacl from 'tweetnacl';

// Generate a real Ed25519 keypair for testing
const keypair = nacl.sign.keyPair();
const PUBLIC_KEY_HEX = Buffer.from(keypair.publicKey).toString('hex');
const SECRET_KEY = keypair.secretKey;

beforeAll(() => {
  process.env.DISCORD_PUBLIC_KEY = PUBLIC_KEY_HEX;
});

// Import after env is set
import { POST } from '../app/webhooks/discord/route';

function signPayload(rawBody: string, timestamp: string): string {
  const message = Buffer.concat([Buffer.from(timestamp), Buffer.from(rawBody)]);
  const signature = nacl.sign.detached(message, SECRET_KEY);
  return Buffer.from(signature).toString('hex');
}

interface SendOptions {
  tamperBody?: boolean;
  omitHeaders?: boolean;
  badSig?: boolean;
}

function buildRequest(payloadObj: unknown, opts: SendOptions = {}): Request {
  const rawBody = JSON.stringify(payloadObj);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  let signature = signPayload(rawBody, timestamp);
  if (opts.badSig) signature = '00'.repeat(64);

  const sentBody = opts.tamperBody ? rawBody.replace(/}$/, ',"injected":true}') : rawBody;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (!opts.omitHeaders) {
    headers['x-signature-ed25519'] = signature;
    headers['x-signature-timestamp'] = timestamp;
  }

  return new Request('http://localhost:3001/webhooks/discord', {
    method: 'POST',
    headers,
    body: sentBody
  });
}

describe('Discord Webhook Handler (Next.js)', () => {
  test('responds 204 to a valid PING (type 0)', async () => {
    const req = buildRequest({
      version: 1,
      application_id: '123456789012345678',
      type: 0
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
  });

  test('responds 204 to a valid APPLICATION_AUTHORIZED event', async () => {
    const req = buildRequest({
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
    const res = await POST(req);
    expect(res.status).toBe(204);
  });

  test('rejects request with missing signature headers (401)', async () => {
    const req = buildRequest(
      { version: 1, application_id: '1', type: 0 },
      { omitHeaders: true }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.text()).toMatch(/Missing signature/i);
  });

  test('rejects request with invalid signature (401)', async () => {
    const req = buildRequest(
      { version: 1, application_id: '1', type: 0 },
      { badSig: true }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.text()).toMatch(/Invalid request signature/i);
  });

  test('rejects tampered body (401)', async () => {
    const req = buildRequest(
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
    const res = await POST(req);
    expect(res.status).toBe(401);
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
      const req = buildRequest({
        version: 1,
        application_id: '123456789012345678',
        type: 1,
        event: {
          type: eventType,
          timestamp: new Date().toISOString(),
          data: { id: 'resource_1', user_id: 'user_1', content: 'hi', lobby_id: 'lobby_1' }
        }
      });
      const res = await POST(req);
      expect(res.status).toBe(204);
    }
  });

  test('handles unknown event types gracefully (204)', async () => {
    const req = buildRequest({
      version: 1,
      application_id: '123456789012345678',
      type: 1,
      event: {
        type: 'SOME_FUTURE_EVENT',
        timestamp: new Date().toISOString(),
        data: {}
      }
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
  });
});
