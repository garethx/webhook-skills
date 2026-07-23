# Nuvemshop Webhooks - FastAPI Example

Minimal example of receiving Nuvemshop (Tiendanube) webhooks with signature
verification using FastAPI.

## Prerequisites

- Python 3.9+
- A Nuvemshop app with its **Client secret** (from the Partners Portal)

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

4. Add your Nuvemshop app client secret to `.env` as `NUVEMSHOP_CLIENT_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the test suite (generates real `x-linkedstore-hmac-sha256` signatures):

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account needed)
npx hookdeck-cli listen 8000 nuvemshop --path /webhooks/nuvemshop
```

Then register a webhook against the Nuvemshop API pointing at the tunnel's HTTPS
URL (webhook URLs must be HTTPS).

## Endpoint

- `POST /webhooks/nuvemshop` - Receives and verifies Nuvemshop webhook events
