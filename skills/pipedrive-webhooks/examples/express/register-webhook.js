// Generated with: pipedrive-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Optional helper: register a Pipedrive webhook via the official SDK.
// Usage: node register-webhook.js
//
// Requires these env vars (see .env.example):
//   PIPEDRIVE_API_TOKEN, PIPEDRIVE_SUBSCRIPTION_URL,
//   PIPEDRIVE_WEBHOOK_USER, PIPEDRIVE_WEBHOOK_PASSWORD
require('dotenv').config();
const { Configuration, WebhooksApi } = require('pipedrive/v1');

async function main() {
  const config = new Configuration({ apiKey: process.env.PIPEDRIVE_API_TOKEN });
  const webhooks = new WebhooksApi(config);

  const { data } = await webhooks.addWebhook({
    AddWebhookRequest: {
      subscription_url: process.env.PIPEDRIVE_SUBSCRIPTION_URL,
      event_action: '*', // create | change | delete | *
      event_object: 'deal', // deal | person | activity | ... | *
      http_auth_user: process.env.PIPEDRIVE_WEBHOOK_USER,
      http_auth_password: process.env.PIPEDRIVE_WEBHOOK_PASSWORD,
      version: '2.0',
    },
  });

  console.log('Webhook created:', JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('Failed to create webhook:', err.message);
  process.exit(1);
});
