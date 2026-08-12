import os

from fastapi.testclient import TestClient

# Set the test shared secret before importing the app
os.environ["VAPI_WEBHOOK_SECRET"] = "test_vapi_shared_secret_abc123"

from main import app, verify_vapi_secret, extract_token

client = TestClient(app)

SECRET = os.environ["VAPI_WEBHOOK_SECRET"]


def message(message_type, **extra):
    """Build a Vapi delivery body. The event type is NESTED at message.type."""
    msg = {"type": message_type, "call": {"id": "call_123"}, "timestamp": 1712345678000}
    msg.update(extra)
    return {"message": msg}


def bearer(secret=SECRET):
    return {"Authorization": f"Bearer {secret}"}


class TestVerifyVapiSecret:
    def test_extracts_bearer_token(self):
        assert extract_token({"authorization": f"Bearer {SECRET}"}) == SECRET

    def test_extracts_raw_authorization(self):
        assert extract_token({"authorization": SECRET}) == SECRET

    def test_falls_back_to_x_vapi_secret(self):
        assert extract_token({"x-vapi-secret": SECRET}) == SECRET

    def test_matching_bearer_secret(self):
        assert verify_vapi_secret({"authorization": f"Bearer {SECRET}"}, SECRET) is True

    def test_matching_x_vapi_secret(self):
        assert verify_vapi_secret({"x-vapi-secret": SECRET}, SECRET) is True

    def test_wrong_secret(self):
        assert verify_vapi_secret({"authorization": "Bearer nope"}, SECRET) is False

    def test_no_secret_header(self):
        assert verify_vapi_secret({}, SECRET) is False


class TestVapiAuth:
    def test_missing_secret_returns_401(self):
        response = client.post("/webhooks/vapi", json=message("status-update"))
        assert response.status_code == 401

    def test_wrong_secret_returns_401(self):
        response = client.post(
            "/webhooks/vapi", json=message("status-update"), headers=bearer("wrong_secret")
        )
        assert response.status_code == 401

    def test_legacy_x_vapi_secret_header(self):
        response = client.post(
            "/webhooks/vapi",
            json=message("status-update"),
            headers={"X-Vapi-Secret": SECRET},
        )
        assert response.status_code == 200


class TestInformationalTypes:
    def test_status_update_returns_200(self):
        response = client.post(
            "/webhooks/vapi", json=message("status-update", status="in-progress"), headers=bearer()
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_end_of_call_report_returns_200(self):
        response = client.post(
            "/webhooks/vapi",
            json=message("end-of-call-report", endedReason="hangup", cost=0.03),
            headers=bearer(),
        )
        assert response.status_code == 200

    def test_unknown_type_acknowledged_with_200(self):
        response = client.post(
            "/webhooks/vapi", json=message("some-future-message"), headers=bearer()
        )
        assert response.status_code == 200


class TestRequestResponseTypes:
    def test_assistant_request_returns_assistant_id(self):
        response = client.post(
            "/webhooks/vapi", json=message("assistant-request"), headers=bearer()
        )
        assert response.status_code == 200
        assert "assistantId" in response.json()

    def test_tool_calls_returns_one_result_per_call(self):
        body = message(
            "tool-calls",
            toolCallList=[
                {"id": "tc_1", "function": {"name": "get_weather", "arguments": "{}"}},
                {"id": "tc_2", "function": {"name": "get_time", "arguments": "{}"}},
            ],
        )
        response = client.post("/webhooks/vapi", json=body, headers=bearer())
        assert response.status_code == 200
        results = response.json()["results"]
        assert len(results) == 2
        assert results[0]["name"] == "get_weather"
        assert results[0]["toolCallId"] == "tc_1"

    def test_transfer_destination_request_returns_destination(self):
        response = client.post(
            "/webhooks/vapi", json=message("transfer-destination-request"), headers=bearer()
        )
        assert response.status_code == 200
        assert "destination" in response.json()

    def test_knowledge_base_request_returns_documents(self):
        response = client.post(
            "/webhooks/vapi", json=message("knowledge-base-request"), headers=bearer()
        )
        assert response.status_code == 200
        assert isinstance(response.json()["documents"], list)


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
