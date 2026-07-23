import os
import json
import hmac
import hashlib
import base64

# Set test environment variables before importing app
os.environ["TRELLO_SECRET"] = "test_trello_secret"
os.environ["TRELLO_CALLBACK_URL"] = "https://example.com/webhooks/trello"

from fastapi.testclient import TestClient

from main import app, verify_trello_webhook

client = TestClient(app)

SECRET = os.environ["TRELLO_SECRET"]
CALLBACK_URL = os.environ["TRELLO_CALLBACK_URL"]


def generate_trello_signature(payload: bytes, secret: str, callback_url: str) -> str:
    """Generate a valid Trello signature: base64(HMAC-SHA1(rawBody + callbackURL))."""
    digest = hmac.new(
        secret.encode(),
        payload + callback_url.encode(),
        hashlib.sha1,
    ).digest()
    return base64.b64encode(digest).decode()


class TestVerifyTrelloWebhook:
    """Tests for the Trello signature verification function."""

    def test_valid_signature_returns_true(self):
        payload = b'{"action":{"type":"createCard"}}'
        signature = generate_trello_signature(payload, SECRET, CALLBACK_URL)

        assert verify_trello_webhook(payload, signature, SECRET, CALLBACK_URL) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"action":{"type":"createCard"}}'

        assert verify_trello_webhook(payload, "invalid_signature", SECRET, CALLBACK_URL) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"action":{"type":"createCard"}}'

        assert verify_trello_webhook(payload, "", SECRET, CALLBACK_URL) is False

    def test_mismatched_callback_url_returns_false(self):
        payload = b'{"action":{"type":"createCard"}}'
        signature = generate_trello_signature(payload, SECRET, CALLBACK_URL)

        assert (
            verify_trello_webhook(
                payload, signature, SECRET, "https://evil.example.com/webhooks/trello"
            )
            is False
        )

    def test_tampered_payload_returns_false(self):
        original = b'{"action":{"type":"updateCard","data":{"amount":1}}}'
        signature = generate_trello_signature(original, SECRET, CALLBACK_URL)
        tampered = b'{"action":{"type":"updateCard","data":{"amount":999}}}'

        assert verify_trello_webhook(tampered, signature, SECRET, CALLBACK_URL) is False


class TestTrelloWebhookHead:
    """Tests for the HEAD creation-validation check."""

    def test_head_returns_200(self):
        response = client.head("/webhooks/trello")
        assert response.status_code == 200


class TestTrelloWebhook:
    """Tests for the Trello webhook endpoint."""

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/trello",
            content='{"action":{"type":"createCard"}}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"action": {"type": "createCard"}})

        response = client.post(
            "/webhooks/trello",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-trello-webhook": "invalid_signature",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps(
            {
                "action": {"type": "createCard", "data": {"card": {"name": "New card"}}},
                "model": {"id": "abc", "name": "My Board"},
            }
        )
        signature = generate_trello_signature(payload.encode(), SECRET, CALLBACK_URL)

        response = client.post(
            "/webhooks/trello",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "x-trello-webhook": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_different_action_types(self):
        action_types = [
            "createCard",
            "updateCard",
            "deleteCard",
            "commentCard",
            "addAttachmentToCard",
            "addMemberToCard",
            "createList",
            "updateList",
            "addMemberToBoard",
            "removeMemberFromBoard",
            "updateBoard",
        ]

        for action_type in action_types:
            payload = json.dumps({"action": {"type": action_type, "data": {}}})
            signature = generate_trello_signature(payload.encode(), SECRET, CALLBACK_URL)

            response = client.post(
                "/webhooks/trello",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-trello-webhook": signature,
                },
            )
            assert response.status_code == 200, f"Failed for action type: {action_type}"


class TestHealth:
    """Tests for the health endpoint."""

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
