import os
import json
import hmac
import hashlib

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["PAYSTACK_SECRET_KEY"] = "sk_test_paystack_secret"

from main import app, verify_paystack_webhook

client = TestClient(app)

SECRET = os.environ["PAYSTACK_SECRET_KEY"]


def generate_paystack_signature(payload: str, secret: str) -> str:
    """Generate a valid Paystack signature for testing.

    Matches Paystack's scheme: HMAC-SHA512 (hex) over the raw body.
    """
    return hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha512,
    ).hexdigest()


def build_event(event: str, data: dict) -> str:
    return json.dumps({"event": event, "data": data})


class TestVerifyPaystackWebhook:
    """Tests for the Paystack signature verification function."""

    def test_valid_signature_returns_true(self):
        payload = b'{"event":"charge.success"}'
        signature = generate_paystack_signature(payload.decode(), SECRET)

        assert verify_paystack_webhook(payload, signature, SECRET) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"event":"charge.success"}'

        assert verify_paystack_webhook(payload, "deadbeef", SECRET) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"event":"charge.success"}'

        assert verify_paystack_webhook(payload, None, SECRET) is False

    def test_tampered_payload_returns_false(self):
        original = b'{"event":"charge.success","amount":100}'
        signature = generate_paystack_signature(original.decode(), SECRET)
        tampered = b'{"event":"charge.success","amount":999}'

        assert verify_paystack_webhook(tampered, signature, SECRET) is False

    def test_wrong_secret_returns_false(self):
        payload = b'{"event":"charge.success"}'
        signature = generate_paystack_signature(payload.decode(), SECRET)

        assert verify_paystack_webhook(payload, signature, "sk_test_wrong") is False


class TestPaystackWebhookEndpoint:
    """Tests for the Paystack webhook endpoint."""

    def _post(self, payload: str, signature: str | None):
        headers = {"Content-Type": "application/json"}
        if signature is not None:
            headers["X-Paystack-Signature"] = signature
        return client.post("/webhooks/paystack", content=payload, headers=headers)

    def test_missing_signature_returns_400(self):
        payload = build_event("charge.success", {"reference": "ref_1"})
        response = self._post(payload, None)

        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = build_event("charge.success", {"reference": "ref_1"})
        response = self._post(payload, "deadbeef")

        assert response.status_code == 400

    def test_valid_charge_success_returns_200(self):
        payload = build_event(
            "charge.success",
            {"id": 302961, "reference": "qTPrJoy9Bx", "amount": 10000, "currency": "NGN"},
        )
        signature = generate_paystack_signature(payload, SECRET)
        response = self._post(payload, signature)

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_transfer_success(self):
        payload = build_event(
            "transfer.success",
            {"reference": "trf_ref_1", "transfer_code": "TRF_xxxx", "amount": 5000},
        )
        signature = generate_paystack_signature(payload, SECRET)
        response = self._post(payload, signature)

        assert response.status_code == 200

    def test_handles_transfer_failed(self):
        payload = build_event(
            "transfer.failed",
            {"reference": "trf_ref_2", "transfer_code": "TRF_yyyy"},
        )
        signature = generate_paystack_signature(payload, SECRET)
        response = self._post(payload, signature)

        assert response.status_code == 200

    def test_handles_refund_processed(self):
        payload = build_event(
            "refund.processed",
            {"transaction_reference": "qTPrJoy9Bx", "amount": 10000, "status": "processed"},
        )
        signature = generate_paystack_signature(payload, SECRET)
        response = self._post(payload, signature)

        assert response.status_code == 200

    def test_handles_subscription_create(self):
        payload = build_event(
            "subscription.create",
            {"subscription_code": "SUB_xxxx", "status": "active"},
        )
        signature = generate_paystack_signature(payload, SECRET)
        response = self._post(payload, signature)

        assert response.status_code == 200

    def test_handles_invoice_payment_failed(self):
        payload = build_event(
            "invoice.payment_failed",
            {"invoice_code": "INV_xxxx", "subscription": {"subscription_code": "SUB_xxxx"}},
        )
        signature = generate_paystack_signature(payload, SECRET)
        response = self._post(payload, signature)

        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
