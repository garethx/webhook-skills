import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

// Set env vars before importing the route — it reads them at module load.
process.env.STRAVA_VERIFY_TOKEN = 'test_verify_token';
process.env.STRAVA_SUBSCRIPTION_ID = '120475';

const { GET, POST } = await import('../app/webhooks/strava/route');

function validationRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/webhooks/strava');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

function eventRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/strava', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    object_type: 'activity',
    object_id: 1360128428,
    aspect_type: 'create',
    owner_id: 134815,
    subscription_id: 120475,
    event_time: 1516126040,
    updates: {},
    ...overrides,
  };
}

describe('GET /webhooks/strava (subscription validation)', () => {
  it('echoes the challenge for a valid verify token', async () => {
    const res = await GET(
      validationRequest({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test_verify_token',
        'hub.challenge': 'abc123challenge',
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ 'hub.challenge': 'abc123challenge' });
  });

  it('returns 403 for an invalid verify token', async () => {
    const res = await GET(
      validationRequest({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'abc123challenge',
      })
    );

    expect(res.status).toBe(403);
  });

  it('returns 403 when hub.mode is not subscribe', async () => {
    const res = await GET(
      validationRequest({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': 'test_verify_token',
        'hub.challenge': 'abc123challenge',
      })
    );

    expect(res.status).toBe(403);
  });
});

describe('POST /webhooks/strava (events)', () => {
  it('returns 200 for a valid activity create event', async () => {
    const res = await POST(eventRequest(baseEvent()));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles all activity/athlete event combinations', async () => {
    const cases = [
      { object_type: 'activity', aspect_type: 'create' },
      { object_type: 'activity', aspect_type: 'update', updates: { title: 'New title' } },
      { object_type: 'activity', aspect_type: 'delete' },
      { object_type: 'athlete', aspect_type: 'update', updates: { authorized: 'false' } },
    ];

    for (const c of cases) {
      const res = await POST(eventRequest(baseEvent(c)));
      expect(res.status).toBe(200);
    }
  });

  it('returns 403 for an unknown subscription_id', async () => {
    const res = await POST(eventRequest(baseEvent({ subscription_id: 999999 })));

    expect(res.status).toBe(403);
  });
});
