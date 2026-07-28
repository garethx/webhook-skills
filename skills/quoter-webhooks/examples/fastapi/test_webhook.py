import hashlib
import json
import os
import time

# Set test environment variables before importing app
os.environ["QUOTER_HASH_KEY"] = "test_hash_key"

from fastapi.testclient import TestClient

from main import app, verify_quoter

client = TestClient(app)

HASH_KEY = os.environ["QUOTER_HASH_KEY"]


def build_quoter_body(data: str, hash_key: str = HASH_KEY, timestamp: str = None) -> dict:
    """Build a Quoter form body (hash, timestamp, data) for testing.

    Quoter computes hash = md5(HASH_KEY + timestamp + data).
    """
    ts = timestamp if timestamp is not None else str(int(time.time()))
    digest = hashlib.md5(f"{hash_key}{ts}{data}".encode("utf-8")).hexdigest()
    return {"hash": digest, "timestamp": ts, "data": data}


class TestVerifyQuoter:
    """Unit tests for the verification helper."""

    data = json.dumps({"id": "quot_123", "status": "accepted"})

    def test_accepts_valid_hash(self):
        body = build_quoter_body(self.data)
        assert verify_quoter(HASH_KEY, body["timestamp"], self.data, body["hash"]) is True

    def test_rejects_invalid_hash(self):
        ts = str(int(time.time()))
        assert verify_quoter(HASH_KEY, ts, self.data, "deadbeef") is False

    def test_rejects_tampered_payload(self):
        body = build_quoter_body(self.data)
        tampered = json.dumps({"id": "quot_123", "status": "ordered"})
        assert verify_quoter(HASH_KEY, body["timestamp"], tampered, body["hash"]) is False

    def test_rejects_stale_timestamp(self):
        old_ts = str(int(time.time()) - 400)
        body = build_quoter_body(self.data, timestamp=old_ts)
        assert verify_quoter(HASH_KEY, old_ts, self.data, body["hash"]) is False

    def test_rejects_empty_hash_key(self):
        body = build_quoter_body(self.data)
        assert verify_quoter("", body["timestamp"], self.data, body["hash"]) is False


class TestQuoterWebhook:
    """Tests for the webhook endpoint."""

    def test_missing_fields_returns_400(self):
        response = client.post("/webhooks/quoter?object=quote", data={"data": "{}"})
        assert response.status_code == 400

    def test_invalid_hash_returns_400(self):
        ts = str(int(time.time()))
        response = client.post(
            "/webhooks/quoter?object=quote",
            data={"hash": "deadbeef", "timestamp": ts, "data": '{"id":"quot_1"}'},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_stale_timestamp_returns_400(self):
        old_ts = str(int(time.time()) - 400)
        body = build_quoter_body(json.dumps({"id": "quot_1"}), timestamp=old_ts)
        response = client.post("/webhooks/quoter?object=quote", data=body)
        assert response.status_code == 400

    def test_valid_delivery_returns_200(self):
        body = build_quoter_body(json.dumps({"id": "quot_123"}))
        response = client.post("/webhooks/quoter?object=quote", data=body)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_each_object_type(self):
        for object_type in ["quote", "person", "payment"]:
            body = build_quoter_body(json.dumps({"id": f"{object_type}_1"}))
            response = client.post(f"/webhooks/quoter?object={object_type}", data=body)
            assert response.status_code == 200, f"Failed for object type: {object_type}"

    def test_invalid_json_returns_400(self):
        body = build_quoter_body("not-json")
        response = client.post("/webhooks/quoter?object=quote", data=body)
        assert response.status_code == 400


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
