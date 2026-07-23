import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, verifyClientState } from '../app/webhooks/microsoft-graph/route';

const CLIENT_STATE = 'test-client-state-secret';

beforeAll(() => {
  process.env.MICROSOFT_GRAPH_CLIENT_STATE = CLIENT_STATE;
});

const ENDPOINT = 'http://localhost:3000/webhooks/microsoft-graph';

function postJson(body: unknown): NextRequest {
  return new NextRequest(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function changeNotification(overrides: Record<string, unknown> = {}) {
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
    expect(verifyClientState(null, CLIENT_STATE)).toBe(false);
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
    const request = new NextRequest(
      `${ENDPOINT}?validationToken=${encodeURIComponent(token)}`,
      { method: 'POST' }
    );

    const res = await POST(request);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await res.text()).toBe(token);
  });
});

describe('POST /webhooks/microsoft-graph — change notifications', () => {
  it('returns 202 for a valid updated notification', async () => {
    const res = await POST(postJson(changeNotification({ changeType: 'updated' })));
    expect(res.status).toBe(202);
  });

  it('returns 202 for a valid created notification', async () => {
    const res = await POST(postJson(changeNotification({ changeType: 'created' })));
    expect(res.status).toBe(202);
  });

  it('returns 202 for a valid deleted notification', async () => {
    const res = await POST(postJson(changeNotification({ changeType: 'deleted' })));
    expect(res.status).toBe(202);
  });

  it('returns 400 when clientState does not match', async () => {
    const res = await POST(postJson(changeNotification({ clientState: 'attacker-supplied' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 when clientState is missing', async () => {
    const res = await POST(postJson(changeNotification({ clientState: undefined })));
    expect(res.status).toBe(400);
  });

  it('returns 202 for an empty value array', async () => {
    const res = await POST(postJson({ value: [] }));
    expect(res.status).toBe(202);
  });

  it('returns 400 for invalid JSON', async () => {
    const request = new NextRequest(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });
    const res = await POST(request);
    expect(res.status).toBe(400);
  });
});

describe('POST /webhooks/microsoft-graph — lifecycle events', () => {
  it('returns 202 for a reauthorizationRequired lifecycle event', async () => {
    const res = await POST(
      postJson({
        value: [
          {
            subscriptionId: 'sub-123',
            clientState: CLIENT_STATE,
            lifecycleEvent: 'reauthorizationRequired',
          },
        ],
      })
    );
    expect(res.status).toBe(202);
  });

  it('returns 202 for a missed lifecycle event', async () => {
    const res = await POST(
      postJson({
        value: [{ subscriptionId: 'sub-123', clientState: CLIENT_STATE, lifecycleEvent: 'missed' }],
      })
    );
    expect(res.status).toBe(202);
  });

  it('returns 400 when a lifecycle event has an invalid clientState', async () => {
    const res = await POST(
      postJson({
        value: [
          { subscriptionId: 'sub-123', clientState: 'wrong', lifecycleEvent: 'subscriptionRemoved' },
        ],
      })
    );
    expect(res.status).toBe(400);
  });
});
