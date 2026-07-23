import os
import json
import hmac
import hashlib
import base64

# Set test environment variables before importing the app
os.environ["XERO_WEBHOOK_KEY"] = "test_xero_signing_key"

from fastapi.testclient import TestClient

from main import app, verify_xero_signature

client = TestClient(app)

SIGNING_KEY = os.environ["XERO_WEBHOOK_KEY"]


def generate_xero_signature(payload: str, signing_key: str) -> str:
    """Generate a valid Xero signature: base64(HMAC-SHA256(rawBody, signingKey))."""
    return base64.b64encode(
        hmac.new(signing_key.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")


def sample_payload(**overrides) -> str:
    event = {
        "resourceUrl": "https://api.xero.com/api.xro/2.0/Contacts/abc-123",
        "resourceId": "abc-123",
        "eventDateUtc": "2024-05-01T12:00:00.000",
        "eventType": "CREATE",
        "eventCategory": "CONTACT",
        "tenantId": "tenant-1",
        "tenantType": "ORGANISATION",
    }
    event.update(overrides)
    return json.dumps(
        {
            "events": [event],
            "firstEventSequence": 1,
            "lastEventSequence": 1,
            "entropy": "abc",
        }
    )


class TestVerifyXeroSignature:
    def test_valid_signature_returns_true(self):
        payload = sample_payload()
        signature = generate_xero_signature(payload, SIGNING_KEY)
        assert verify_xero_signature(payload.encode(), signature, SIGNING_KEY) is True

    def test_invalid_signature_returns_false(self):
        payload = sample_payload()
        assert verify_xero_signature(payload.encode(), "invalid-signature", SIGNING_KEY) is False

    def test_missing_signature_returns_false(self):
        payload = sample_payload()
        assert verify_xero_signature(payload.encode(), None, SIGNING_KEY) is False

    def test_tampered_body_returns_false(self):
        signature = generate_xero_signature(sample_payload(), SIGNING_KEY)
        tampered = sample_payload(resourceId="evil-999")
        assert verify_xero_signature(tampered.encode(), signature, SIGNING_KEY) is False

    def test_wrong_key_returns_false(self):
        payload = sample_payload()
        signature = generate_xero_signature(payload, SIGNING_KEY)
        assert verify_xero_signature(payload.encode(), signature, "wrong_key") is False


class TestXeroWebhookEndpoint:
    def test_missing_signature_returns_401(self):
        response = client.post(
            "/webhooks/xero",
            content=sample_payload(),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401

    def test_invalid_signature_returns_401(self):
        """ITR bad-signature probe must be rejected with 401."""
        payload = sample_payload()
        response = client.post(
            "/webhooks/xero",
            content=payload,
            headers={"Content-Type": "application/json", "x-xero-signature": "invalid-signature"},
        )
        assert response.status_code == 401

    def test_valid_signature_returns_200(self):
        """ITR good-signature probe must be accepted with 200."""
        payload = sample_payload()
        signature = generate_xero_signature(payload, SIGNING_KEY)
        response = client.post(
            "/webhooks/xero",
            content=payload,
            headers={"Content-Type": "application/json", "x-xero-signature": signature},
        )
        assert response.status_code == 200
        assert response.text == "OK"

    def test_empty_itr_style_body_returns_200(self):
        payload = json.dumps({"events": [], "firstEventSequence": 0, "lastEventSequence": 0, "entropy": "x"})
        signature = generate_xero_signature(payload, SIGNING_KEY)
        response = client.post(
            "/webhooks/xero",
            content=payload,
            headers={"Content-Type": "application/json", "x-xero-signature": signature},
        )
        assert response.status_code == 200

    def test_handles_all_event_combinations(self):
        combos = [
            ("CONTACT", "CREATE"),
            ("CONTACT", "UPDATE"),
            ("INVOICE", "CREATE"),
            ("INVOICE", "UPDATE"),
            ("CREDITNOTE", "CREATE"),
            ("CREDITNOTE", "UPDATE"),
            ("SUBSCRIPTION", "CREATE"),
            ("SUBSCRIPTION", "UPDATE"),
        ]
        for event_category, event_type in combos:
            payload = sample_payload(eventCategory=event_category, eventType=event_type)
            signature = generate_xero_signature(payload, SIGNING_KEY)
            response = client.post(
                "/webhooks/xero",
                content=payload,
                headers={"Content-Type": "application/json", "x-xero-signature": signature},
            )
            assert response.status_code == 200, f"Failed for {event_category}/{event_type}"

    def test_handles_batch_of_events(self):
        payload = json.dumps(
            {
                "events": [
                    {"resourceUrl": "u1", "resourceId": "r1", "eventDateUtc": "2024-05-01T12:00:00.000", "eventType": "CREATE", "eventCategory": "CONTACT", "tenantId": "t1", "tenantType": "ORGANISATION"},
                    {"resourceUrl": "u2", "resourceId": "r2", "eventDateUtc": "2024-05-01T12:00:01.000", "eventType": "UPDATE", "eventCategory": "INVOICE", "tenantId": "t1", "tenantType": "ORGANISATION"},
                ],
                "firstEventSequence": 1,
                "lastEventSequence": 2,
                "entropy": "xyz",
            }
        )
        signature = generate_xero_signature(payload, SIGNING_KEY)
        response = client.post(
            "/webhooks/xero",
            content=payload,
            headers={"Content-Type": "application/json", "x-xero-signature": signature},
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
