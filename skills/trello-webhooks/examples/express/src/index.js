// Generated with: trello-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Trello webhook signature.
 *
 * Trello signs base64(HMAC-SHA1(rawBody + callbackURL, applicationSecret)) and
 * sends it in the `x-trello-webhook` header. The callback URL is concatenated to
 * the raw body exactly as it was registered when the webhook was created.
 *
 * @param {Buffer|string} rawBody - Raw request body (unparsed)
 * @param {string} signature - x-trello-webhook header value
 * @param {string} secret - Trello OAuth 1.0 application secret
 * @param {string} callbackURL - Exact callback URL registered for the webhook
 * @returns {boolean} Whether the signature is valid
 */
function verifyTrelloWebhook(rawBody, signature, secret, callbackURL) {
  if (!signature) return false;
  const content = Buffer.concat([Buffer.from(rawBody), Buffer.from(callbackURL)]);
  const expected = crypto.createHmac('sha1', secret).update(content).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}

// When a webhook is created, Trello sends a HEAD request to the callback URL and
// creation fails unless it returns 200. HEAD carries no body or signature.
app.head('/webhooks/trello', (req, res) => {
  res.sendStatus(200);
});

// Trello webhook endpoint - must use the raw body for signature verification.
app.post(
  '/webhooks/trello',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-trello-webhook'];

    // Verify webhook signature against the raw body + registered callback URL.
    if (
      !verifyTrelloWebhook(
        req.body,
        signature,
        process.env.TRELLO_SECRET,
        process.env.TRELLO_CALLBACK_URL
      )
    ) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification.
    const payload = JSON.parse(req.body.toString('utf8'));
    const action = payload.action || {};
    const type = action.type;

    console.log(`Received Trello action: ${type}`);

    // The event name is action.type (there is no event header).
    switch (type) {
      case 'createCard':
        console.log('New card:', action.data?.card?.name);
        // TODO: Sync new card, trigger automation, etc.
        break;

      case 'updateCard':
        console.log('Card updated:', action.data?.card?.name);
        // TODO: Inspect action.data.old / listBefore / listAfter for the change.
        break;

      case 'deleteCard':
        console.log('Card deleted from board:', action.data?.board?.name);
        // TODO: Clean up linked records.
        break;

      case 'commentCard':
        console.log('Comment added:', action.data?.text);
        // TODO: Notify stakeholders, log discussion.
        break;

      case 'addAttachmentToCard':
        console.log('Attachment added:', action.data?.attachment?.name);
        // TODO: Ingest file, scan link.
        break;

      case 'addMemberToCard':
        console.log('Member added to card:', action.data?.idMember);
        // TODO: Notify the assignee.
        break;

      case 'createList':
        console.log('New list:', action.data?.list?.name);
        // TODO: Mirror board structure.
        break;

      case 'updateList':
        console.log('List updated:', action.data?.list?.name);
        // TODO: Keep column mappings in sync.
        break;

      case 'addMemberToBoard':
        console.log('Member added to board:', action.data?.idMemberAdded);
        // TODO: Provision access.
        break;

      case 'removeMemberFromBoard':
        console.log('Member removed from board:', action.data?.idMember);
        // TODO: Deprovision access.
        break;

      case 'updateBoard':
        console.log('Board updated:', action.data?.board?.name);
        // TODO: Update cached metadata.
        break;

      default:
        console.log(`Unhandled action type: ${type}`);
    }

    // Acknowledge quickly; do heavy work asynchronously.
    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyTrelloWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/trello`);
  });
}
