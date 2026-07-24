# Generated with: alipay-webhooks skill
# https://github.com/hookdeck/webhook-skills
#
# Receive and verify Alipay (Antom / Alipay+) webhooks with FastAPI.
# There is no official Alipay SDK helper for notification verification across
# frameworks, so this uses `cryptography` directly (standard SHA256withRSA).

import base64
import json
import os
from datetime import datetime, timezone
from urllib.parse import unquote

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

CLIENT_ID = os.environ.get("ALIPAY_CLIENT_ID", "")
ALIPAY_PUBLIC_KEY = os.environ.get("ALIPAY_PUBLIC_KEY", "")  # verifies inbound
MERCHANT_PRIVATE_KEY = os.environ.get("ALIPAY_MERCHANT_PRIVATE_KEY", "")  # signs the ack
KEY_VERSION = os.environ.get("ALIPAY_KEY_VERSION", "1")

WEBHOOK_PATH = "/webhooks/alipay"

# The acknowledgement body Antom expects, verbatim (compact, no spaces).
ACK_BODY = json.dumps(
    {"result": {"resultCode": "SUCCESS", "resultStatus": "S", "resultMessage": "Success"}},
    separators=(",", ":"),
)


def _normalize_pem(pem: str) -> str:
    # PEM values are commonly stored on one line with literal "\n".
    return (pem or "").replace("\\n", "\n")


def parse_signature_header(header: str) -> dict:
    out = {}
    for part in (header or "").split(","):
        if "=" in part:
            key, value = part.split("=", 1)
            out[key.strip()] = value.strip()
    return out


def _build_signed_content(method: str, uri: str, client_id: str, time: str, body: str) -> bytes:
    # Two-line content: "<METHOD> <URI>\n<Client-Id>.<Time>.<Body>"
    return f"{method} {uri}\n{client_id}.{time}.{body}".encode("utf-8")


def verify_alipay_signature(method, uri, client_id, request_time, raw_body, signature_header) -> bool:
    parsed = parse_signature_header(signature_header or "")
    sig_b64 = parsed.get("signature")
    if not sig_b64 or not client_id or not request_time:
        return False

    content = _build_signed_content(method, uri, client_id, request_time, raw_body)

    # base64URL, often percent-encoded on the wire: unquote, normalize, pad, decode.
    normalized = unquote(sig_b64).replace("-", "+").replace("_", "/")
    normalized += "=" * (-len(normalized) % 4)
    try:
        signature = base64.b64decode(normalized)
    except (ValueError, base64.binascii.Error):
        return False

    try:
        public_key = serialization.load_pem_public_key(_normalize_pem(ALIPAY_PUBLIC_KEY).encode("utf-8"))
        public_key.verify(signature, content, padding.PKCS1v15(), hashes.SHA256())
        return True
    except (InvalidSignature, ValueError):
        return False


def sign_alipay_response(method: str, uri: str, response_time: str, body: str) -> str:
    content = _build_signed_content(method, uri, CLIENT_ID, response_time, body)
    private_key = serialization.load_pem_private_key(
        _normalize_pem(MERCHANT_PRIVATE_KEY).encode("utf-8"), password=None
    )
    signature = private_key.sign(content, padding.PKCS1v15(), hashes.SHA256())
    sig_b64url = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
    return f"algorithm=RSA256,keyVersion={KEY_VERSION},signature={sig_b64url}"


def signed_ack(method: str) -> Response:
    response_time = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    signature = sign_alipay_response(method, WEBHOOK_PATH, response_time, ACK_BODY)
    return Response(
        content=ACK_BODY,
        status_code=200,
        media_type="application/json",
        headers={
            "Client-Id": CLIENT_ID,
            "Response-Time": response_time,
            "Signature": signature,
        },
    )


@app.post(WEBHOOK_PATH)
async def alipay_webhook(request: Request):
    # Read the RAW body — the signature covers the exact bytes. Do not parse first.
    raw_body = (await request.body()).decode("utf-8")

    client_id = request.headers.get("client-id")
    request_time = request.headers.get("request-time")
    signature_header = request.headers.get("signature")

    if not signature_header or not client_id or not request_time:
        return Response(content="Missing Alipay signature headers", status_code=400)

    valid = verify_alipay_signature(
        method="POST",
        uri=WEBHOOK_PATH,
        client_id=client_id,
        request_time=request_time,
        raw_body=raw_body,
        signature_header=signature_header,
    )
    if not valid:
        return Response(content="Invalid signature", status_code=401)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(content="Invalid JSON", status_code=400)

    # Branch on `notifyType` (no `type` field); result.resultStatus is S/F/U.
    status = (event.get("result") or {}).get("resultStatus")
    notify_type = event.get("notifyType")

    if notify_type == "PAYMENT_RESULT":
        print("Payment result:", event.get("paymentRequestId"), event.get("paymentId"), status)
        # TODO: if status == "S": fulfill the order
    elif notify_type == "CAPTURE_RESULT":
        print("Capture result:", event.get("captureRequestId"), event.get("captureId"), status)
    elif notify_type == "REFUND_RESULT":
        print("Refund result:", event.get("refundRequestId"), event.get("refundId"), status)
    elif notify_type == "AUTHORIZATION_RESULT":
        print("Authorization result:", event.get("authorizationRequestId"), status)
    elif notify_type in ("DISPUTE_CREATED", "DISPUTE_JUDGED"):
        print("Dispute:", notify_type, event.get("disputeId"), status)
    else:
        print("Unhandled notifyType:", notify_type)

    # Signed 200 so Antom stops retrying.
    return signed_ack("POST")


@app.get("/health")
async def health():
    return {"status": "ok"}
