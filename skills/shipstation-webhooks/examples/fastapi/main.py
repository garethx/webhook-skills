# Generated with: shipstation-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import os
import re
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

# V1 resource_url hosts are reportedly numbered (ssapi1/ssapi2.shipstation.com),
# so match a pattern rather than a single fixed hostname.
SHIPSTATION_HOST_RE = re.compile(r"ssapi\d*\.shipstation\.com")

# ShipStation V1 events (the resource_type field on every delivery)
EVENTS = {
    "ORDER_NOTIFY",
    "ITEM_ORDER_NOTIFY",
    "SHIP_NOTIFY",
    "ITEM_SHIP_NOTIFY",
    "FULFILLMENT_SHIPPED",
    "FULFILLMENT_REJECTED",
}


def verify_token(provided: str | None, expected: str | None) -> bool:
    """ShipStation V1 has NO signature. Compare the ?token= query param against
    the configured secret, timing-safe."""
    if not provided or not expected:
        return False
    return hmac.compare_digest(provided, expected)


async def fetch_resource(resource_url: str):
    """Fetch the thin payload's resource_url with HTTP Basic auth.
    Only ShipStation's own host is ever requested (SSRF guard)."""
    key = os.environ.get("SHIPSTATION_API_KEY")
    secret = os.environ.get("SHIPSTATION_API_SECRET")
    if not key or not secret:
        return None  # no credentials configured — skip fetch

    host = urlparse(resource_url).hostname or ""
    if not SHIPSTATION_HOST_RE.fullmatch(host):
        raise ValueError(f"Refusing to fetch non-ShipStation host: {resource_url}")

    async with httpx.AsyncClient() as client:
        res = await client.get(resource_url, auth=(key, secret))
        if res.status_code == 429:
            # V1 rate limit: 40 req/min per key
            reset = res.headers.get("X-Rate-Limit-Reset")
            raise RuntimeError(f"Rate limited; reset in {reset}s")
        res.raise_for_status()
        return res.json()


@app.post("/webhooks/shipstation")
async def shipstation_webhook(request: Request):
    # 1. Verify the secret token from the query string
    token = request.query_params.get("token")
    if not verify_token(token, os.environ.get("SHIPSTATION_WEBHOOK_SECRET")):
        return Response(content="Invalid or missing webhook token", status_code=401)

    # 2. Thin payload: { resource_url, resource_type }
    try:
        body = await request.json()
    except Exception:
        return Response(content="Invalid JSON", status_code=400)

    resource_url = body.get("resource_url")
    resource_type = body.get("resource_type")
    if not resource_type or not resource_url:
        return Response(content="Missing resource_type or resource_url", status_code=400)

    # 3. Dispatch on the event type
    if resource_type in ("ORDER_NOTIFY", "ITEM_ORDER_NOTIFY"):
        print(f"New order(s) imported: {resource_url}")
        # TODO: sync orders into your system
    elif resource_type in ("SHIP_NOTIFY", "ITEM_SHIP_NOTIFY"):
        print(f"Order(s) shipped: {resource_url}")
        # TODO: send tracking notifications, mark fulfilled
    elif resource_type == "FULFILLMENT_SHIPPED":
        print(f"Fulfillment shipped: {resource_url}")
        # TODO: update fulfillment status
    elif resource_type == "FULFILLMENT_REJECTED":
        print(f"Fulfillment rejected: {resource_url}")
        # TODO: handle rejected fulfillment
    else:
        print(f"Unhandled resource_type: {resource_type}")

    # 4. Fetch the real data from resource_url (authenticated). Never let a
    # downstream fetch error turn into a 500 — the request is already validated.
    try:
        resource = await fetch_resource(resource_url)
        if resource is not None:
            print(f"Fetched resource for {resource_type}")
            # TODO: process `resource` idempotently (dedupe on order/shipment id)
    except Exception as err:
        print(f"Resource fetch failed: {err}")

    # 5. Acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
