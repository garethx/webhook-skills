import os

import httpx
import pytest

PAYMENT_SUB = "6289db02-d422-4e93-b65c-30fa973bd341"
BUNDLE_SUB = "5505d055-89e9-48b7-913d-8414d9f8d3cd"

# Both subscriptions point at this endpoint, so both ids are allowed.
os.environ["TIKKIE_SUBSCRIPTION_ID"] = f"{PAYMENT_SUB},{BUNDLE_SUB}"
# Re-fetch stays off unless a test turns it on (no network in tests).
os.environ.pop("TIKKIE_API_KEY", None)
os.environ.pop("TIKKIE_APP_TOKEN", None)

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from main import app, check_subscription_id, parse_notification, record_path  # noqa: E402

client = TestClient(app)

# Verbatim examples from the Tikkie API v2.3 OpenAPI spec.
PAYMENT = {
    "subscriptionId": PAYMENT_SUB,
    "notificationType": "PAYMENT",
    "paymentRequestToken": "qzdnzr8hnVWTgXXcFRLUMc",
    "paymentToken": "21ef7413-cc3c-4c80-9272-6710fada28e4",
}
REFUND = {**PAYMENT, "notificationType": "REFUND", "refundToken": "abcdzr8hnVWTgXXcFRLUMc"}
BUNDLE = {
    "subscriptionId": BUNDLE_SUB,
    "notificationType": "BUNDLE",
    "bundleId": "af8fa035-3275-44fc-9a9b-a38c02efa114",
}


def post(body):
    return client.post("/webhooks/tikkie", json=body)


class TestParseNotification:
    @pytest.mark.parametrize("n", [PAYMENT, REFUND, BUNDLE])
    def test_accepts_known_types(self, n):
        assert parse_notification(n) == n

    def test_rejects_refund_without_refund_token(self):
        body = {k: v for k, v in REFUND.items() if k != "refundToken"}
        with pytest.raises(ValueError):
            parse_notification(body)

    def test_rejects_missing_subscription_id(self):
        with pytest.raises(ValueError, match="subscriptionId"):
            parse_notification({"notificationType": "PAYMENT"})


class TestCheckSubscriptionId:
    def test_matches_configured_id(self):
        assert check_subscription_id(PAYMENT_SUB, [PAYMENT_SUB])

    def test_rejects_unknown_id(self):
        assert not check_subscription_id("00000000-0000-0000-0000-000000000000", [PAYMENT_SUB])

    def test_skips_when_unconfigured(self):
        assert check_subscription_id("anything", [])


class TestRecordPath:
    def test_paths(self):
        assert record_path(PAYMENT) == (
            "/paymentrequests/qzdnzr8hnVWTgXXcFRLUMc/payments/21ef7413-cc3c-4c80-9272-6710fada28e4"
        )
        assert record_path(REFUND).endswith("/refunds/abcdzr8hnVWTgXXcFRLUMc")
        assert record_path(BUNDLE) == "/transactionbundles/af8fa035-3275-44fc-9a9b-a38c02efa114"


class TestWebhookEndpoint:
    @pytest.mark.parametrize("n", [PAYMENT, REFUND, BUNDLE])
    def test_known_types_return_200(self, n):
        res = post(n)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_unknown_subscription_id_returns_403(self):
        res = post({**PAYMENT, "subscriptionId": "00000000-0000-0000-0000-000000000000"})
        assert res.status_code == 403

    def test_invalid_json_returns_400(self):
        res = client.post(
            "/webhooks/tikkie", content=b"{not json", headers={"Content-Type": "application/json"}
        )
        assert res.status_code == 400

    def test_missing_fields_returns_400(self):
        res = post({"subscriptionId": BUNDLE_SUB, "notificationType": "BUNDLE"})
        assert res.status_code == 400

    def test_unknown_notification_type_returns_200(self):
        res = post({"subscriptionId": PAYMENT_SUB, "notificationType": "SOMETHING_NEW"})
        assert res.status_code == 200


class TestRefetch:
    @pytest.fixture(autouse=True)
    def credentials(self, monkeypatch):
        monkeypatch.setenv("TIKKIE_API_KEY", "test_api_key")
        monkeypatch.setenv("TIKKIE_APP_TOKEN", "test_app_token")
        monkeypatch.setenv("TIKKIE_API_BASE_URL", "https://api-sandbox.abnamro.com/v2/tikkie")
        yield
        main.HTTP_TRANSPORT = None

    def mock_api(self, status, body=None):
        calls = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            return httpx.Response(status, json=body or {})

        main.HTTP_TRANSPORT = httpx.MockTransport(handler)
        return calls

    def test_fetches_payment_with_api_headers(self):
        calls = self.mock_api(200, {"paymentToken": PAYMENT["paymentToken"], "amountInCents": 1250})
        res = post(PAYMENT)
        assert res.status_code == 200
        req = calls[0]
        assert str(req.url) == (
            "https://api-sandbox.abnamro.com/v2/tikkie/paymentrequests/qzdnzr8hnVWTgXXcFRLUMc"
            "/payments/21ef7413-cc3c-4c80-9272-6710fada28e4"
        )
        assert req.headers["API-Key"] == "test_api_key"
        assert req.headers["X-App-Token"] == "test_app_token"

    def test_404_returns_403(self):
        self.mock_api(404)
        assert post(PAYMENT).status_code == 403

    def test_api_failure_returns_502(self):
        self.mock_api(500)
        assert post(BUNDLE).status_code == 502


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
