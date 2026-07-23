import base64
import json
import os

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["PIPEDRIVE_WEBHOOK_USER"] = "test-user"
os.environ["PIPEDRIVE_WEBHOOK_PASSWORD"] = "test-password"

from main import app  # noqa: E402

client = TestClient(app)


def basic_auth(user: str, password: str) -> str:
    """Build an HTTP Basic Auth header, exactly as Pipedrive sends it."""
    token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


VALID_AUTH = basic_auth("test-user", "test-password")


def payload(action: str, entity: str) -> str:
    return json.dumps(
        {
            "meta": {
                "action": action,
                "entity": entity,
                "entity_id": "123",
                "correlation_id": "corr-abc",
                "version": "2.0",
            },
            "data": {"id": 123, "title": "Test deal"},
            "previous": None,
        }
    )


class TestPipedriveWebhook:
    def test_missing_auth_returns_401(self):
        response = client.post(
            "/webhooks/pipedrive",
            content=payload("create", "deal"),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401

    def test_wrong_credentials_returns_401(self):
        response = client.post(
            "/webhooks/pipedrive",
            content=payload("create", "deal"),
            headers={
                "Content-Type": "application/json",
                "Authorization": basic_auth("test-user", "wrong-password"),
            },
        )
        assert response.status_code == 401

    def test_non_basic_scheme_returns_401(self):
        response = client.post(
            "/webhooks/pipedrive",
            content=payload("create", "deal"),
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer some-token",
            },
        )
        assert response.status_code == 401

    def test_valid_credentials_invalid_payload_returns_400(self):
        response = client.post(
            "/webhooks/pipedrive",
            content=json.dumps({"not": "a webhook"}),
            headers={
                "Content-Type": "application/json",
                "Authorization": VALID_AUTH,
            },
        )
        assert response.status_code == 400

    def test_valid_delivery_returns_200(self):
        response = client.post(
            "/webhooks/pipedrive",
            content=payload("create", "deal"),
            headers={
                "Content-Type": "application/json",
                "Authorization": VALID_AUTH,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_documented_event_types(self):
        events = [
            ("create", "deal"),
            ("change", "deal"),
            ("delete", "deal"),
            ("change", "person"),
            ("create", "activity"),
            ("change", "organization"),  # unhandled -> still 200
        ]
        for action, entity in events:
            response = client.post(
                "/webhooks/pipedrive",
                content=payload(action, entity),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": VALID_AUTH,
                },
            )
            assert response.status_code == 200, f"Failed for {action}.{entity}"

    def test_password_with_colon(self):
        os.environ["PIPEDRIVE_WEBHOOK_PASSWORD"] = "test-password"
        response = client.post(
            "/webhooks/pipedrive",
            content=payload("create", "deal"),
            headers={
                "Content-Type": "application/json",
                "Authorization": basic_auth("test-user", "test-password"),
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
