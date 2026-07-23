import os
import json
import hmac
import hashlib

# Set test environment variables before importing app (read at import time)
os.environ["VERCEL_LOG_DRAIN_SECRET"] = "test_drain_secret"
os.environ["VERCEL_VERIFY"] = "test_verify_token"

from fastapi.testclient import TestClient
from main import app, verify_vercel_signature, parse_logs

client = TestClient(app)

SECRET = os.environ["VERCEL_LOG_DRAIN_SECRET"]
VERIFY_TOKEN = os.environ["VERCEL_VERIFY"]


def generate_signature(payload: bytes, secret: str) -> str:
    """Generate a valid Vercel log drain signature (HMAC-SHA1 hex, no prefix)."""
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha1).hexdigest()


JSON_BATCH = json.dumps([
    {
        "id": "1573817187330377061717300000",
        "deploymentId": "dpl_233NRGRjVZX1caZrXWtz5g1TAksD",
        "source": "build",
        "level": "info",
        "message": "Build completed successfully",
        "buildId": "bld_cotnkcr76",
        "type": "stdout",
        "timestamp": 1573817187330,
    },
    {
        "id": "1573817250283254651097202070",
        "source": "lambda",
        "level": "info",
        "message": "API request processed",
        "statusCode": 200,
        "path": "/api/users",
        "environment": "production",
        "timestamp": 1573817250283,
    },
]).encode("utf-8")

NDJSON_BATCH = (
    b'{"id":"a","source":"edge","level":"info","message":"edge log","timestamp":1}\n'
    b'{"id":"b","source":"firewall","level":"warning","path":"/admin",'
    b'"proxy":{"wafAction":"deny","clientIp":"1.2.3.4"}}'
)


class TestVerifyVercelSignature:
    def test_valid_signature_returns_true(self):
        signature = generate_signature(JSON_BATCH, SECRET)
        assert verify_vercel_signature(JSON_BATCH, signature, SECRET) is True

    def test_invalid_signature_returns_false(self):
        assert verify_vercel_signature(JSON_BATCH, "deadbeef", SECRET) is False

    def test_missing_signature_returns_false(self):
        assert verify_vercel_signature(JSON_BATCH, None, SECRET) is False

    def test_tampered_body_returns_false(self):
        signature = generate_signature(JSON_BATCH, SECRET)
        tampered = JSON_BATCH.replace(b"200", b"500")
        assert verify_vercel_signature(tampered, signature, SECRET) is False

    def test_wrong_secret_returns_false(self):
        signature = generate_signature(JSON_BATCH, SECRET)
        assert verify_vercel_signature(JSON_BATCH, signature, "wrong_secret") is False


class TestParseLogs:
    def test_parses_json_array_batch(self):
        logs = parse_logs(JSON_BATCH)
        assert len(logs) == 2
        assert logs[0]["source"] == "build"
        assert logs[1]["source"] == "lambda"

    def test_parses_ndjson_batch(self):
        logs = parse_logs(NDJSON_BATCH)
        assert len(logs) == 2
        assert logs[0]["source"] == "edge"
        assert logs[1]["source"] == "firewall"

    def test_empty_body_returns_empty_list(self):
        assert parse_logs(b"") == []


class TestVercelLogDrainEndpoint:
    def test_handshake_returns_200_with_verify_header(self):
        response = client.post(
            "/webhooks/vercel-log-drains",
            content="",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 200
        assert response.headers.get("x-vercel-verify") == VERIFY_TOKEN
        assert response.json() == {"received": True, "handshake": True}

    def test_invalid_signature_returns_403(self):
        response = client.post(
            "/webhooks/vercel-log-drains",
            content=JSON_BATCH,
            headers={
                "Content-Type": "application/json",
                "x-vercel-signature": "deadbeef",
            },
        )
        assert response.status_code == 403
        assert response.json()["code"] == "invalid_signature"

    def test_valid_json_batch_returns_200(self):
        signature = generate_signature(JSON_BATCH, SECRET)
        response = client.post(
            "/webhooks/vercel-log-drains",
            content=JSON_BATCH,
            headers={
                "Content-Type": "application/json",
                "x-vercel-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True, "count": 2}

    def test_valid_ndjson_batch_returns_200(self):
        signature = generate_signature(NDJSON_BATCH, SECRET)
        response = client.post(
            "/webhooks/vercel-log-drains",
            content=NDJSON_BATCH,
            headers={
                "Content-Type": "application/x-ndjson",
                "x-vercel-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True, "count": 2}


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
