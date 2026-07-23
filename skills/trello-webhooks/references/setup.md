# Setting Up Trello Webhooks

Trello webhooks are created **through the REST API only** — there is no dashboard
switch. Each webhook watches a single model (`idModel`) and delivers to a `callbackURL`.

## Prerequisites

- A Trello account and a **Power-Up** (app) in the
  [Power-Up admin portal](https://trello.com/power-ups/admin).
- Your **API key** and **OAuth 1.0 application secret** (both on the Power-Up's
  **API Key** tab).
- An **API token** authorizing your key to act for a Trello user.
- A publicly reachable HTTPS `callbackURL` that:
  - returns **`200`** to an HTTP **`HEAD`** request, and
  - has a **valid SSL certificate** (an invalid cert blocks creation; a missing
    cert does not).

## Get Your Secret

1. Go to the [Power-Up admin portal](https://trello.com/power-ups/admin) and open (or
   create) your Power-Up.
2. Open the **API Key** tab.
3. Copy the **API key** and the **OAuth1.0 secret** (this secret is what signs
   webhooks — set it as `TRELLO_SECRET`).

## Get an API Token

Authorize your API key for a user (this token identifies whose boards/cards you can
watch). Direct the user to:

```
https://trello.com/1/authorize?expiration=never&scope=read&response_type=token&key=YOUR_API_KEY
```

The returned token is used in the webhook creation URL below.

## Register Your Endpoint

Find the `idModel` — the ID of the board, card, or list you want to watch. For a board,
open it and append `.json` to the URL, or call
`GET https://api.trello.com/1/boards/{boardId}?key=...&token=...` and read `id`.

Create the webhook:

```bash
curl -X POST "https://api.trello.com/1/tokens/{token}/webhooks/" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "YOUR_API_KEY",
    "callbackURL": "https://example.com/webhooks/trello",
    "idModel": "ID_OF_BOARD_CARD_OR_LIST",
    "description": "My Trello webhook"
  }'
```

On success Trello returns the webhook object (with its `id`). **At this moment Trello
sends an HTTP `HEAD` request to `callbackURL`; if it does not receive `200`, creation
fails** with `HTTP 400 "URL (…) did not return 200 status code, got …"`.

> **Keep the callback URL exact.** The URL you register here is concatenated to the
> request body when Trello signs each delivery. Verify against the *identical* string
> (`TRELLO_CALLBACK_URL`) — including scheme, host, path, and any query string.

## Manage Webhooks

```bash
# List webhooks for a token
curl "https://api.trello.com/1/tokens/{token}/webhooks/?key=YOUR_API_KEY"

# Delete a webhook
curl -X DELETE "https://api.trello.com/1/webhooks/{webhookId}?key=YOUR_API_KEY&token={token}"
```

## Testing Locally

Use the Hookdeck CLI to receive real webhooks on your machine (no account required):

```bash
npx hookdeck-cli listen 3000 trello --path /webhooks/trello
```

The CLI prints a public URL. Register **that** URL as your `callbackURL` and set the
same value as `TRELLO_CALLBACK_URL` so signatures verify. Because Hookdeck answers the
`HEAD` check and forwards deliveries, you get the real signed payloads locally.

## Reference

- [Trello webhooks guide](https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/)
- [Trello REST API: webhooks](https://developer.atlassian.com/cloud/trello/rest/api-group-webhooks/)
