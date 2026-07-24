import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

beforeAll(() => {
  process.env.SHAREPOINT_CLIENT_STATE = 'test-client-state-secret';
});

const CLIENT_STATE = 'test-client-state-secret';
const ENDPOINT = 'http://localhost/webhooks/microsoft-sharepoint';

function buildNotification(clientState: string = CLIENT_STATE): string {
  return JSON.stringify({
    value: [
      {
        subscriptionId: '91779246-afe9-4525-b122-6c199ae89211',
        clientState,
        expirationDateTime: '2016-04-30T17:27:00.0000000Z',
        resource: 'b9f6f714-9df8-470b-b22e-653855e1c181',
        tenantId: '00000000-0000-0000-0000-000000000000',
        siteUrl: '/',
        webId: 'dbc5a806-e4d4-46e5-951c-6344d70b62fa',
      },
    ],
  });
}

function notificationRequest(body: string): NextRequest {
  return new NextRequest(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('Microsoft SharePoint webhook route', () => {
  it('echoes the validationtoken as text/plain with 200', async () => {
    const { POST } = await import('../app/webhooks/microsoft-sharepoint/route');
    const token = 'random-validation-token-123';
    const req = new NextRequest(`${ENDPOINT}?validationtoken=${token}`, { method: 'POST' });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await res.text()).toBe(token);
  });

  it('returns 200 for a valid clientState', async () => {
    const { POST } = await import('../app/webhooks/microsoft-sharepoint/route');
    const res = await POST(notificationRequest(buildNotification()));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 400 for a mismatched clientState', async () => {
    const { POST } = await import('../app/webhooks/microsoft-sharepoint/route');
    const res = await POST(notificationRequest(buildNotification('wrong-secret')));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Invalid clientState');
  });

  it('returns 400 for invalid JSON', async () => {
    const { POST } = await import('../app/webhooks/microsoft-sharepoint/route');
    const res = await POST(notificationRequest('not-json{'));

    expect(res.status).toBe(400);
  });

  it('handles a batch of multiple notifications', async () => {
    const { POST } = await import('../app/webhooks/microsoft-sharepoint/route');
    const body = JSON.stringify({
      value: [
        { subscriptionId: 'sub-1', clientState: CLIENT_STATE, resource: 'list-1', siteUrl: '/' },
        { subscriptionId: 'sub-2', clientState: CLIENT_STATE, resource: 'list-2', siteUrl: '/x' },
      ],
    });
    const res = await POST(notificationRequest(body));

    expect(res.status).toBe(200);
  });

  it('rejects a batch where any notification has a bad clientState', async () => {
    const { POST } = await import('../app/webhooks/microsoft-sharepoint/route');
    const body = JSON.stringify({
      value: [
        { subscriptionId: 'sub-1', clientState: CLIENT_STATE, resource: 'list-1' },
        { subscriptionId: 'sub-2', clientState: 'tampered', resource: 'list-2' },
      ],
    });
    const res = await POST(notificationRequest(body));

    expect(res.status).toBe(400);
  });

  it('accepts an empty value array', async () => {
    const { POST } = await import('../app/webhooks/microsoft-sharepoint/route');
    const res = await POST(notificationRequest(JSON.stringify({ value: [] })));

    expect(res.status).toBe(200);
  });

  it('maps GetChanges ChangeType values to list events', async () => {
    const { CHANGE_TYPES } = await import('../app/webhooks/microsoft-sharepoint/route');
    expect(CHANGE_TYPES.Add).toBe('ItemAdded');
    expect(CHANGE_TYPES.Update).toBe('ItemUpdated');
    expect(CHANGE_TYPES.DeleteObject).toBe('ItemDeleted');
  });
});
