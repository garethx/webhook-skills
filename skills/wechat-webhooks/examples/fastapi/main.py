# Generated with: wechat-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import json
import os
import time

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

# 32-character APIv3 key used to decrypt resource.ciphertext.
API_V3_KEY = os.environ.get("WECHAT_PAY_API_V3_KEY", "")

TIMESTAMP_TOLERANCE_SECONDS = 300  # 5 minutes


def _load_platform_keys() -> dict:
    """Build the serial -> platform public key (PEM) map used to verify signatures.

    WECHAT_PAY_PLATFORM_KEYS is a JSON object of {"<serial>": "<PEM>"} entries —
    refresh it from GET /v3/certificates (e.g. every 12h) so new serials are
    present before WeChat Pay starts signing with them. The single-key
    WECHAT_PAY_PUBLIC_KEY + WECHAT_PAY_PLATFORM_SERIAL pair is folded in as a
    one-entry map for backwards compatibility.
    """
    keys = {}
    raw_map = os.environ.get("WECHAT_PAY_PLATFORM_KEYS")
    if raw_map:
        keys.update(json.loads(raw_map))
    public_key = os.environ.get("WECHAT_PAY_PUBLIC_KEY")
    serial = os.environ.get("WECHAT_PAY_PLATFORM_SERIAL")
    if public_key and serial:
        keys[serial] = public_key
    return keys


PLATFORM_KEYS = _load_platform_keys()
# Legacy fallback: a key configured without a serial is used for every serial.
# Not rotation-safe — prefer WECHAT_PAY_PLATFORM_KEYS in production.
FALLBACK_PUBLIC_KEY = (
    None if os.environ.get("WECHAT_PAY_PLATFORM_SERIAL")
    else os.environ.get("WECHAT_PAY_PUBLIC_KEY")
)


def verify_signature(timestamp: str, nonce: str, raw_body: str,
                     signature_b64: str, public_key_pem: str) -> bool:
    """Verify the WeChat Pay APIv3 signature (SHA256withRSA).

    The signed message is "{timestamp}\\n{nonce}\\n{body}\\n", verified against
    the platform public key matched by the Wechatpay-Serial header.
    """
    try:
        public_key = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
        message = f"{timestamp}\n{nonce}\n{raw_body}\n".encode("utf-8")
        public_key.verify(
            base64.b64decode(signature_b64),
            message,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


def decrypt_resource(resource: dict, apiv3_key: str) -> dict:
    """Decrypt resource.ciphertext (AEAD_AES_256_GCM) with the 32-byte APIv3 key.

    The cryptography AESGCM API expects the 16-byte auth tag appended to the
    ciphertext, which matches WeChat Pay's format.
    """
    aesgcm = AESGCM(apiv3_key.encode("utf-8"))
    data = base64.b64decode(resource["ciphertext"])
    aad = (resource.get("associated_data") or "").encode("utf-8")
    plaintext = aesgcm.decrypt(resource["nonce"].encode("utf-8"), data, aad)
    return json.loads(plaintext.decode("utf-8"))


def _fail(message: str, status_code: int) -> Response:
    return Response(
        content=json.dumps({"code": "FAIL", "message": message}),
        media_type="application/json",
        status_code=status_code,
    )


@app.post("/webhooks/wechat")
async def wechat_webhook(request: Request):
    timestamp = request.headers.get("wechatpay-timestamp")
    nonce = request.headers.get("wechatpay-nonce")
    signature = request.headers.get("wechatpay-signature")
    serial = request.headers.get("wechatpay-serial")

    if not (timestamp and nonce and signature and serial):
        return _fail("Missing WeChat Pay signature headers", 400)

    # Reject stale notifications (replay protection).
    if abs(int(time.time()) - int(timestamp)) > TIMESTAMP_TOLERANCE_SECONDS:
        return _fail("Timestamp outside tolerance", 400)

    # Select the platform public key by serial. WeChat Pay publishes new platform
    # certificates ~24h before it starts signing with them, so a rotation you have
    # not picked up yet arrives as an unknown serial — fail loudly here instead of
    # as a stream of indistinguishable "invalid signature" rejections.
    public_key = PLATFORM_KEYS.get(serial) or FALLBACK_PUBLIC_KEY
    if not public_key:
        message = (
            f"No platform key configured for serial {serial} — "
            "fetch the current certs via GET /v3/certificates and add it"
        )
        print(message)
        return _fail(message, 400)

    # Read the RAW body for signature verification (never parse before verifying).
    raw_body = (await request.body()).decode("utf-8")
    if not verify_signature(timestamp, nonce, raw_body, signature, public_key):
        return _fail("Invalid signature", 401)

    try:
        notification = json.loads(raw_body)
        resource = decrypt_resource(notification["resource"], API_V3_KEY)
    except Exception as err:  # noqa: BLE001 - surface any decryption/parse failure
        print(f"Failed to decrypt resource: {err}")
        return _fail("Failed to decrypt resource", 400)

    # Handle the event. Re-verify amounts against your order before fulfilling,
    # and process idempotently keyed on notification id / transaction_id.
    event_type = notification.get("event_type")

    if event_type == "TRANSACTION.SUCCESS":
        print(f"Payment succeeded: {resource.get('out_trade_no')} {resource.get('amount')}")
        # TODO: mark order paid, fulfill, send receipt

    elif event_type == "REFUND.SUCCESS":
        print(f"Refund succeeded: {resource.get('out_refund_no')}")
        # TODO: update refund status, notify customer

    elif event_type == "REFUND.CLOSED":
        print(f"Refund closed: {resource.get('out_refund_no')}")
        # TODO: flag for manual review / reconciliation

    else:
        print(f"Unhandled event type: {event_type}")

    # Acknowledge. HTTP 200 tells WeChat Pay to stop retrying.
    return {"code": "SUCCESS", "message": "OK"}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
