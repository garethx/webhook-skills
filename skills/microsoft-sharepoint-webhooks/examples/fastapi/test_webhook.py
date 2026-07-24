import json
import os

# Set test environment variables before importing app
os.environ["SHAREPOINT_CLIENT_STATE"] = "test-client-state-secret"

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

# Ensure the module-level CLIENT_STATE matches the test secret regardless of import order.
main.CLIENT_STATE = "test-client-state-secret"

client = TestClient(main.app)

CLIENT_STATE = "test-client-state-secret"
ENDPOINT = "/webhooks/microsoft-sharepoint"


def build_notification(client_state: str = CLIENT_STATE) -> str:
    return json.dumps(
        {
            "value": [
                {
                    "subscriptionId": "91779246-afe9-4525-b122-6c199ae89211",
                    "clientState": client_state,
                    "expirationDateTime": "2016-04-30T17:27:00.0000000Z",
                    "resource": "b9f6f714-9df8-470b-b22e-653855e1c181",
                    "tenantId": "00000000-0000-0000-0000-000000000000",
                    "siteUrl": "/",
                    "webId": "dbc5a806-e4d4-46e5-951c-6344d70b62fa",
                }
            ]
        }
    )


class TestValidationHandshake:
    def test_echoes_validationtoken_as_plain_text(self):
        token = "random-validation-token-123"
        response = client.post(f"{ENDPOINT}?validationtoken={token}")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/plain")
        assert response.text == token


class TestNotifications:
    def test_valid_client_state_returns_200(self):
        response = client.post(
            ENDPOINT,
            content=build_notification(),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_mismatched_client_state_returns_400(self):
        response = client.post(
            ENDPOINT,
            content=build_notification("wrong-secret"),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid clientState" in response.json()["detail"]

    def test_invalid_json_returns_400(self):
        response = client.post(
            ENDPOINT,
            content="not-json{",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400

    def test_batch_of_multiple_notifications(self):
        payload = json.dumps(
            {
                "value": [
                    {"subscriptionId": "sub-1", "clientState": CLIENT_STATE, "resource": "list-1"},
                    {"subscriptionId": "sub-2", "clientState": CLIENT_STATE, "resource": "list-2"},
                ]
            }
        )
        response = client.post(
            ENDPOINT, content=payload, headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200

    def test_batch_with_one_bad_client_state_rejected(self):
        payload = json.dumps(
            {
                "value": [
                    {"subscriptionId": "sub-1", "clientState": CLIENT_STATE, "resource": "list-1"},
                    {"subscriptionId": "sub-2", "clientState": "tampered", "resource": "list-2"},
                ]
            }
        )
        response = client.post(
            ENDPOINT, content=payload, headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 400

    def test_empty_value_array_accepted(self):
        response = client.post(
            ENDPOINT,
            content=json.dumps({"value": []}),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 200


class TestChangeTypeMapping:
    def test_change_types_map_to_list_events(self):
        assert main.CHANGE_TYPES["Add"] == "ItemAdded"
        assert main.CHANGE_TYPES["Update"] == "ItemUpdated"
        assert main.CHANGE_TYPES["DeleteObject"] == "ItemDeleted"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
