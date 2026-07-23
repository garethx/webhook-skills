import os
import json
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["OURA_CLIENT_SECRET"] = "test_client_secret"
os.environ["OURA_VERIFICATION_TOKEN"] = "test_verification_token"

from main import app, verify_oura_signature

client = TestClient(app)

SECRET = "test_client_secret"
TIMESTAMP = "1700000000"


def generate_oura_signature(raw_body: str, timestamp: str, secret: str) -> str:
    """Generate a valid Oura signature for testing (HMAC-SHA256, hex, UPPERCASE)."""
    return hmac.new(
        secret.encode("utf-8"),
        (timestamp + raw_body).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest().upper()


class TestVerifyOuraSignature:
    def test_valid_signature_returns_true(self):
        body = json.dumps({"event_type": "update", "data_type": "sleep"})
        signature = generate_oura_signature(body, TIMESTAMP, SECRET)

        assert verify_oura_signature(body.encode(), signature, TIMESTAMP, SECRET) is True

    def test_signature_is_uppercase_hex(self):
        signature = generate_oura_signature('{"data_type":"sleep"}', TIMESTAMP, SECRET)

        assert len(signature) == 64
        assert signature == signature.upper()

    def test_invalid_signature_returns_false(self):
        body = b'{"data_type":"sleep"}'

        assert verify_oura_signature(body, "INVALID", TIMESTAMP, SECRET) is False

    def test_missing_signature_returns_false(self):
        body = b'{"data_type":"sleep"}'

        assert verify_oura_signature(body, None, TIMESTAMP, SECRET) is False

    def test_missing_timestamp_returns_false(self):
        body = '{"data_type":"sleep"}'
        signature = generate_oura_signature(body, TIMESTAMP, SECRET)

        assert verify_oura_signature(body.encode(), signature, None, SECRET) is False

    def test_tampered_body_returns_false(self):
        original = json.dumps({"data_type": "sleep", "object_id": "1"})
        signature = generate_oura_signature(original, TIMESTAMP, SECRET)
        tampered = json.dumps({"data_type": "sleep", "object_id": "999"})

        assert verify_oura_signature(tampered.encode(), signature, TIMESTAMP, SECRET) is False

    def test_wrong_secret_returns_false(self):
        body = '{"data_type":"sleep"}'
        signature = generate_oura_signature(body, TIMESTAMP, SECRET)

        assert verify_oura_signature(body.encode(), signature, TIMESTAMP, "wrong_secret") is False


class TestHandshake:
    def test_valid_token_echoes_challenge(self):
        response = client.get(
            "/webhooks/oura",
            params={"verification_token": "test_verification_token", "challenge": "abc123"},
        )
        assert response.status_code == 200
        assert response.json() == {"challenge": "abc123"}

    def test_invalid_token_returns_401(self):
        response = client.get(
            "/webhooks/oura",
            params={"verification_token": "wrong", "challenge": "abc123"},
        )
        assert response.status_code == 401

    def test_missing_token_returns_401(self):
        response = client.get("/webhooks/oura", params={"challenge": "abc123"})
        assert response.status_code == 401


class TestEvents:
    def _post(self, body: str, signature, timestamp=TIMESTAMP):
        headers = {"Content-Type": "application/json"}
        if signature is not None:
            headers["x-oura-signature"] = signature
        if timestamp is not None:
            headers["x-oura-timestamp"] = timestamp
        return client.post("/webhooks/oura", content=body, headers=headers)

    def test_valid_signature_returns_200(self):
        body = json.dumps(
            {
                "event_type": "update",
                "data_type": "sleep",
                "object_id": "12345abc",
                "event_time": "2023-01-01T08:00:00+00:00",
                "user_id": "user123",
            }
        )
        signature = generate_oura_signature(body, TIMESTAMP, SECRET)

        response = self._post(body, signature)

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_invalid_signature_returns_401(self):
        body = json.dumps({"event_type": "update", "data_type": "sleep"})

        response = self._post(body, "INVALID")

        assert response.status_code == 401

    def test_missing_signature_returns_401(self):
        body = json.dumps({"event_type": "update", "data_type": "sleep"})

        response = self._post(body, None)

        assert response.status_code == 401

    def test_handles_daily_readiness_event(self):
        body = json.dumps(
            {
                "event_type": "create",
                "data_type": "daily_readiness",
                "object_id": "r1",
                "event_time": "2023-01-01T08:00:00+00:00",
                "user_id": "user123",
            }
        )
        signature = generate_oura_signature(body, TIMESTAMP, SECRET)

        response = self._post(body, signature)

        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
