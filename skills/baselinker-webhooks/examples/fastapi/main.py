# Generated with: baselinker-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
from typing import Any, Dict, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Response

load_dotenv()

# BaseLinker (Base.com) is NOT a normal webhook source:
#
#   1. Deliveries are HTTP HEAD requests. A HEAD request has NO BODY by
#      definition — never `await request.json()` / `await request.body()`, and
#      never declare a Pydantic body model on this route.
#   2. The entire payload is in the QUERY STRING (typed query args below, or
#      request.query_params). Query values are always STRINGS: coerce numerics
#      explicitly and never assume a param is present. Observed params are
#      `order_id` (e.g. 42) and `state` (e.g. "packed") — observed examples, NOT
#      a documented or exhaustive list.
#   3. There is NO signature verification. No HMAC, no signature header, no
#      timestamp/replay check, no shared secret, no handshake. Do not write a
#      verifier — there is nothing to verify with.
#
# Note: X-BLToken is BaseLinker's REQUEST auth header for YOUR outbound calls to
# api.baselinker.com. It is not a webhook signature and never arrives inbound.

app = FastAPI(title="BaseLinker Webhook Handler")


def verify_url_token(provided: Optional[str], expected: Optional[str]) -> bool:
    """
    Check the token YOU appended to the endpoint URL.

    This is NOT a BaseLinker signature — BaseLinker signs nothing. It is your own
    secret round-tripped back to you in the query string, so it is visible in the
    URL and in proxy logs. Returns True when no token is configured.
    """
    if not expected:
        return True  # not configured — nothing to check
    if not provided:
        return False
    # Compare BYTES, not str: hmac.compare_digest() raises TypeError on str
    # values containing non-ASCII characters, and the token is attacker-supplied.
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


def parse_order_id(raw_order_id: Optional[str]) -> Optional[int]:
    """
    Coerce the `order_id` query param.

    Query values are ALWAYS strings, so convert explicitly and validate — never
    assume the param is present or numeric.
    """
    if raw_order_id is None:
        return None
    try:
        order_id = int(raw_order_id)
    except ValueError:
        return None
    return order_id if order_id > 0 else None


async def fetch_order(order_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetch the authoritative order from the documented BaseLinker API.

    The HEAD delivery carries no body and no proof of origin, so it tells you
    THAT something changed, not WHAT — treat it as an untrusted hint. X-BLToken
    is the request auth header here (outbound only).
    """
    token = os.getenv("BASELINKER_API_TOKEN")
    if not token:
        return None

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.baselinker.com/connector.php",
            headers={"X-BLToken": token},
            data={
                "method": "getOrders",
                "parameters": json.dumps({"order_id": order_id}),
            },
        )
    return response.json()


# HEAD, not POST — BaseLinker only ever sends HEAD requests. The payload arrives
# as typed QUERY arguments; there is no request body to declare.
#
# They are typed `str`, not `int`, on purpose: an `int` annotation makes FastAPI
# answer a non-numeric value with a 422 whose body is JSON — and a HEAD response
# must not carry a body. Coerce explicitly instead.
@app.head("/webhooks/baselinker")
async def handle_baselinker_webhook(
    order_id: Optional[str] = None,
    state: Optional[str] = None,
    token: Optional[str] = None,
) -> Response:
    """Handle a BaseLinker HEAD callback and acknowledge it with a bodyless 200."""
    # Optional URL-token check (see verify_url_token — not a provider signature).
    if not verify_url_token(token, os.getenv("BASELINKER_URL_TOKEN")):
        print("BaseLinker webhook rejected: URL token missing or mismatched")
        # Bodyless, like every response on this route. (HTTPException would
        # render a JSON body, which is invalid for HEAD.)
        return Response(status_code=401)

    parsed_order_id = parse_order_id(order_id)
    if parsed_order_id is None:
        # `order_id` was absent or not a positive integer. Nothing actionable.
        # (If you would rather never signal failure to an undocumented sender,
        # log and return 200 here instead.)
        print("BaseLinker webhook rejected: missing or invalid order_id")
        return Response(status_code=400)

    # `state` is an opaque string (observed: "packed"). It is NOT an event-type
    # discriminator and NOT a documented enum — don't branch over a fixed list.
    print(f"BaseLinker change for order {parsed_order_id} (state: {state or 'none'})")

    # Enrich: re-fetch the authoritative order before acting on it. In production
    # hand this to a background task or queue so the acknowledgement is not
    # delayed by the API round-trip.
    try:
        order = await fetch_order(parsed_order_id)
        if order:
            print(f"Fetched order {parsed_order_id}: {order.get('status')}")
    except httpx.HTTPError as err:
        print(f"Failed to fetch order {parsed_order_id}: {err}")

    # TODO: replace the logging above with your own processing (dedupe on
    # order_id + state so a redelivery doesn't action the same change twice).

    # A bare, bodyless 200. RFC 9110 section 9.3.2 forbids a body on a HEAD
    # response — never return a dict/JSONResponse here.
    return Response(status_code=200)


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
