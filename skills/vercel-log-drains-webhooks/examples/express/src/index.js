// Generated with: vercel-log-drains-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Vercel Log Drain signature.
 *
 * Vercel signs the RAW request body with HMAC-SHA1 keyed on the drain's
 * signature secret and sends the hex digest in `x-vercel-signature`
 * (no `sha1=` prefix).
 *
 * @param {Buffer} rawBody - Raw request body (never re-serialized JSON)
 * @param {string} signatureHeader - x-vercel-signature header value
 * @param {string} secret - Drain signature secret
 * @returns {boolean} Whether the signature is valid
 */
function verifyVercelSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; guard against length/format mismatch (throws)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Parse a batch of log entries. Vercel delivers either a JSON array
 * (`[{…},{…}]`) or NDJSON (one JSON object per line), depending on the
 * drain's configured encoding.
 *
 * @param {Buffer} rawBody - Raw request body
 * @returns {Array<object>} Parsed log entries
 */
function parseLogs(rawBody) {
  const text = rawBody.toString('utf8').trim();
  if (!text) {
    return [];
  }
  if (text.startsWith('[')) {
    return JSON.parse(text); // JSON array encoding
  }
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line)); // NDJSON encoding
}

/**
 * Dispatch a single log entry based on its `source`. Log drains have no named
 * event types — `source` is the dispatch dimension.
 */
function handleLogEntry(log) {
  switch (log.source) {
    case 'lambda':
      console.log(`[lambda] ${log.level} ${log.statusCode ?? ''} ${log.path ?? ''}: ${log.message ?? ''}`);
      // TODO: forward function logs / errors to your observability stack
      break;

    case 'edge':
      console.log(`[edge] ${log.level} ${log.path ?? ''}: ${log.message ?? ''}`);
      // TODO: analyze edge/middleware behavior
      break;

    case 'build':
      console.log(`[build] ${log.level} (${log.buildId ?? 'n/a'}): ${log.message ?? ''}`);
      // TODO: capture build output, detect failures
      break;

    case 'static':
      console.log(`[static] ${log.statusCode ?? ''} ${log.path ?? ''}`);
      // TODO: track static asset access
      break;

    case 'external':
      console.log(`[external] ${log.destination ?? ''} ${log.path ?? ''}`);
      // TODO: monitor external rewrites
      break;

    case 'firewall':
      console.log(`[firewall] ${log.proxy?.wafAction ?? 'denied'} ${log.proxy?.clientIp ?? ''} ${log.path ?? ''}`);
      // TODO: alert on blocked/attack traffic
      break;

    case 'redirect':
      console.log(`[redirect] ${log.path ?? ''} -> ${log.destination ?? ''}`);
      // TODO: audit redirect rules
      break;

    default:
      console.log(`[${log.source ?? 'unknown'}] ${log.message ?? ''}`);
  }

  // A statusCode of -1 means the lambda crashed with no response
  if (log.statusCode === -1) {
    console.warn(`Lambda crashed (no response): request ${log.requestId ?? 'unknown'}`);
  }
}

// Log drain endpoint — must use the RAW body for signature verification.
// Use type: '*/*' so both JSON and NDJSON deliveries are captured as a Buffer.
app.post(
  '/webhooks/vercel-log-drains',
  express.raw({ type: '*/*' }),
  (req, res) => {
    // Always echo the verification token so the create/test handshake succeeds.
    if (process.env.VERCEL_VERIFY) {
      res.setHeader('x-vercel-verify', process.env.VERCEL_VERIFY);
    }

    const signature = req.headers['x-vercel-signature'];

    // The create/test probe is unsigned. Treat a missing signature as the
    // handshake: acknowledge with 200 and do not process logs.
    if (!signature) {
      return res.status(200).json({ received: true, handshake: true });
    }

    // Verify signed deliveries against the raw body.
    if (!verifyVercelSignature(req.body, signature, process.env.VERCEL_LOG_DRAIN_SECRET)) {
      console.error('Vercel log drain signature verification failed');
      return res
        .status(403)
        .json({ code: 'invalid_signature', error: "signature didn't match" });
    }

    // Parse the batch only after verification succeeds.
    let logs;
    try {
      logs = parseLogs(req.body);
    } catch (err) {
      console.error('Failed to parse log batch:', err.message);
      return res.status(400).json({ error: 'Invalid log payload' });
    }

    console.log(`Received ${logs.length} log entr${logs.length === 1 ? 'y' : 'ies'}`);
    for (const log of logs) {
      handleLogEntry(log);
    }

    // Acknowledge receipt.
    return res.status(200).json({ received: true, count: logs.length });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyVercelSignature, parseLogs };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/vercel-log-drains`);
  });
}
