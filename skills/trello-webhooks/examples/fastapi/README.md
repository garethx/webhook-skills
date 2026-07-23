# Trello Webhooks - FastAPI Example

Minimal example of receiving Trello webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- A Trello Power-Up with an OAuth 1.0 application secret ([API Key tab](https://trello.com/power-ups/admin))

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your Trello application secret (`TRELLO_SECRET`) and the exact
   `TRELLO_CALLBACK_URL` you will register to `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 trello --path /webhooks/trello
```

The CLI prints a public URL. Register it as the `callbackURL` when you create the
Trello webhook, and set the same value as `TRELLO_CALLBACK_URL` so signatures verify.

### Run the tests

```bash
pytest test_webhook.py -v
```

## Endpoints

- `POST /webhooks/trello` - Receives and verifies Trello webhook events
- `HEAD /webhooks/trello` - Answers the Trello creation validation check with `200`
- `GET /health` - Health check
