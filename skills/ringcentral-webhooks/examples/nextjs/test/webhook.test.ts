import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

// vi.hoisted runs before the imports below, so the route module captures the
// verification token when it evaluates its module-level EXPECTED_TOKEN.
vi.hoisted(() => {
  process.env.RINGCENTRAL_VERIFICATION_TOKEN = 'test_verification_token';
});

import { POST, tokenMatches, eventCategory } from '../app/webhooks/ringcentral/route';

const EXPECTED_TOKEN = 'test_verification_token';
const URL = 'http://localhost:3000/webhooks/ringcentral';

function makeRequest(headers: Record<string, string>, body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const notification = {
  uuid: 'a7c1f0e2-1234',
  event: '/restapi/v1.0/account/111/extension/222/message-store',
  timestamp: '2024-01-15T10:00:00.000Z',
  subscriptionId: 'sub-1',
  ownerId: '222',
  body: { changes: [{ type: 'SMS', newCount: 1 }] },
};

describe('tokenMatches', () => {
  it('returns true for a matching token', () => {
    expect(tokenMatches(EXPECTED_TOKEN, EXPECTED_TOKEN)).toBe(true);
  });

  it('returns false for a different token', () => {
    expect(tokenMatches('wrong_token', EXPECTED_TOKEN)).toBe(false);
  });

  it('returns false for a missing token', () => {
    expect(tokenMatches(null, EXPECTED_TOKEN)).toBe(false);
  });

  it('returns false for different-length tokens', () => {
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
    expect(eventCategory('/restapi/v1.0/account/1/extension/2/message-store')).toBe(
      'message-store'
    );
  });

  it('classifies presence events', () => {
    expect(eventCategory('/restapi/v1.0/account/1/extension/2/presence')).toBe('presence');
  });

  it('classifies telephony session events', () => {
    expect(eventCategory('/restapi/v1.0/account/1/telephony/sessions')).toBe(
      'telephony-session'
    );
  });

  it('returns unknown for undefined filter', () => {
    expect(eventCategory(undefined)).toBe('unknown');
  });
});

describe('POST /webhooks/ringcentral — Validation-Token handshake', () => {
  it('echoes the Validation-Token and returns 200', async () => {
    const res = await POST(makeRequest({ 'validation-token': 'handshake-abc' }, undefined));

    expect(res.status).toBe(200);
    expect(res.headers.get('validation-token')).toBe('handshake-abc');
  });
});

describe('POST /webhooks/ringcentral — notifications', () => {
  it('returns 200 for a valid Verification-Token', async () => {
    const res = await POST(
      makeRequest({ 'verification-token': EXPECTED_TOKEN }, notification)
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('returns 401 for an invalid Verification-Token', async () => {
    const res = await POST(
      makeRequest({ 'verification-token': 'wrong_token' }, notification)
    );

    expect(res.status).toBe(401);
  });

  it('returns 401 for a missing Verification-Token', async () => {
    const res = await POST(makeRequest({}, notification));

    expect(res.status).toBe(401);
  });
});
