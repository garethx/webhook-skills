// Generated with: microsoft-graph-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Create (and renew) a Microsoft Graph subscription with the official SDK.
// The SDK manages subscriptions only — it does NOT verify notifications.
//
// Usage:
//   node src/subscribe.js            # create a subscription
//   node src/subscribe.js renew <id> # renew an existing subscription
//
// Requires (in .env): MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID,
// MICROSOFT_CLIENT_SECRET, NOTIFICATION_URL, MICROSOFT_GRAPH_CLIENT_STATE,
// and optionally GRAPH_RESOURCE, GRAPH_CHANGE_TYPES.

require('dotenv').config();
const { Client } = require('@microsoft/microsoft-graph-client');

// Client-credentials token provider (no extra auth library needed).
async function getAccessToken() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    { method: 'POST', body: params }
  );
  if (!resp.ok) {
    throw new Error(`Token request failed: ${resp.status} ${await resp.text()}`);
  }
  return (await resp.json()).access_token;
}

function graphClient() {
  return Client.init({
    authProvider: (done) => {
      getAccessToken()
        .then((token) => done(null, token))
        .catch((err) => done(err, null));
    },
  });
}

// Outlook mail with resource data maxes out ~1 day; use a safe window here.
function expiryFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function createSubscription() {
  const client = graphClient();
  const subscription = await client.api('/subscriptions').post({
    changeType: process.env.GRAPH_CHANGE_TYPES || 'created,updated',
    notificationUrl: process.env.NOTIFICATION_URL,
    lifecycleNotificationUrl: process.env.NOTIFICATION_URL,
    // App-only (client credentials) auth cannot use /me — target a specific
    // user. For delegated auth you could use 'me/messages' instead.
    resource: process.env.GRAPH_RESOURCE || `users/${process.env.GRAPH_USER_ID}/messages`,
    expirationDateTime: expiryFromNow(60), // renew before this passes
    clientState: process.env.MICROSOFT_GRAPH_CLIENT_STATE,
    latestSupportedTlsVersion: 'v1_2',
  });
  console.log('Created subscription:', subscription.id);
  return subscription;
}

async function renewSubscription(id) {
  const client = graphClient();
  const updated = await client.api(`/subscriptions/${id}`).patch({
    expirationDateTime: expiryFromNow(60),
  });
  console.log('Renewed subscription:', updated.id, 'until', updated.expirationDateTime);
  return updated;
}

if (require.main === module) {
  const [command, id] = process.argv.slice(2);
  const run = command === 'renew' ? renewSubscription(id) : createSubscription();
  run.catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { createSubscription, renewSubscription };
