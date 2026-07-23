# Microsoft Graph Webhooks - FastAPI Example

Minimal example of receiving Microsoft Graph change notifications (webhooks) with
the endpoint validation handshake and `clientState` verification, using FastAPI.

## Prerequisites

- Python 3.10+
- A Microsoft Entra app registration with permission to your resource
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local dev)

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `MICROSOFT_GRAPH_CLIENT_STATE` to the opaque secret you'll pass as
   `clientState` when creating the subscription.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward Microsoft Graph notifications to your local server (no account needed)
npx hookdeck-cli listen 8000 microsoft-graph --path /webhooks/microsoft-graph
```

Use the printed HTTPS URL as `NOTIFICATION_URL`, then create a subscription:

```bash
python subscribe.py
```

Graph immediately calls your endpoint with `?validationToken=...`; the handler
echoes it back so the subscription is created. Trigger a change on the resource
to receive a notification.

### Renew a subscription

```bash
python subscribe.py renew <subscription-id>
```

### Run Unit Tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/microsoft-graph` — Answers the `validationToken` handshake,
  verifies `clientState`, and dispatches `created`/`updated`/`deleted` change
  notifications and `reauthorizationRequired`/`subscriptionRemoved`/`missed`
  lifecycle events.
