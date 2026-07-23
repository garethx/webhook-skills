import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  CompactSign,
} from 'jose';
import { setJWKS } from '../lib/verify';
import { POST } from '../app/webhooks/fireblocks/route';

const KID = 'test-key-1';
const URL = 'http://localhost/webhooks/fireblocks';

let privateKey: CryptoKey;

async function signDetached(rawBody: string, key: CryptoKey = privateKey, kid = KID) {
  const jws = await new CompactSign(Buffer.from(rawBody))
    .setProtectedHeader({ alg: 'RS512', kid })
    .sign(key);
  const [header, , signature] = jws.split('.');
  return `${header}..${signature}`;
}

function makeRequest(body: string, signature?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) headers['Fireblocks-Webhook-Signature'] = signature;
  return new Request(URL, { method: 'POST', headers, body });
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS512', { extractable: true });
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = 'RS512';
  setJWKS(createLocalJWKSet({ keys: [publicJwk] }));
});

describe('POST /webhooks/fireblocks', () => {
  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed signature header', async () => {
    const res = await POST(makeRequest('{}', 'not-a-valid-jws'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify({ eventType: 'transaction.created', data: { id: 'tx_1' } });
    const res = await POST(makeRequest(body, 'aGVhZGVy..c2ln'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const original = JSON.stringify({ eventType: 'transaction.created', data: { id: 'tx_1' } });
    const signature = await signDetached(original);
    const tampered = JSON.stringify({ eventType: 'transaction.created', data: { id: 'tx_HACKED' } });
    const res = await POST(makeRequest(tampered, signature));
    expect(res.status).toBe(400);
  });

  it('returns 400 when signed by a key not in the JWKS', async () => {
    const other = await generateKeyPair('RS512', { extractable: true });
    const body = JSON.stringify({ eventType: 'transaction.created', data: { id: 'tx_1' } });
    const signature = await signDetached(body, other.privateKey, 'other-kid');
    const res = await POST(makeRequest(body, signature));
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
    const res = await POST(makeRequest(body, signature));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
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
      const res = await POST(makeRequest(body, signature));
      expect(res.status).toBe(200);
    }
  });
});
