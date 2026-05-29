# Standard Webhooks - FastAPI Example

Minimal FastAPI example of receiving webhooks that follow the [Standard Webhooks](https://www.standardwebhooks.com/) specification, verified with the official `standardwebhooks` PyPI package.

## Prerequisites

- Python 3.9+
- A Standard Webhooks signing secret (`whsec_...`) from your provider

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your signing secret to `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 with the webhook endpoint at `POST /webhooks/standard`.

## Test

```bash
pytest test_webhook.py -v
```

Tests generate real Standard Webhooks signatures locally using the same HMAC-SHA256 algorithm the spec defines.

## Local Tunnel

To receive live webhooks on `localhost`:

```bash
npx hookdeck-cli listen 8000 standard --path /webhooks/standard
```
