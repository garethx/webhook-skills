# TikTok Webhooks Overview

## What Are TikTok Webhooks?

TikTok for Developers (developers.tiktok.com) sends webhooks to notify your app
when something happens on a user's connected account — a user deauthorizes your
app, a video you uploaded finishes publishing, or a data-portability export is
ready. Notifications are delivered as **HTTPS POST requests with a JSON body** to
the callback URL you register in the developer portal.

> **This is not TikTok Shop.** TikTok Shop webhooks come from a separate partner
> portal, use an `Authorization`-header HMAC (no timestamp), and have their own
> event catalog. Use
> [tiktok-shop-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/tiktok-shop-webhooks)
> for those.

## Common Event Types

TikTok for Developers currently defines exactly **four** webhook events. Use
these strings verbatim — there is no `video.publish.failed`, and the completed
event ends in `.completed`, not `.complete`.

| Event | Triggered When | `content` fields | Common Use Cases |
|-------|----------------|------------------|------------------|
| `authorization.removed` | A user deauthorizes your app. The access token is revoked *before* this callback arrives. | `reason` (int 0–5) | Purge stored tokens, stop syncing, mark the connection revoked |
| `video.upload.failed` | A video uploaded via Video Kit / Content Posting fails to upload to TikTok. | `share_id` (string) | Surface the failure to the user, retry, alert |
| `video.publish.completed` | A video uploaded via Video Kit / Content Posting is published by the user. | `share_id` (string) | Mark the post live, record the published video, notify |
| `portability.download.ready` | Data requested via the Data Portability API has entered the `downloading` state and can be fetched. | `request_id` (int64) | Kick off the download, notify the requesting user |

### `authorization.removed` reason codes

The `reason` field inside `content` explains the deauthorization:

| Code | Meaning |
|------|---------|
| `0` | Unknown |
| `1` | User disconnected the app |
| `2` | Account deleted |
| `3` | Age change |
| `4` | Account banned |
| `5` | Developer revoked the authorization |

## Event Payload Structure

Every event shares the same envelope:

```json
{
  "client_key": "awx4example",
  "event": "video.publish.completed",
  "create_time": 1633174587,
  "user_openid": "0f9c1e2b-...",
  "content": "{\"share_id\":\"video.7107xxxxxxxxxxxxxxx\"}"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `client_key` | string | Your app's client key. Confirm it matches your app. |
| `event` | string | One of the four event names above. |
| `create_time` | int64 | UTC epoch **seconds** when the event was created. |
| `user_openid` | string | The TikTok user's open ID. **Absent** on `portability.download.ready`. |
| `content` | string | A **serialized JSON string** — parse it separately (`JSON.parse(payload.content)`). |

### Gotcha: `content` is a string, not an object

`content` is delivered as an escaped JSON string, not a nested object. Parse the
envelope first, then parse `content`:

```javascript
const payload = JSON.parse(rawBody);          // envelope
const content = JSON.parse(payload.content);  // { share_id: "video.71..." }
```

## Delivery & Retries

- Delivery is **at-least-once** (best effort). The same event may arrive more
  than once — make handlers **idempotent** (dedupe on a stable key such as
  `event` + `user_openid` + `create_time`, or `content.share_id`).
- If your endpoint does not return a `200` quickly, TikTok **retries for up to 72
  hours using exponential backoff**.
- Return `200` as soon as the signature checks out; do slow work asynchronously.

## Full Event Reference

- [Webhooks overview](https://developers.tiktok.com/doc/webhooks-overview)
- [Webhooks events](https://developers.tiktok.com/doc/webhooks-events)
- [Webhooks verification](https://developers.tiktok.com/doc/webhooks-verification)
