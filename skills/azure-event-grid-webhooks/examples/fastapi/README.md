# Azure Event Grid Webhooks - FastAPI Example

Minimal example of receiving Azure Event Grid deliveries with FastAPI: both
endpoint-validation handshakes, the `aeg-subscription-name` identity guard, and
channel authentication via a static delivery-property header, a query-parameter
client secret, or a Microsoft Entra ID bearer token.

**There is no signature to verify.** Event Grid does not sign the request body —
no HMAC, no signing secret, no signature header. If you were looking for
`hmac.new`, it isn't here on purpose. The only use of `hmac` in this example is
`hmac.compare_digest` as a constant-time string comparison for the shared secret.

## Prerequisites

- Python 3.10+
- An Azure Event Grid topic and an event subscription pointing at your endpoint
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AZURE_EVENT_GRID_SUBSCRIPTION_NAMES` to the `--name` of the event
   subscription you created, and configure one channel-authentication mode:
   - `AZURE_EVENT_GRID_DELIVERY_SECRET` (plus
     `AZURE_EVENT_GRID_DELIVERY_SECRET_HEADER`) for a static delivery property,
   - `AZURE_EVENT_GRID_QUERY_SECRET` (plus
     `AZURE_EVENT_GRID_QUERY_SECRET_PARAM`) for a query-parameter client secret, or
   - `AZURE_EVENT_GRID_ENTRA_TENANT_ID` + `AZURE_EVENT_GRID_ENTRA_AUDIENCE` for a
     Microsoft Entra ID protected endpoint.

   There is **no signing secret** — nothing above is an HMAC key.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/azure-event-grid`. The same path also
answers `OPTIONS` for the CloudEvents v1.0 abuse-protection preflight.

Event Grid only delivers to **HTTPS** endpoints, so expose a tunnel (e.g.
[Hookdeck](https://hookdeck.com) or `ngrok`) rather than pointing a subscription
at `localhost`.

## Test

```bash
pytest
```

The suite exercises both handshakes, the identity guard, all three channel
authentication modes (including real RS256 tokens signed by a throwaway key),
secret rotation, and Event Grid array vs CloudEvents object normalisation.

## What to expect

| Request | Response |
| --- | --- |
| `OPTIONS` with `WebHook-Request-Origin` | `200` + `WebHook-Allowed-Origin` |
| `POST` array containing `Microsoft.EventGrid.SubscriptionValidationEvent` | `200` `{"validationResponse": "<code>"}` |
| `POST` array of Event Grid schema events | `200` `{"received": n}` |
| `POST` single CloudEvents v1.0 object | `200` `{"received": 1}` |
| Unrecognised `aeg-subscription-name` | `403` |
| Bad or missing delivery credential | `401` |

The validation response **must** be `200` — Event Grid explicitly does not
accept `202` for the handshake, even though `202` is a valid ack for ordinary
deliveries.
