import hashlib
import hmac
import json
import os
import time

from fastapi.testclient import TestClient

# Set test environment variables before importing the app.
os.environ["ZEROHASH_WEBHOOK_SECRET"] = "test_shared_secret"

from main import app  # noqa: E402

client = TestClient(app)

WEBHOOK_SECRET = os.environ["ZEROHASH_WEBHOOK_SECRET"]


def sign_with_timestamp(payload: str, timestamp: str, secret: str) -> str:
    """Recommended scheme: HMAC-SHA256 (hex) of `payload + timestamp`."""
    signed = (payload + timestamp).encode("utf-8")
    return hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()


def sign_legacy(payload: str, secret: str) -> str:
    """Legacy scheme: HMAC-SHA256 (hex) of `payload` only."""
    return hmac.new(
        secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def now_ms() -> str:
    return str(int(time.time() * 1000))


def trade_body(status: str = "terminated", trade_id: str = "trade_123") -> str:
    return json.dumps(
        {
            "trade_id": trade_id,
            "status": status,
            "symbol": "BTC/USD",
            "quantity": "0.5",
            "price": "60000.00",
            "side": "buy",
        }
    )


def now_seconds() -> str:
    return str(int(time.time()))


def payment_body(status: str = "settled", payment_id: str = "payment_123") -> str:
    """The payment_status_changed payload shape is not documented - this is a
    plausible placeholder, not a verified schema."""
    return json.dumps(
        {
            "payment_id": payment_id,
            "status": status,
            "asset": "USD",
            "amount": "250.00",
        }
    )


def balance_body(account_type: str = "available") -> str:
    return json.dumps(
        {
            "account_group": "00SCXM",
            "account_label": "general",
            "asset": "USD",
            "account_type": account_type,
            "balance": "1500.00",
        }
    )


class TestZeroHashWebhook:
    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/zerohash",
            content=trade_body(),
            headers={
                "Content-Type": "application/json",
                "x-zh-hook-payload-type": "trade_status_changed",
            },
        )
        assert response.status_code == 400
        assert "Missing Zero Hash signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        response = client.post(
            "/webhooks/zerohash",
            content=trade_body(),
            headers={
                "Content-Type": "application/json",
                "x-zh-hook-payload-type": "trade_status_changed",
                "x-zh-hook-timestamp": now_ms(),
                "x-zh-hook-signature": "deadbeef",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_payload_returns_400(self):
        timestamp = now_ms()
        original = trade_body("terminated", "trade_original")
        signature = sign_with_timestamp(original, timestamp, WEBHOOK_SECRET)
        tampered = trade_body("terminated", "trade_tampered")

        response = client.post(
            "/webhooks/zerohash",
            content=tampered,
            headers={
                "Content-Type": "application/json",
                "x-zh-hook-payload-type": "trade_status_changed",
                "x-zh-hook-timestamp": timestamp,
                "x-zh-hook-signature": signature,
            },
        )
        assert response.status_code == 400

    def test_expired_timestamp_returns_400(self):
        body = trade_body()
        # 10 minutes ago — outside the ±5 minute tolerance.
        timestamp = str(int(time.time() * 1000) - 10 * 60 * 1000)
        signature = sign_with_timestamp(body, timestamp, WEBHOOK_SECRET)

        response = client.post(
            "/webhooks/zerohash",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-zh-hook-payload-type": "trade_status_changed",
                "x-zh-hook-timestamp": timestamp,
                "x-zh-hook-signature": signature,
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        body = trade_body()
        timestamp = now_ms()
        signature = sign_with_timestamp(body, timestamp, WEBHOOK_SECRET)

        response = client.post(
            "/webhooks/zerohash",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-zh-hook-payload-type": "trade_status_changed",
                "x-zh-hook-timestamp": timestamp,
                "x-zh-hook-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_seconds_precision_timestamp_returns_200(self):
        # Zero Hash does not document whether the timestamp is seconds or ms.
        body = trade_body()
        timestamp = now_seconds()
        signature = sign_with_timestamp(body, timestamp, WEBHOOK_SECRET)

        response = client.post(
            "/webhooks/zerohash",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-zh-hook-payload-type": "trade_status_changed",
                "x-zh-hook-timestamp": timestamp,
                "x-zh-hook-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_expired_seconds_precision_timestamp_returns_400(self):
        body = trade_body()
        # 10 minutes ago, in seconds - outside the ±5 minute tolerance.
        timestamp = str(int(time.time()) - 10 * 60)
        signature = sign_with_timestamp(body, timestamp, WEBHOOK_SECRET)

        response = client.post(
            "/webhooks/zerohash",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-zh-hook-payload-type": "trade_status_changed",
                "x-zh-hook-timestamp": timestamp,
                "x-zh-hook-signature": signature,
            },
        )
        assert response.status_code == 400

    def test_non_numeric_timestamp_returns_400(self):
        body = trade_body()
        timestamp = "not-a-timestamp"
        signature = sign_with_timestamp(body, timestamp, WEBHOOK_SECRET)

        response = client.post(
            "/webhooks/zerohash",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-zh-hook-payload-type": "trade_status_changed",
                "x-zh-hook-timestamp": timestamp,
                "x-zh-hook-signature": signature,
            },
        )
        assert response.status_code == 400

    def test_valid_legacy_signature_returns_200(self):
        body = balance_body()
        signature = sign_legacy(body, WEBHOOK_SECRET)

        response = client.post(
            "/webhooks/zerohash",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-zh-hook-payload-type": "account_balance.changed",
                "x-zh-hook-signature-256": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_all_payload_types(self):
        cases = [
            ("trade_status_changed", trade_body("accepted")),
            ("trade_status_changed", trade_body("active")),
            ("payment_status_changed", payment_body()),
            # Both spellings of the (unconfirmed) balance event name.
            ("account_balance.changed", balance_body("collateral")),
            ("account_balance_changed", balance_body("available")),
            ("unknown.type", trade_body()),
        ]

        for payload_type, body in cases:
            timestamp = now_ms()
            signature = sign_with_timestamp(body, timestamp, WEBHOOK_SECRET)

            response = client.post(
                "/webhooks/zerohash",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "x-zh-hook-payload-type": payload_type,
                    "x-zh-hook-timestamp": timestamp,
                    "x-zh-hook-signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for payload type: {payload_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
