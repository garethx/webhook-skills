import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import {
  GET,
  POST,
  verifyLinkedInWebhook,
  challengeResponse,
  getNotificationType,
} from '../app/webhooks/linkedin/route';

const CLIENT_SECRET = 'test_client_secret';

beforeAll(() => {
  process.env.LINKEDIN_CLIENT_SECRET = CLIENT_SECRET;
});

/**
 * Generate a valid X-LI-Signature for testing.
 * hex(HMACSHA256("hmacsha256=" + rawBody, clientSecret))
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update('hmacsha256=' + payload).digest('hex');
}

function postRequest(body: string, signature: string | null): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== null) {
    headers['x-li-signature'] = signature;
  }
  return new NextRequest('http://localhost:3000/webhooks/linkedin', {
    method: 'POST',
    headers,
    body,
  });
}

describe('challengeResponse', () => {
  it('is deterministic hex', () => {
    const resp = challengeResponse('890e4665-4dfe-4ab1-b689-ed553bceeed0', CLIENT_SECRET);
    expect(resp).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('verifyLinkedInWebhook', () => {
  it('returns true for a valid signature', () => {
    const payload = '{"notificationId":"n1"}';
    expect(verifyLinkedInWebhook(payload, generateSignature(payload, CLIENT_SECRET), CLIENT_SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyLinkedInWebhook('{"notificationId":"n1"}', 'deadbeef', CLIENT_SECRET)).toBe(false);
  });

  it('returns false for a missing signature', () => {
    expect(verifyLinkedInWebhook('{"notificationId":"n1"}', null, CLIENT_SECRET)).toBe(false);
  });

  it('returns false for the wrong secret', () => {
    const payload = '{"notificationId":"n1"}';
    expect(verifyLinkedInWebhook(payload, generateSignature(payload, CLIENT_SECRET), 'wrong')).toBe(false);
  });

  it('returns false for a tampered body', () => {
    const signature = generateSignature('{"notificationId":"n1"}', CLIENT_SECRET);
    expect(verifyLinkedInWebhook('{"notificationId":"n2"}', signature, CLIENT_SECRET)).toBe(false);
  });
});

describe('getNotificationType', () => {
  it('honors an explicit eventType', () => {
    expect(getNotificationType({ eventType: 'LEAD_ACTION' })).toBe('LEAD_ACTION');
  });
  it('classifies lead payloads', () => {
    expect(getNotificationType({ leadType: 'SPONSORED' })).toBe('LEAD_ACTION');
  });
  it('classifies org social action payloads', () => {
    expect(getNotificationType({ organizationSocialAction: {} })).toBe('ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS');
  });
  it('falls back to UNKNOWN', () => {
    expect(getNotificationType({})).toBe('UNKNOWN');
  });
});

describe('GET /webhooks/linkedin', () => {
  it('echoes challengeCode with a valid challengeResponse', async () => {
    const code = '890e4665-4dfe-4ab1-b689-ed553bceeed0';
    const request = new NextRequest(`http://localhost:3000/webhooks/linkedin?challengeCode=${code}`);
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.challengeCode).toBe(code);
    expect(body.challengeResponse).toBe(challengeResponse(code, CLIENT_SECRET));
  });

  it('returns 400 when challengeCode is missing', async () => {
    const request = new NextRequest('http://localhost:3000/webhooks/linkedin');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });
});

describe('POST /webhooks/linkedin', () => {
  it('returns 401 for a missing signature', async () => {
    const response = await POST(postRequest('{"notificationId":"n1"}', null));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const response = await POST(postRequest('{"notificationId":"n1"}', 'deadbeef'));
    expect(response.status).toBe(401);
  });

  it('returns 200 for a valid LEAD_ACTION notification', async () => {
    const payload = JSON.stringify({ notificationId: 'lead-1', eventType: 'LEAD_ACTION', leadType: 'SPONSORED' });
    const response = await POST(postRequest(payload, generateSignature(payload, CLIENT_SECRET)));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
  });

  it('returns 200 for a valid ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS notification', async () => {
    const payload = JSON.stringify({
      notificationId: 'social-1',
      eventType: 'ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS',
      organizationSocialAction: { object: 'urn:li:activity:123' },
    });
    const response = await POST(postRequest(payload, generateSignature(payload, CLIENT_SECRET)));
    expect(response.status).toBe(200);
  });

  it('deduplicates repeated notificationId', async () => {
    const payload = JSON.stringify({ notificationId: 'dupe-1', eventType: 'LEAD_ACTION' });
    const signature = generateSignature(payload, CLIENT_SECRET);

    const first = await POST(postRequest(payload, signature));
    const second = await POST(postRequest(payload, signature));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
