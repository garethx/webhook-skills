from fastapi.testclient import TestClient

from main import app, ack_body, event_category

client = TestClient(app)

NOTIFICATION = {
    "notificationId": 272638,
    "eventCode": "billing.subscription-created",
    "eventDate": 1753670400000,
    "dataType": "subscription",
    "data": {"subscriptionId": "sub_123"},
}


class TestAckBody:
    def test_echoes_integer_id(self):
        body = ack_body({"notificationId": 272638})
        assert body == {"notificationId": 272638}
        assert isinstance(body["notificationId"], int)

    def test_echoes_string_id(self):
        body = ack_body({"notificationId": "272638"})
        assert body == {"notificationId": "272638"}
        assert isinstance(body["notificationId"], str)


class TestEventCategory:
    def test_billing(self):
        assert event_category("billing.subscription-created") == "billing"
        assert event_category("billing.payment-processed") == "billing"

    def test_processing(self):
        assert event_category("processing.chargeback") == "processing"
        assert event_category("processing.noc") == "processing"

    def test_unknown(self):
        assert event_category("other.thing") == "unknown"
        assert event_category(None) == "unknown"
        assert event_category(42) == "unknown"


class TestZiftWebhook:
    def test_acknowledges_by_echoing_notification_id(self):
        response = client.post("/webhooks/zift", json=NOTIFICATION)
        assert response.status_code == 200
        assert response.json() == {"notificationId": 272638}

    def test_preserves_string_notification_id(self):
        payload = {**NOTIFICATION, "notificationId": "272638"}
        response = client.post("/webhooks/zift", json=payload)
        assert response.status_code == 200
        assert response.json() == {"notificationId": "272638"}

    def test_missing_notification_id_returns_400(self):
        payload = {k: v for k, v in NOTIFICATION.items() if k != "notificationId"}
        response = client.post("/webhooks/zift", json=payload)
        assert response.status_code == 400

    def test_handles_billing_and_processing_events(self):
        for event_code in [
            "billing.subscription-created",
            "billing.payment-option-created",
            "processing.chargeback",
            "processing.return",
            "processing.noc",
        ]:
            payload = {**NOTIFICATION, "eventCode": event_code}
            response = client.post("/webhooks/zift", json=payload)
            assert response.status_code == 200, f"Failed for eventCode: {event_code}"
            assert response.json() == {"notificationId": 272638}


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
