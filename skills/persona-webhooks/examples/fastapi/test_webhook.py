import hashlib
import hmac
import json
import os
import time

os.environ["PERSONA_WEBHOOK_SECRET"] = "wbhsec_test_signing_secret_value"

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
SECRET = os.environ["PERSONA_WEBHOOK_SECRET"]


def generate_persona_signature(
    payload: str, secret: str, timestamp: int | None = None
) -> str:
    """Build a valid Persona-Signature header for testing.

    Header format:  t=<unix_seconds>,v1=<hex_signature>
    Signed content: f"{t}.{payload}"
    """
    t = str(timestamp if timestamp is not None else int(time.time()))
    v1 = hmac.new(
        secret.encode("utf-8"),
        f"{t}.{payload}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"t={t},v1={v1}"


def build_event(name: str, object_id: str = "obj_1") -> str:
    """Build an envelope matching Persona's JSON:API webhook shape."""
    prefix = name.replace("/", ".").split(".")[0]
    return json.dumps(
        {
            "data": {
                "type": "event",
                "id": f"evt_{name.replace('.', '_').replace('/', '_')}",
                "attributes": {
                    "name": name,
                    "created-at": "2026-07-22T00:00:00.000Z",
                    "payload": {"data": {"type": prefix, "id": object_id}},
                },
            }
        }
    )


class TestVerifyPersonaSignature:
    def test_accepts_valid_signature(self):
        payload = build_event("inquiry.completed")
        header = generate_persona_signature(payload, SECRET)
        response = client.post(
            "/webhooks/persona",
            content=payload,
            headers={"Content-Type": "application/json", "Persona-Signature": header},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_rotation_pair(self):
        """Two space-separated pairs (old + new secret); the new one matches."""
        payload = build_event("inquiry.approved")
        good = generate_persona_signature(payload, SECRET)
        stale = generate_persona_signature(payload, "wbhsec_old_rotated_out_secret")
        response = client.post(
            "/webhooks/persona",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Persona-Signature": f"{stale} {good}",
            },
        )
        assert response.status_code == 200


class TestPersonaWebhook:
    def test_missing_header_returns_400(self):
        response = client.post(
            "/webhooks/persona",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing Persona-Signature header" in response.json()["detail"]

    def test_malformed_header_returns_400(self):
        response = client.post(
            "/webhooks/persona",
            content="{}",
            headers={
                "Content-Type": "application/json",
                "Persona-Signature": "not-a-real-header",
            },
        )
        assert response.status_code == 400
        assert "Malformed" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = build_event("inquiry.completed")
        header = f"t={int(time.time())},v1=deadbeef"
        response = client.post(
            "/webhooks/persona",
            content=payload,
            headers={"Content-Type": "application/json", "Persona-Signature": header},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_payload_returns_400(self):
        original = build_event("inquiry.completed", "inq_orig")
        header = generate_persona_signature(original, SECRET)
        tampered = build_event("inquiry.completed", "inq_TAMPERED")
        response = client.post(
            "/webhooks/persona",
            content=tampered,
            headers={"Content-Type": "application/json", "Persona-Signature": header},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_valid_signature_returns_200(self):
        payload = build_event("inquiry.approved", "inq_valid")
        header = generate_persona_signature(payload, SECRET)
        response = client.post(
            "/webhooks/persona",
            content=payload,
            headers={"Content-Type": "application/json", "Persona-Signature": header},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_every_event_type(self):
        event_types = [
            "inquiry.created",
            "inquiry.started",
            "inquiry.completed",
            "inquiry.approved",
            "inquiry.declined",
            "inquiry.marked-for-review",
            "inquiry.failed",
            "inquiry.expired",
            "verification.passed",
            "verification.failed",
            "account.created",
            "account.archived",
            "case.created",
            "case.resolved",
            "report/watchlist.ready",
            "unknown.event.type",
        ]

        for event_type in event_types:
            payload = build_event(event_type)
            header = generate_persona_signature(payload, SECRET)
            response = client.post(
                "/webhooks/persona",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "Persona-Signature": header,
                },
            )
            assert response.status_code == 200, (
                f"Failed for event type: {event_type}"
            )


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
