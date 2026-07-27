# Generated with: upollo-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import re
import hmac
import hashlib
import base64
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

upollo_secret = os.environ.get("UPOLLO_WEBHOOK_SECRET")

_ENUM_PREFIX = re.compile(r"^(OUTCOME_|EVENT_TYPE_|FLAG_TYPE_)")


def parse_upollo_signature(header: str) -> dict:
    """Parse an Upollo-Signature header.

    Format: ``t:<unix_ts>,s0:<hmac-sha512>`` -> ``{"t": ..., "s0": ...}``
    """
    parts = {}
    for segment in header.split(","):
        if ":" in segment:
            key, value = segment.split(":", 1)
            parts[key.strip()] = value.strip()
    return parts


def verify_upollo_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify an Upollo webhook signature.

    Upollo computes HMAC-SHA512(webhook_secret, raw_body) and sends it as the
    ``s0`` part of the ``Upollo-Signature`` header. Verify against the RAW body.

    Upollo's docs do not state whether ``s0`` is hex- or base64-encoded (the
    ``s0:`` prefix and 128-char values indicate hex), so we compute the digest
    once and compare against both. Confirm hex against a real delivery, then
    drop base64.
    """
    if not signature_header:
        return False

    s0 = parse_upollo_signature(signature_header).get("s0", "").strip()
    if not s0:
        return False

    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).digest()

    # Accept hex or base64 (encoding unspecified) — constant-time either way.
    return hmac.compare_digest(s0, digest.hex()) or hmac.compare_digest(
        s0, base64.b64encode(digest).decode("utf-8")
    )


def normalize_enum(value) -> str:
    """Strip Upollo's enum prefixes so short-form ("CHALLENGE") and prefixed
    ("OUTCOME_CHALLENGE") values both match."""
    return _ENUM_PREFIX.sub("", str(value or ""))


@app.post("/webhooks/upollo")
async def upollo_webhook(request: Request):
    # Verify the Upollo-Signature over the raw body before parsing.
    raw_body = await request.body()
    signature_header = request.headers.get("upollo-signature")

    if not verify_upollo_webhook(raw_body, signature_header, upollo_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification.
    payload = json.loads(raw_body)

    # Upollo may deliver the analysis flat or wrapped under `analysis` — support both.
    analysis = payload.get("analysis", payload)
    action = normalize_enum(analysis.get("action"))
    event_type = normalize_enum(analysis.get("eventType"))
    flags = analysis.get("flags", [])
    user = analysis.get("userInfo") or analysis.get("user") or {}
    device = analysis.get("deviceInfo") or analysis.get("device") or {}

    print(
        f"Upollo flagged user {user.get('userId', 'unknown')} on "
        f"{event_type or 'UNKNOWN'} -> action {action or 'NONE'} ({len(flags)} flag(s))"
    )

    # Handle each flag that was raised.
    for flag in flags:
        flag_type = normalize_enum(flag.get("type"))
        if flag_type in ("ACCOUNT_SHARING", "ACCOUNT_SHARING_SAME_HOUSEHOLD"):
            print(f"Account sharing detected for {user.get('userId')}")
            # TODO: prompt to add seats / limit concurrent sessions
        elif flag_type == "MULTIPLE_ACCOUNTS":
            print(f"Multiple accounts detected for {user.get('userId')}")
            # TODO: link/merge accounts or block trial abuse
        elif flag_type in ("REPEATED_SIGNUP", "TRIALED_ON_OTHER_ACCOUNT", "REPEATED_REDEMPTION"):
            print(f"Trial/offer abuse ({flag_type}) for {user.get('userId')}")
            # TODO: deny the offer / trial
        elif flag_type in ("SUSPECTED_ACCOUNT_COMPROMISE", "CREDENTIAL_STUFFING"):
            print(f"Possible account takeover ({flag_type}) for {user.get('userId')}")
            # TODO: force a password reset / step-up auth
        else:
            print(f"Flag {flag_type} for {user.get('userId')} (device {device.get('deviceId', 'n/a')})")

    # Act on Upollo's recommended action.
    if action == "CHALLENGE":
        print("Recommended: challenge the user (step-up verification)")
        # TODO: trigger MFA / email / SMS challenge
    elif action == "DENY":
        print("Recommended: deny the action")
        # TODO: reject the login / purchase
    elif action == "OFFER":
        print("Recommended: present an offer")
        # TODO: show upsell (e.g. add seats)
    elif action == "LOG":
        print("Recommended: log only")
    elif action == "PERMIT":
        print("Recommended: permit the user")
    else:
        print(f"Unhandled action: {action}")

    # Respond quickly (2xx) to acknowledge; defer heavy work.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
