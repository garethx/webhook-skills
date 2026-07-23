import gzip
import hashlib
import hmac
import json
import os

os.environ["NYLAS_WEBHOOK_SECRET"] = "test_nylas_webhook_secret"

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_nylas_signature  # noqa: E402

client = TestClient(app)
SECRET = os.environ["NYLAS_WEBHOOK_SECRET"]


def sign_nylas(raw_body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()


def cloud_event(trigger: str, obj: dict | None = None) -> bytes:
    return json.dumps(
        {
            "specversion": "1.0",
            "type": trigger,
            "source": "/google/emails/realtime",
            "id": "evt-123",
            "time": 1700000000,
            "webhook_delivery_attempt": 1,
            "data": {
                "application_id": "app-uuid",
                "grant_id": "grant-uuid",
                "object": obj or {},
            },
        }
    ).encode()


# --- verify_nylas_signature ------------------------------------------------


def test_verify_valid_signature():
    payload = cloud_event("message.created", {"subject": "Hi"})
    assert verify_nylas_signature(payload, sign_nylas(payload, SECRET), SECRET) is True


def test_verify_invalid_signature():
    payload = cloud_event("message.created")
    assert verify_nylas_signature(payload, "deadbeef", SECRET) is False


def test_verify_missing_signature():
    payload = cloud_event("message.created")
    assert verify_nylas_signature(payload, None, SECRET) is False


def test_verify_tampered_body():
    payload = cloud_event("message.created", {"subject": "Hi"})
    sig = sign_nylas(payload, SECRET)
    tampered = cloud_event("message.created", {"subject": "Tampered"})
    assert verify_nylas_signature(tampered, sig, SECRET) is False


# --- Challenge handshake ---------------------------------------------------


def test_challenge_handshake_echoes_value():
    res = client.get("/webhooks/nylas", params={"challenge": "abc123xyz"})
    assert res.status_code == 200
    assert res.text == "abc123xyz"


# --- POST /webhooks/nylas --------------------------------------------------


def test_missing_signature_returns_401():
    payload = cloud_event("message.created")
    res = client.post(
        "/webhooks/nylas", content=payload, headers={"content-type": "application/json"}
    )
    assert res.status_code == 401


def test_invalid_signature_returns_401():
    payload = cloud_event("message.created")
    res = client.post(
        "/webhooks/nylas",
        content=payload,
        headers={"content-type": "application/json", "x-nylas-signature": "invalid"},
    )
    assert res.status_code == 401


def test_valid_signature_returns_200():
    payload = cloud_event("message.created", {"subject": "Welcome"})
    res = client.post(
        "/webhooks/nylas",
        content=payload,
        headers={
            "content-type": "application/json",
            "x-nylas-signature": sign_nylas(payload, SECRET),
        },
    )
    assert res.status_code == 200
    assert res.text == "OK"


def test_handles_event_created():
    payload = cloud_event("event.created", {"title": "Standup"})
    res = client.post(
        "/webhooks/nylas",
        content=payload,
        headers={
            "content-type": "application/json",
            "x-nylas-signature": sign_nylas(payload, SECRET),
        },
    )
    assert res.status_code == 200


def test_handles_grant_expired():
    payload = cloud_event("grant.expired", {})
    res = client.post(
        "/webhooks/nylas",
        content=payload,
        headers={
            "content-type": "application/json",
            "x-nylas-signature": sign_nylas(payload, SECRET),
        },
    )
    assert res.status_code == 200


def test_gzip_signature_covers_compressed_bytes():
    raw = cloud_event("message.created", {"subject": "Gzipped"})
    gzipped = gzip.compress(raw)
    # Signature covers the COMPRESSED bytes.
    res = client.post(
        "/webhooks/nylas",
        content=gzipped,
        headers={
            "content-type": "application/json",
            "content-encoding": "gzip",
            "x-nylas-signature": sign_nylas(gzipped, SECRET),
        },
    )
    assert res.status_code == 200
    assert res.text == "OK"
