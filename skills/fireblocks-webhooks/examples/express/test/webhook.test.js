import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import {
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  CompactSign,
} from 'jose';
import { createApp } from '../src/index.js';

const KID = 'test-key-1';

let privateKey;
let jwks;
let app;

/**
 * Sign a raw body the way Fireblocks does: a detached RS512 JWS
 * (`<header>..<signature>`, empty payload segment).
 */
async function signDetached(rawBody, key = privateKey, kid = KID) {
  const jws = await new CompactSign(Buffer.from(rawBody))
    .setProtectedHeader({ alg: 'RS512', kid })
    .sign(key);
  const [header, , signature] = jws.split('.');
  return `${header}..${signature}`;
}

beforeAll(async () => {
  // Generate a test RSA key pair and expose the public half as a local JWKS,
  // standing in for the Fireblocks regional JWKS endpoint.
  const pair = await generateKeyPair('RS512', { extractable: true });
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = 'RS512';
  jwks = createLocalJWKSet({ keys: [publicJwk] });
  app = createApp(jwks);
});

describe('POST /webhooks/fireblocks', () => {
  it('returns 400 when the signature header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/fireblocks')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed signature header', async () => {
    const res = await request(app)
      .post('/webhooks/fireblocks')
      .set('Content-Type', 'application/json')
      .set('Fireblocks-Webhook-Signature', 'not-a-valid-jws')
      .send('{}');

    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify({ eventType: 'transaction.created', data: { id: 'tx_1' } });
    const res = await request(app)
      .post('/webhooks/fireblocks')
      .set('Content-Type', 'application/json')
      .set('Fireblocks-Webhook-Signature', 'aGVhZGVy..c2ln')
      .send(body);

    expect(res.status).toBe(400);
    expect(res.text).toContain('Invalid signature');
  });

  it('returns 400 for a tampered payload', async () => {
    const original = JSON.stringify({ eventType: 'transaction.created', data: { id: 'tx_1' } });
    const signature = await signDetached(original);
    const tampered = JSON.stringify({ eventType: 'transaction.created', data: { id: 'tx_HACKED' } });

    const res = await request(app)
      .post('/webhooks/fireblocks')
      .set('Content-Type', 'application/json')
      .set('Fireblocks-Webhook-Signature', signature)
      .send(tampered);

    expect(res.status).toBe(400);
  });

  it('returns 400 when signed by a key not in the JWKS', async () => {
    const otherPair = await generateKeyPair('RS512', { extractable: true });
    const body = JSON.stringify({ eventType: 'transaction.created', data: { id: 'tx_1' } });
    const signature = await signDetached(body, otherPair.privateKey, 'other-kid');

    const res = await request(app)
      .post('/webhooks/fireblocks')
      .set('Content-Type', 'application/json')
      .set('Fireblocks-Webhook-Signature', signature)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const body = JSON.stringify({
      id: 'evt_1',
      webhookId: 'wh_1',
      workspaceId: 'ws_1',
      eventType: 'transaction.created',
      createdAt: 1754494189479,
      data: { id: 'tx_1', status: 'SUBMITTED' },
    });
    const signature = await signDetached(body);

    const res = await request(app)
      .post('/webhooks/fireblocks')
      .set('Content-Type', 'application/json')
      .set('Fireblocks-Webhook-Signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('handles the common event types', async () => {
    const eventTypes = [
      'transaction.created',
      'transaction.status.updated',
      'transaction.approval_status.updated',
      'transaction.network_records.processing_completed',
      'unknown.event.type',
    ];

    for (const eventType of eventTypes) {
      const body = JSON.stringify({ eventType, data: { id: 'tx_1', status: 'COMPLETED' } });
      const signature = await signDetached(body);

      const res = await request(app)
        .post('/webhooks/fireblocks')
        .set('Content-Type', 'application/json')
        .set('Fireblocks-Webhook-Signature', signature)
        .send(body);

      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
