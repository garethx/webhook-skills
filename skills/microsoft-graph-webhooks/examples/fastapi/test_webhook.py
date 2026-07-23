import os

from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["MICROSOFT_GRAPH_CLIENT_STATE"] = "test-client-state-secret"

from main import app, verify_client_state  # noqa: E402

client = TestClient(app)

CLIENT_STATE = os.environ["MICROSOFT_GRAPH_CLIENT_STATE"]


def change_notification(**overrides):
    item = {
        "subscriptionId": "sub-123",
        "subscriptionExpirationDateTime": "2026-07-22T22:11:09.952Z",
        "changeType": "updated",
        "resource": "Users/user-1/messages/msg-1",
        "clientState": CLIENT_STATE,
        "tenantId": "tenant-1",
        "resourceData": {
            "@odata.type": "#Microsoft.Graph.Message",
            "@odata.id": "Users/user-1/Messages/msg-1",
            "id": "msg-1",
        },
    }
    item.update(overrides)
    return {"value": [item]}


class TestVerifyClientState:
    def test_matching_client_state_returns_true(self):
        assert verify_client_state(CLIENT_STATE, CLIENT_STATE) is True

    def test_mismatched_client_state_returns_false(self):
        assert verify_client_state("wrong", CLIENT_STATE) is False

    def test_missing_received_returns_false(self):
        assert verify_client_state(None, CLIENT_STATE) is False

    def test_missing_expected_returns_false(self):
        assert verify_client_state(CLIENT_STATE, None) is False

    def test_different_length_returns_false(self):
        assert verify_client_state("short", "a-much-longer-secret-value") is False


class TestValidationHandshake:
    def test_echoes_validation_token_as_text_plain_200(self):
        token = "Validation: Testing client-side notifications endpoint"
        response = client.post(
            "/webhooks/microsoft-graph",
            params={"validationToken": token},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/plain")
        assert response.text == token


class TestChangeNotifications:
    def test_valid_updated_returns_202(self):
        response = client.post(
            "/webhooks/microsoft-graph", json=change_notification(changeType="updated")
        )
        assert response.status_code == 202

    def test_valid_created_returns_202(self):
        response = client.post(
            "/webhooks/microsoft-graph", json=change_notification(changeType="created")
        )
        assert response.status_code == 202

    def test_valid_deleted_returns_202(self):
        response = client.post(
            "/webhooks/microsoft-graph", json=change_notification(changeType="deleted")
        )
        assert response.status_code == 202

    def test_mismatched_client_state_returns_400(self):
        response = client.post(
            "/webhooks/microsoft-graph",
            json=change_notification(clientState="attacker-supplied"),
        )
        assert response.status_code == 400
        assert response.text == "Invalid clientState"

    def test_missing_client_state_returns_400(self):
        notification = change_notification()
        del notification["value"][0]["clientState"]
        response = client.post("/webhooks/microsoft-graph", json=notification)
        assert response.status_code == 400

    def test_empty_value_array_returns_202(self):
        response = client.post("/webhooks/microsoft-graph", json={"value": []})
        assert response.status_code == 202

    def test_invalid_json_returns_400(self):
        response = client.post(
            "/webhooks/microsoft-graph",
            content=b"not valid json",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400


class TestLifecycleEvents:
    def test_reauthorization_required_returns_202(self):
        response = client.post(
            "/webhooks/microsoft-graph",
            json={
                "value": [
                    {
                        "subscriptionId": "sub-123",
                        "clientState": CLIENT_STATE,
                        "lifecycleEvent": "reauthorizationRequired",
                    }
                ]
            },
        )
        assert response.status_code == 202

    def test_missed_returns_202(self):
        response = client.post(
            "/webhooks/microsoft-graph",
            json={
                "value": [
                    {
                        "subscriptionId": "sub-123",
                        "clientState": CLIENT_STATE,
                        "lifecycleEvent": "missed",
                    }
                ]
            },
        )
        assert response.status_code == 202

    def test_invalid_client_state_lifecycle_returns_400(self):
        response = client.post(
            "/webhooks/microsoft-graph",
            json={
                "value": [
                    {
                        "subscriptionId": "sub-123",
                        "clientState": "wrong",
                        "lifecycleEvent": "subscriptionRemoved",
                    }
                ]
            },
        )
        assert response.status_code == 400


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
