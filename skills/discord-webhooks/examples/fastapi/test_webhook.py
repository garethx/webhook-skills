import json
import time

import pytest
from fastapi.testclient import TestClient
from nacl.signing import SigningKey

# Generate a real Ed25519 keypair for testing
_SIGNING_KEY = SigningKey.generate()
_VERIFY_KEY = _SIGNING_KEY.verify_key
PUBLIC_KEY_HEX = _VERIFY_KEY.encode().hex()


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("DISCORD_PUBLIC_KEY", PUBLIC_KEY_HEX)


# Import after the env fixture is in scope at import time as a safety net
from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, timestamp: str) -> str:
    signed = _SIGNING_KEY.sign(timestamp.encode() + body)
    return signed.signature.hex()


def post_signed(payload: dict, *, tamper_body=False, omit_headers=False, bad_sig=False):
    raw = json.dumps(payload).encode()
    timestamp = str(int(time.time()))
    signature = sign(raw, timestamp)
    if bad_sig:
        signature = "00" * 64

    sent = raw[:-1] + b',"injected":true}' if tamper_body else raw

    headers = {"content-type": "application/json"}
    if not omit_headers:
        headers["x-signature-ed25519"] = signature
        headers["x-signature-timestamp"] = timestamp

    return client.post("/webhooks/discord", content=sent, headers=headers)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_valid_ping_returns_204():
    response = post_signed({"version": 1, "application_id": "1", "type": 0})
    assert response.status_code == 204
    assert response.content == b""


def test_valid_event_returns_204():
    response = post_signed({
        "version": 1,
        "application_id": "123456789012345678",
        "type": 1,
        "event": {
            "type": "APPLICATION_AUTHORIZED",
            "timestamp": "2024-10-18T14:42:32.000Z",
            "data": {
                "user": {"id": "987654321098765432", "username": "testuser"},
                "scopes": ["applications.commands"],
            },
        },
    })
    assert response.status_code == 204


def test_missing_signature_headers_returns_401():
    response = post_signed(
        {"version": 1, "application_id": "1", "type": 0},
        omit_headers=True,
    )
    assert response.status_code == 401
    assert "Missing signature" in response.text


def test_invalid_signature_returns_401():
    response = post_signed(
        {"version": 1, "application_id": "1", "type": 0},
        bad_sig=True,
    )
    assert response.status_code == 401
    assert "Invalid request signature" in response.text


def test_tampered_body_returns_401():
    response = post_signed(
        {
            "version": 1,
            "application_id": "1",
            "type": 1,
            "event": {
                "type": "APPLICATION_AUTHORIZED",
                "timestamp": "2024-10-18T14:42:32.000Z",
                "data": {"user": {"id": "1"}},
            },
        },
        tamper_body=True,
    )
    assert response.status_code == 401


@pytest.mark.parametrize(
    "event_type",
    [
        "APPLICATION_AUTHORIZED",
        "APPLICATION_DEAUTHORIZED",
        "ENTITLEMENT_CREATE",
        "ENTITLEMENT_UPDATE",
        "ENTITLEMENT_DELETE",
        "QUEST_USER_ENROLLMENT",
        "LOBBY_MESSAGE_CREATE",
        "LOBBY_MESSAGE_UPDATE",
        "LOBBY_MESSAGE_DELETE",
        "GAME_DIRECT_MESSAGE_CREATE",
        "GAME_DIRECT_MESSAGE_UPDATE",
        "GAME_DIRECT_MESSAGE_DELETE",
    ],
)
def test_common_event_types(event_type):
    response = post_signed({
        "version": 1,
        "application_id": "1",
        "type": 1,
        "event": {
            "type": event_type,
            "timestamp": "2024-10-18T14:42:32.000Z",
            "data": {
                "id": "resource_1",
                "user_id": "user_1",
                "content": "hi",
                "lobby_id": "lobby_1",
                "channel_id": "channel_1",
                "quest_id": "quest_1",
                "sku_id": "sku_1",
                "user": {"id": "1"},
                "scopes": ["applications.commands"],
            },
        },
    })
    assert response.status_code == 204


def test_unknown_event_type_returns_204():
    response = post_signed({
        "version": 1,
        "application_id": "1",
        "type": 1,
        "event": {
            "type": "SOME_FUTURE_EVENT",
            "timestamp": "2024-10-18T14:42:32.000Z",
            "data": {},
        },
    })
    assert response.status_code == 204
