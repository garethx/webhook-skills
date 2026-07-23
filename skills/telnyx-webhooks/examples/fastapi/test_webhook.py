import base64
import json
import time

import pytest
from fastapi.testclient import TestClient
from nacl.signing import SigningKey

# Generate a real Ed25519 keypair for testing.
# Telnyx provides the public key as base64 (32 bytes) in Mission Control.
_SIGNING_KEY = SigningKey.generate()
_VERIFY_KEY = _SIGNING_KEY.verify_key
PUBLIC_KEY_B64 = base64.b64encode(_VERIFY_KEY.encode()).decode()


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("TELNYX_PUBLIC_KEY", PUBLIC_KEY_B64)


# Import after the env fixture is in scope at import time as a safety net
from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, timestamp: str) -> str:
    """Sign the exact Telnyx scheme: base64( Ed25519( f"{timestamp}|" + body ) )."""
    signed = _SIGNING_KEY.sign(f"{timestamp}|".encode("utf-8") + body)
    return base64.b64encode(signed.signature).decode()


def message_event(event_type: str) -> dict:
    return {
        "data": {
            "record_type": "event",
            "event_type": event_type,
            "id": "2c60c1c6-1234-4b6a-9f3f-abcdef012345",
            "occurred_at": "2024-02-02T22:25:27.521Z",
            "payload": {
                "id": "40385f64-1234-4b0e-8c1f-0123456789ab",
                "record_type": "message",
                "direction": "inbound" if event_type == "message.received" else "outbound",
                "from": {"phone_number": "+13125550001"},
                "to": [{"phone_number": "+13125550002", "status": "sent"}],
                "text": "Hello from Telnyx",
            },
        },
        "meta": {"attempt": 1, "delivered_to": "https://example.com/webhooks/telnyx"},
    }


def post_signed(payload: dict, *, tamper_body=False, omit_headers=False, bad_sig=False, stale_ts=False):
    raw = json.dumps(payload).encode()
    timestamp = str(int(time.time()) - 3600) if stale_ts else str(int(time.time()))
    signature = sign(raw, timestamp)
    if bad_sig:
        signature = base64.b64encode(b"\x00" * 64).decode()

    sent = raw[:-1] + b',"injected":true}' if tamper_body else raw

    headers = {"content-type": "application/json"}
    if not omit_headers:
        headers["telnyx-signature-ed25519"] = signature
        headers["telnyx-timestamp"] = timestamp

    return client.post("/webhooks/telnyx", content=sent, headers=headers)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_valid_event_returns_200():
    response = post_signed(message_event("message.sent"))
    assert response.status_code == 200
    assert response.json() == {"received": True}


def test_missing_signature_headers_returns_400():
    response = post_signed(message_event("message.sent"), omit_headers=True)
    assert response.status_code == 400
    assert "Missing Telnyx signature" in response.text


def test_invalid_signature_returns_400():
    response = post_signed(message_event("message.sent"), bad_sig=True)
    assert response.status_code == 400
    assert "Invalid signature" in response.text


def test_tampered_body_returns_400():
    response = post_signed(message_event("message.received"), tamper_body=True)
    assert response.status_code == 400


def test_stale_timestamp_returns_400():
    response = post_signed(message_event("message.sent"), stale_ts=True)
    assert response.status_code == 400
    assert "Invalid signature" in response.text


@pytest.mark.parametrize(
    "event_type",
    ["message.received", "message.sent", "message.finalized"],
)
def test_common_event_types(event_type):
    response = post_signed(message_event(event_type))
    assert response.status_code == 200


def test_unknown_event_type_returns_200():
    response = post_signed(message_event("message.some_future_event"))
    assert response.status_code == 200
