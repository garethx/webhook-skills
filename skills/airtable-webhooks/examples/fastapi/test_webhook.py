import os
import json
import hmac
import hashlib
import base64

from fastapi.testclient import TestClient

# macSecretBase64 is base64 — here it decodes to the bytes "test_secret_key".
os.environ["AIRTABLE_MAC_SECRET_BASE64"] = base64.b64encode(b"test_secret_key").decode()
# Leave the PAT unset so the handler skips the network fetch during tests.
os.environ.pop("AIRTABLE_PERSONAL_ACCESS_TOKEN", None)

from main import app, verify_airtable_signature, summarize_changes

client = TestClient(app)

SECRET = os.environ["AIRTABLE_MAC_SECRET_BASE64"]


def generate_airtable_mac(raw_body: bytes, mac_secret_base64: str) -> str:
    """Generate a valid X-Airtable-Content-MAC value (same algorithm as Airtable)."""
    key = base64.b64decode(mac_secret_base64)
    return "hmac-sha256=" + hmac.new(key, raw_body, hashlib.sha256).hexdigest()


class TestVerifyAirtableSignature:
    def test_valid_signature_returns_true(self):
        body = b'{"base":{"id":"app1"}}'
        assert verify_airtable_signature(body, generate_airtable_mac(body, SECRET), SECRET) is True

    def test_invalid_signature_returns_false(self):
        assert verify_airtable_signature(b'{"a":1}', "hmac-sha256=deadbeef", SECRET) is False

    def test_missing_header_returns_false(self):
        assert verify_airtable_signature(b"{}", "", SECRET) is False

    def test_tampered_body_returns_false(self):
        mac = generate_airtable_mac(b'{"amount":100}', SECRET)
        assert verify_airtable_signature(b'{"amount":999}', mac, SECRET) is False

    def test_secret_must_be_base64_decoded(self):
        body = b'{"a":1}'
        # Sign using the raw base64 string as the key (a common mistake) ...
        wrong = "hmac-sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        # ... which must NOT verify against the correct base64-decoded key.
        assert verify_airtable_signature(body, wrong, SECRET) is False


class TestSummarizeChanges:
    def test_counts_records_per_table(self):
        payload = {
            "baseTransactionNumber": 7,
            "actionMetadata": {"source": "automation"},
            "changedTablesById": {
                "tblABC": {
                    "createdRecordsById": {"rec1": {}, "rec2": {}},
                    "changedRecordsById": {"rec3": {}},
                    "destroyedRecordIds": ["rec4"],
                }
            },
        }
        assert summarize_changes(payload) == {
            "transactionNumber": 7,
            "source": "automation",
            "tables": {"tblABC": {"created": 2, "changed": 1, "destroyed": 1}},
        }

    def test_empty_payload(self):
        assert summarize_changes({"baseTransactionNumber": 1}) == {
            "transactionNumber": 1,
            "source": None,
            "tables": {},
        }


class TestAirtableWebhook:
    PING = json.dumps(
        {
            "base": {"id": "appABC"},
            "webhook": {"id": "achXYZ"},
            "timestamp": "2022-02-01T21:25:05.663Z",
        }
    )

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/airtable",
            content=self.PING,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        response = client.post(
            "/webhooks/airtable",
            content=self.PING,
            headers={
                "Content-Type": "application/json",
                "X-Airtable-Content-MAC": "hmac-sha256=notvalid",
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200_empty_body(self):
        mac = generate_airtable_mac(self.PING.encode(), SECRET)
        response = client.post(
            "/webhooks/airtable",
            content=self.PING,
            headers={
                "Content-Type": "application/json",
                "X-Airtable-Content-MAC": mac,
            },
        )
        assert response.status_code == 200
        assert response.text == ""


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
