// Generated with: aircall-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Aircall webhook verification.
 *
 * Aircall does NOT sign webhooks — there is no signature header and no HMAC.
 * Every payload carries a top-level `token` string equal to the token issued
 * when the webhook was created (POST /v1/webhooks -> webhook.token).
 *
 * Compare it in constant time so the token can't be recovered via timing.
 * Because the secret lives inside the JSON body, the raw body is NOT needed —
 * unlike HMAC providers, parsing first is safe here.
 */
function verifyAircallWebhook(payloadToken, expectedToken) {
  if (typeof payloadToken !== 'string' || !expectedToken) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(payloadToken),
      Buffer.from(expectedToken)
    );
  } catch {
    // timingSafeEqual throws when lengths differ — that's just a mismatch
    return false;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Aircall webhook endpoint
app.post('/webhooks/aircall', express.json({ limit: '5mb' }), (req, res) => {
  const payload = req.body;

  if (!payload || typeof payload !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  const { resource, event, timestamp, token, data } = payload;

  // 1. Verify BEFORE doing anything else.
  if (!verifyAircallWebhook(token, process.env.AIRCALL_WEBHOOK_TOKEN)) {
    console.error('Aircall webhook verification failed');
    return res.status(401).send('Unauthorized');
  }

  // 2. Validate the envelope. Aircall always sends resource/event/timestamp/token/data.
  if (!event || typeof event !== 'string') {
    return res.status(400).send('Missing event');
  }

  console.log(`✓ Verified Aircall webhook: ${event}`);
  console.log(`  resource=${resource} timestamp=${timestamp}`);

  // 3. Respond 200 immediately — Aircall times out after 5 seconds, and a
  //    timeout or non-2xx counts toward the 50 failures that auto-disable the
  //    webhook. Real work belongs on a queue.
  res.status(200).json({ received: true, event });

  // 4. Process asynchronously, after the response.
  //    Delivery is at-least-once and unordered, so handlers must be idempotent.
  setImmediate(() => {
    try {
      handleEvent(event, data, resource);
    } catch (err) {
      console.error(`Error handling ${event}:`, err);
    }
  });
});

/**
 * Dispatch on the event name.
 *
 * Switch on `event` rather than `resource`: `resource` was originally documented
 * as number/user/contact/call, and newer event families (message, analytics,
 * ai_voice_agent, conversation_intelligence) added values later.
 */
function handleEvent(event, data = {}, resource) {
  // Call events — MANY events fire for a single call. Aircall recommends
  // upserting on call.id (data.id) rather than inserting per event.
  if (event.startsWith('call.')) {
    return handleCallEvent(event, data);
  }

  // Message events (SMS / MMS / WhatsApp). Native messaging mode only —
  // numbers in Proxy mode post to a configured callbackUrl instead.
  if (event.startsWith('message.') || event.startsWith('group_message.')) {
    return handleMessageEvent(event, data);
  }

  // User events. Prefer the .v2 variants — V1 is deprecated.
  if (event.startsWith('user.')) {
    return handleUserEvent(event, data);
  }

  switch (event) {
    case 'number.created':
    case 'number.deleted':
      console.log(`📞 Number ${event.split('.')[1]}: ${data.name} (${data.digits})`);
      return;

    case 'number.opened':
    case 'number.closed':
      // Business hours transition
      console.log(
        `🕒 Number ${data.name} is now ${data.open ? 'open' : 'closed'} (${data.time_zone})`
      );
      return;

    case 'contact.created':
    case 'contact.updated':
    case 'contact.deleted':
      // Note: contact payloads use UTC strings for created_at / updated_at
      console.log(
        `👤 Contact ${event.split('.')[1]}: ${data.first_name ?? ''} ${data.last_name ?? ''} (id=${data.id})`
      );
      return;

    case 'integration.deleted':
      // OAuth integrations only — mirror the uninstall on your side.
      console.log(
        `🔌 Integration ${data.integration_id} deleted for company ${data.company_id}`
      );
      return;

    // Conversation Intelligence (some require the AI Assist add-on)
    case 'transcription.created':
    case 'summary.created':
    case 'topics.created':
    case 'sentiment.created':
    case 'action_item.created':
    case 'playbook_result.created':
    case 'playbook_result.updated':
    case 'realtime_transcription.utterances_received':
    case 'custom_summary.result_created':
    case 'custom_summary.result_updated':
    case 'call_evaluation.created':
    case 'call_evaluation.updated':
      console.log(`🧠 Conversation intelligence: ${event} (call_id=${data.call_id ?? data.id})`);
      return;

    // AI Voice Agent
    case 'ai_voice_agent.started':
    case 'ai_voice_agent.ended':
    case 'ai_voice_agent.escalated':
    case 'ai_voice_agent.summary':
      console.log(`🤖 AI voice agent: ${event}`);
      return;

    // Analytics report exports
    case 'analytics.report_created':
      console.log(`📊 Analytics report ready: ${data.download_url ? '(download URL issued)' : ''}`);
      return;

    case 'analytics.report_failed':
      console.error('📊 Analytics report failed');
      return;

    default:
      // Forward-compatibility: log unknown events rather than failing.
      console.log(`❓ Unhandled Aircall event "${event}" (resource=${resource})`);
  }
}

function handleCallEvent(event, data) {
  // Upsert key — the same call id appears across its whole lifecycle.
  const callId = data.id;

  switch (event) {
    case 'call.created':
      console.log(
        `📲 Call ${callId} created (${data.direction}) from ${data.raw_digits} — uuid=${data.call_uuid}`
      );
      break;

    case 'call.ringing_on_agent':
      console.log(`🔔 Call ${callId} ringing on agent ${data.user?.name ?? 'unknown'}`);
      break;

    case 'call.agent_declined':
      console.log(`🚫 Call ${callId} declined by ${data.user?.name ?? 'unknown'}`);
      break;

    case 'call.answered':
      console.log(`✅ Call ${callId} answered at ${data.answered_at}`);
      break;

    case 'call.hold':
    case 'call.unhold':
      console.log(`⏸️  Call ${callId} ${event === 'call.hold' ? 'on hold' : 'resumed'}`);
      break;

    case 'call.transferred':
    case 'call.external_transferred':
      console.log(`↪️  Call ${callId} transferred (${event})`);
      break;

    case 'call.unsuccessful_transfer':
      console.log(`⚠️  Call ${callId} transfer failed`);
      break;

    case 'call.hungup':
      console.log(`📴 Call ${callId} hung up — cause=${data.hangup_cause}`);
      break;

    case 'call.ended':
      console.log(
        `🏁 Call ${callId} ended — duration=${data.duration}s cost=${data.cost} missed=${data.missed_call_reason ?? 'no'}`
      );
      break;

    case 'call.voicemail_left':
      console.log(`📼 Voicemail left on call ${callId}: ${data.voicemail_short_url ?? ''}`);
      break;

    case 'call.comm_assets_generated':
      console.log(`🎙️  Assets ready for call ${callId}: recording=${data.recording ?? 'none'}`);
      break;

    case 'call.ivr_option_selected':
      console.log(`☎️  IVR option selected on call ${callId}`);
      break;

    case 'call.assigned':
      console.log(`📌 Call ${callId} assigned to ${data.user?.name ?? 'unknown'}`);
      break;

    case 'call.archived':
      console.log(`🗄️  Call ${callId} archived`);
      break;

    case 'call.tagged':
    case 'call.untagged':
      console.log(
        `🏷️  Call ${callId} ${event === 'call.tagged' ? 'tagged' : 'untagged'}:`,
        (data.tags ?? []).map((t) => t.name).join(', ') || '(none)'
      );
      break;

    case 'call.commented':
      console.log(`💬 Comment added to call ${callId}`);
      break;

    default:
      console.log(`❓ Unhandled call event "${event}" for call ${callId}`);
  }
}

function handleMessageEvent(event, data) {
  // `channel` is null for SMS/MMS, "whatsapp" for WhatsApp.
  const channel = data.channel ?? 'sms/mms';

  switch (event) {
    case 'message.sent':
      console.log(`📤 Message ${data.id} sent via ${channel}`);
      break;

    case 'message.received':
      console.log(`📥 Message ${data.id} received via ${channel}: "${data.body ?? ''}"`);
      break;

    case 'message.status_updated':
      console.log(`📬 Message ${data.id} status: ${data.status}`);
      break;

    case 'group_message.sent':
      console.log(
        `📤 Group message ${data.id} sent to conversation ${data.group_conversation_id} (${(data.participants ?? []).length} participants)`
      );
      break;

    case 'group_message.received':
      console.log(
        `📥 Group message ${data.id} received from ${data.external_number} in ${data.group_conversation_id}`
      );
      break;

    case 'group_message.status_updated':
      console.log(`📬 Group message ${data.id} status: ${data.status}`);
      break;

    default:
      console.log(`❓ Unhandled message event "${event}"`);
  }
}

function handleUserEvent(event, data) {
  // Strip the ".v2" suffix so V1 and V2 share handling. Use V2 in new
  // integrations — Aircall has deprecated the V1 user events.
  const base = event.replace(/\.v2$/, '');
  const isV2 = event.endsWith('.v2');
  const who = data.name ?? data.email ?? `user ${data.id}`;

  switch (base) {
    case 'user.created':
      console.log(`👋 User created: ${who}${isV2 ? '' : ' (V1 — migrate to .v2)'}`);
      break;

    case 'user.deleted':
      console.log(`👋 User deleted: ${who}`);
      break;

    case 'user.connected':
      console.log(`🟢 ${who} opened Aircall Workspace`);
      break;

    case 'user.disconnected':
      console.log(`⚪ ${who} closed Aircall Workspace`);
      break;

    case 'user.opened':
      console.log(`🟢 ${who} is available`);
      break;

    case 'user.closed':
      // Heads-up: with substatus enabled, TWO user.closed events arrive —
      // one with availability_status only, one with the selected substatus.
      // They are not duplicates.
      console.log(
        `🔴 ${who} is unavailable (status=${data.availability_status ?? '?'}, substatus=${data.substatus ?? 'n/a'})`
      );
      break;

    case 'user.wut_start':
      console.log(`⏱️  ${who} started wrap-up time`);
      break;

    case 'user.wut_end':
      console.log(`⏱️  ${who} finished wrap-up time`);
      break;

    default:
      console.log(`❓ Unhandled user event "${event}"`);
  }
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).send('Invalid JSON');
  }
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server (skipped during tests)
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Aircall webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/aircall`);
    if (!process.env.AIRCALL_WEBHOOK_TOKEN) {
      console.warn('⚠️  Warning: AIRCALL_WEBHOOK_TOKEN not set');
    }
  });
}

module.exports = { app, server, verifyAircallWebhook };
