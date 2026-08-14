const request = require('supertest');

// Test token — set before requiring the app.
// Aircall tokens are opaque strings issued at webhook creation, e.g. "df76g76dpziygs567f0".
const TEST_TOKEN = 'df76g76dpziygs567f0';
process.env.AIRCALL_WEBHOOK_TOKEN = TEST_TOKEN;

const { app, verifyAircallWebhook } = require('../src/index');

/**
 * Build an Aircall webhook payload.
 *
 * Aircall's envelope always has five top-level fields:
 * resource, event, timestamp, token, data.
 * The `token` IS the credential — there is no signature to generate.
 */
function buildPayload(event, data = {}, overrides = {}) {
  return {
    resource: 'call',
    event,
    timestamp: 1732622896,
    token: TEST_TOKEN,
    data,
    ...overrides,
  };
}

// Doc-sourced call.created data (Aircall API reference sample)
const CALL_DATA = {
  id: 123,
  direct_link: 'https://api.aircall.io/v1/calls/123',
  direction: 'outbound',
  call_uuid: 'CAed058bba60a84d62c77cee898a852b05',
  status: 'initial',
  missed_call_reason: null,
  started_at: 1732622895,
  answered_at: null,
  ended_at: null,
  duration: 0,
  cost: '0',
  hangup_cause: null,
  voicemail: null,
  recording: null,
  raw_digits: '+1 800-123-4567',
  participants: [
    { phone_number: '+1 800-123-4567', type: 'external' },
    { id: 123, name: 'John Doe', type: 'user' },
  ],
};

// Doc-sourced number.closed data (Aircall API reference sample)
const NUMBER_DATA = {
  id: 456,
  direct_link: 'https://api.aircall.io/v1/numbers/123',
  name: 'My first Aircall Number',
  digits: '+33 1 76 36 06 95',
  country: 'FR',
  time_zone: 'Europe/Paris',
  open: false,
  users: [
    {
      id: 456,
      direct_link: 'https://api.aircall.io/v1/users/456',
      name: 'Madelaine Dupont',
      email: 'madelaine.dupont@aircall.io',
      available: false,
      language: 'en-US',
    },
  ],
};

describe('Aircall Webhook Handler', () => {
  describe('GET /health', () => {
    it('returns health status', async () => {
      const response = await request(app).get('/health').expect(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('verifyAircallWebhook', () => {
    it('accepts the exact token', () => {
      expect(verifyAircallWebhook(TEST_TOKEN, TEST_TOKEN)).toBe(true);
    });

    it('rejects a wrong token of the same length', () => {
      const wrong = 'x'.repeat(TEST_TOKEN.length);
      expect(wrong).toHaveLength(TEST_TOKEN.length);
      expect(verifyAircallWebhook(wrong, TEST_TOKEN)).toBe(false);
    });

    it('rejects a token of a different length without throwing', () => {
      // crypto.timingSafeEqual throws on length mismatch — must be caught
      expect(() => verifyAircallWebhook('short', TEST_TOKEN)).not.toThrow();
      expect(verifyAircallWebhook('short', TEST_TOKEN)).toBe(false);
    });

    it('rejects missing / non-string tokens', () => {
      expect(verifyAircallWebhook(undefined, TEST_TOKEN)).toBe(false);
      expect(verifyAircallWebhook(null, TEST_TOKEN)).toBe(false);
      expect(verifyAircallWebhook(12345, TEST_TOKEN)).toBe(false);
      expect(verifyAircallWebhook({}, TEST_TOKEN)).toBe(false);
    });

    it('rejects when no expected token is configured', () => {
      expect(verifyAircallWebhook(TEST_TOKEN, undefined)).toBe(false);
      expect(verifyAircallWebhook(TEST_TOKEN, '')).toBe(false);
    });

    it('is case-sensitive', () => {
      expect(verifyAircallWebhook(TEST_TOKEN.toUpperCase(), TEST_TOKEN)).toBe(false);
    });
  });

  describe('POST /webhooks/aircall — token verification', () => {
    it('rejects a payload with no token field', async () => {
      const payload = buildPayload('call.created', CALL_DATA);
      delete payload.token;

      const response = await request(app)
        .post('/webhooks/aircall')
        .send(payload)
        .expect(401);

      expect(response.text).toBe('Unauthorized');
    });

    it('rejects a payload with the wrong token', async () => {
      const response = await request(app)
        .post('/webhooks/aircall')
        .send(buildPayload('call.created', CALL_DATA, { token: 'wrong_token_value' }))
        .expect(401);

      expect(response.text).toBe('Unauthorized');
    });

    it('rejects a token that differs only in the last character', async () => {
      const nearMiss = TEST_TOKEN.slice(0, -1) + 'X';

      await request(app)
        .post('/webhooks/aircall')
        .send(buildPayload('call.created', CALL_DATA, { token: nearMiss }))
        .expect(401);
    });

    it('rejects a different-length token (timing-safe path)', async () => {
      await request(app)
        .post('/webhooks/aircall')
        .send(buildPayload('call.created', CALL_DATA, { token: 'short' }))
        .expect(401);
    });

    it('does NOT accept the token from a header (Aircall has no signature header)', async () => {
      const payload = buildPayload('call.created', CALL_DATA);
      delete payload.token;

      // Even with every plausible header set, the body token is what counts.
      await request(app)
        .post('/webhooks/aircall')
        .set('X-Aircall-Signature', TEST_TOKEN)
        .set('X-Aircall-Token', TEST_TOKEN)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send(payload)
        .expect(401);
    });

    it('accepts a payload with the correct token', async () => {
      const response = await request(app)
        .post('/webhooks/aircall')
        .send(buildPayload('call.created', CALL_DATA))
        .expect(200);

      expect(response.body).toEqual({ received: true, event: 'call.created' });
    });
  });

  describe('POST /webhooks/aircall — payload validation', () => {
    it('returns 400 for invalid JSON', async () => {
      const response = await request(app)
        .post('/webhooks/aircall')
        .set('Content-Type', 'application/json')
        .send('{ not valid json')
        .expect(400);

      expect(response.text).toBe('Invalid JSON');
    });

    it('returns 400 when the event field is missing', async () => {
      const payload = buildPayload('call.created', CALL_DATA);
      delete payload.event;

      const response = await request(app)
        .post('/webhooks/aircall')
        .send(payload)
        .expect(400);

      expect(response.text).toBe('Missing event');
    });

    it('verifies the token before validating the envelope', async () => {
      // Missing `event` AND a bad token -> 401 wins, proving verification is first
      const payload = buildPayload('call.created', CALL_DATA, { token: 'wrong_token_value' });
      delete payload.event;

      await request(app).post('/webhooks/aircall').send(payload).expect(401);
    });
  });

  describe('POST /webhooks/aircall — call events', () => {
    const callEvents = [
      'call.created',
      'call.ringing_on_agent',
      'call.agent_declined',
      'call.answered',
      'call.transferred',
      'call.external_transferred',
      'call.unsuccessful_transfer',
      'call.hungup',
      'call.ended',
      'call.hold',
      'call.unhold',
      'call.ivr_option_selected',
      'call.comm_assets_generated',
      'call.voicemail_left',
      'call.assigned',
      'call.archived',
      'call.tagged',
      'call.untagged',
      'call.commented',
    ];

    it.each(callEvents)('handles %s', async (event) => {
      const response = await request(app)
        .post('/webhooks/aircall')
        .send(buildPayload(event, { ...CALL_DATA, tags: [{ name: 'support' }] }))
        .expect(200);

      expect(response.body).toEqual({ received: true, event });
    });

    it('handles call.ended with duration and cost', async () => {
      const response = await request(app)
        .post('/webhooks/aircall')
        .send(
          buildPayload('call.ended', {
            ...CALL_DATA,
            status: 'done',
            answered_at: 1732622900,
            ended_at: 1732622960,
            duration: 60,
            cost: '0.02',
            hangup_cause: 'normal_clearing',
          })
        )
        .expect(200);

      expect(response.body.event).toBe('call.ended');
    });
  });

  describe('POST /webhooks/aircall — user events', () => {
    const userV2Events = [
      'user.created.v2',
      'user.deleted.v2',
      'user.connected.v2',
      'user.disconnected.v2',
      'user.opened.v2',
      'user.closed.v2',
      'user.wut_start.v2',
      'user.wut_end.v2',
    ];

    it.each(userV2Events)('handles %s (preferred)', async (event) => {
      const response = await request(app)
        .post('/webhooks/aircall')
        .send(
          buildPayload(
            event,
            { id: 456, name: 'Madelaine Dupont', email: 'madelaine.dupont@aircall.io' },
            { resource: 'user' }
          )
        )
        .expect(200);

      expect(response.body).toEqual({ received: true, event });
    });

    const userV1Events = [
      'user.created',
      'user.deleted',
      'user.connected',
      'user.disconnected',
      'user.opened',
      'user.closed',
      'user.wut_start',
      'user.wut_end',
    ];

    it.each(userV1Events)('still handles deprecated %s', async (event) => {
      const response = await request(app)
        .post('/webhooks/aircall')
        .send(buildPayload(event, { id: 456, name: 'Madelaine Dupont' }, { resource: 'user' }))
        .expect(200);

      expect(response.body).toEqual({ received: true, event });
    });

    it('handles both user.closed events when substatus is enabled', async () => {
      // Aircall sends TWO user.closed events with substatus enabled:
      // one with availability_status only, one with the selected substatus.
      const first = await request(app)
        .post('/webhooks/aircall')
        .send(
          buildPayload(
            'user.closed.v2',
            { id: 456, name: 'Madelaine Dupont', availability_status: 'unavailable' },
            { resource: 'user' }
          )
        )
        .expect(200);

      const second = await request(app)
        .post('/webhooks/aircall')
        .send(
          buildPayload(
            'user.closed.v2',
            {
              id: 456,
              name: 'Madelaine Dupont',
              availability_status: 'unavailable',
              substatus: 'in_meeting',
            },
            { resource: 'user' }
          )
        )
        .expect(200);

      expect(first.body.event).toBe('user.closed.v2');
      expect(second.body.event).toBe('user.closed.v2');
    });
  });

  describe('POST /webhooks/aircall — number events', () => {
    it.each(['number.created', 'number.opened', 'number.closed', 'number.deleted'])(
      'handles %s',
      async (event) => {
        const response = await request(app)
          .post('/webhooks/aircall')
          .send(buildPayload(event, NUMBER_DATA, { resource: 'number' }))
          .expect(200);

        expect(response.body).toEqual({ received: true, event });
      }
    );

    it('handles the documented number.closed payload verbatim', async () => {
      const response = await request(app)
        .post('/webhooks/aircall')
        .send({
          resource: 'number',
          event: 'number.closed',
          timestamp: 1585001020,
          token: TEST_TOKEN,
          data: NUMBER_DATA,
        })
        .expect(200);

      expect(response.body).toEqual({ received: true, event: 'number.closed' });
    });
  });

  describe('POST /webhooks/aircall — contact events', () => {
    it.each(['contact.created', 'contact.updated', 'contact.deleted'])(
      'handles %s',
      async (event) => {
        const response = await request(app)
          .post('/webhooks/aircall')
          .send(
            buildPayload(
              event,
              {
                id: 789,
                first_name: 'Ada',
                last_name: 'Lovelace',
                // Contact events use UTC strings, not integers
                created_at: '2026-03-03T09:35:00Z',
                updated_at: '2026-03-03T09:40:00Z',
              },
              { resource: 'contact' }
            )
          )
          .expect(200);

        expect(response.body).toEqual({ received: true, event });
      }
    );
  });

  describe('POST /webhooks/aircall — message events', () => {
    it.each(['message.sent', 'message.received', 'message.status_updated'])(
      'handles %s',
      async (event) => {
        const response = await request(app)
          .post('/webhooks/aircall')
          .send(
            buildPayload(
              event,
              // channel: null means SMS or MMS
              { id: 'msg-1', body: 'Hello', status: 'delivered', channel: null },
              { resource: 'message' }
            )
          )
          .expect(200);

        expect(response.body).toEqual({ received: true, event });
      }
    );

    it('handles a WhatsApp message', async () => {
      const response = await request(app)
        .post('/webhooks/aircall')
        .send(
          buildPayload(
            'message.received',
            { id: 'msg-2', body: 'Hi there', channel: 'whatsapp' },
            { resource: 'message' }
          )
        )
        .expect(200);

      expect(response.body.event).toBe('message.received');
    });

    it.each(['group_message.sent', 'group_message.received', 'group_message.status_updated'])(
      'handles %s',
      async (event) => {
        const response = await request(app)
          .post('/webhooks/aircall')
          .send(
            buildPayload(
              event,
              {
                id: 'a3f7c821-4e92-4b1d-8c6f-0d5e2a9b3f74',
                group_conversation_id: 'b8d2e047-7f3a-4c85-9e1d-6a4b0c7f2e38',
                participants: ['12025550147', '13105550293', '16465550812'],
                body: 'test',
                status: 'sent',
                created_at: '2026-03-03T09:35:00.520Z',
              },
              { resource: 'message' }
            )
          )
          .expect(200);

        expect(response.body).toEqual({ received: true, event });
      }
    );
  });

  describe('POST /webhooks/aircall — conversation intelligence & AI events', () => {
    const ciEvents = [
      'transcription.created',
      'summary.created',
      'topics.created',
      'sentiment.created',
      'action_item.created',
      'playbook_result.created',
      'playbook_result.updated',
      'realtime_transcription.utterances_received',
      'custom_summary.result_created',
      'custom_summary.result_updated',
      'call_evaluation.created',
      'call_evaluation.updated',
    ];

    it.each(ciEvents)('handles %s', async (event) => {
      const response = await request(app)
        .post('/webhooks/aircall')
        .send(
          buildPayload(event, { call_id: 123 }, { resource: 'conversation_intelligence' })
        )
        .expect(200);

      expect(response.body).toEqual({ received: true, event });
    });

    it.each([
      'ai_voice_agent.started',
      'ai_voice_agent.ended',
      'ai_voice_agent.escalated',
      'ai_voice_agent.summary',
    ])('handles %s', async (event) => {
      const response = await request(app)
        .post('/webhooks/aircall')
        .send(buildPayload(event, { call_id: 123 }, { resource: 'ai_voice_agent' }))
        .expect(200);

      expect(response.body).toEqual({ received: true, event });
    });

    it.each(['analytics.report_created', 'analytics.report_failed'])(
      'handles %s',
      async (event) => {
        const response = await request(app)
          .post('/webhooks/aircall')
          .send(
            buildPayload(
              event,
              { download_url: 'https://example.s3.amazonaws.com/export.csv' },
              { resource: 'analytics' }
            )
          )
          .expect(200);

        expect(response.body).toEqual({ received: true, event });
      }
    );

    it('handles integration.deleted', async () => {
      const response = await request(app)
        .post('/webhooks/aircall')
        .send(
          buildPayload(
            'integration.deleted',
            { integration_id: 42, company_id: 1 },
            { resource: 'integration' }
          )
        )
        .expect(200);

      expect(response.body).toEqual({ received: true, event: 'integration.deleted' });
    });
  });

  describe('POST /webhooks/aircall — forward compatibility & idempotency', () => {
    it('returns 200 for an unknown event rather than failing', async () => {
      // A non-2xx counts toward the 50 failures that auto-disable the webhook,
      // so unknown events must still be acknowledged.
      const response = await request(app)
        .post('/webhooks/aircall')
        .send(buildPayload('call.some_future_event', CALL_DATA))
        .expect(200);

      expect(response.body).toEqual({ received: true, event: 'call.some_future_event' });
    });

    it('returns 200 for an unknown resource type', async () => {
      await request(app)
        .post('/webhooks/aircall')
        .send(buildPayload('future_resource.created', {}, { resource: 'future_resource' }))
        .expect(200);
    });

    it('accepts duplicate deliveries (at-least-once delivery)', async () => {
      const payload = buildPayload('call.answered', CALL_DATA);

      const first = await request(app).post('/webhooks/aircall').send(payload).expect(200);
      const second = await request(app).post('/webhooks/aircall').send(payload).expect(200);

      expect(first.body).toEqual(second.body);
    });

    it('accepts out-of-order deliveries (no ordering guarantee)', async () => {
      // call.ended arriving before call.created is legal per Aircall's docs.
      await request(app)
        .post('/webhooks/aircall')
        .send(buildPayload('call.ended', { ...CALL_DATA, duration: 60 }))
        .expect(200);

      await request(app)
        .post('/webhooks/aircall')
        .send(buildPayload('call.created', CALL_DATA))
        .expect(200);
    });

    it('accepts an old timestamp — there is no replay/staleness window', async () => {
      // `timestamp` is unsigned metadata and must NOT gate acceptance.
      const response = await request(app)
        .post('/webhooks/aircall')
        .send(buildPayload('call.created', CALL_DATA, { timestamp: 1 }))
        .expect(200);

      expect(response.body.event).toBe('call.created');
    });
  });

  describe('404 handling', () => {
    it('returns 404 for unknown routes', async () => {
      const response = await request(app).post('/unknown').expect(404);
      expect(response.body).toEqual({ error: 'Not found' });
    });
  });
});
