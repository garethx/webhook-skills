import os
import json
import hmac
import hashlib

# Set test environment variables before importing the app
os.environ["ALCHEMY_SIGNING_KEY"] = "whsec_test_signing_key"

from fastapi.testclient import TestClient

from main import app, verify_alchemy_signature

client = TestClient(app)

SIGNING_KEY = os.environ["ALCHEMY_SIGNING_KEY"]


def generate_alchemy_signature(payload: str, signing_key: str) -> str:
    """Generate a valid Alchemy signature for testing.

    Mirrors Alchemy: HMAC-SHA256 of the raw body, hex-encoded, no prefix.
    """
    return hmac.new(
        signing_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


class TestVerifyAlchemySignature:
    """Tests for the signature verification function."""

    def test_valid_signature_returns_true(self):
        payload = b'{"type":"ADDRESS_ACTIVITY"}'
        signature = generate_alchemy_signature(payload.decode(), SIGNING_KEY)

        assert verify_alchemy_signature(payload, signature, SIGNING_KEY) is True

    def test_invalid_signature_returns_false(self):
        payload = b'{"type":"ADDRESS_ACTIVITY"}'

        assert verify_alchemy_signature(payload, "deadbeef", SIGNING_KEY) is False

    def test_missing_signature_returns_false(self):
        payload = b'{"type":"ADDRESS_ACTIVITY"}'

        assert verify_alchemy_signature(payload, None, SIGNING_KEY) is False

    def test_wrong_key_returns_false(self):
        payload = b'{"type":"ADDRESS_ACTIVITY"}'
        signature = generate_alchemy_signature(payload.decode(), SIGNING_KEY)

        assert verify_alchemy_signature(payload, signature, "wrong_key") is False

    def test_prefixed_signature_is_rejected(self):
        # Alchemy sends a bare hex digest with no "sha256=" prefix
        payload = b'{"type":"MINED_TRANSACTION"}'
        bare_hex = generate_alchemy_signature(payload.decode(), SIGNING_KEY)

        assert verify_alchemy_signature(payload, f"sha256={bare_hex}", SIGNING_KEY) is False
        assert verify_alchemy_signature(payload, bare_hex, SIGNING_KEY) is True


class TestAlchemyWebhook:
    """Tests for the webhook endpoint."""

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/alchemy",
            content='{"type":"ADDRESS_ACTIVITY"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"type": "ADDRESS_ACTIVITY"})

        response = client.post(
            "/webhooks/alchemy",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Alchemy-Signature": "invalidsignature",
            },
        )
        assert response.status_code == 400

    def test_valid_address_activity_returns_200(self):
        payload = json.dumps(
            {
                "webhookId": "wh_test",
                "id": "whevt_test",
                "type": "ADDRESS_ACTIVITY",
                "event": {
                    "network": "ETH_MAINNET",
                    "activity": [
                        {
                            "fromAddress": "0xabc",
                            "toAddress": "0xdef",
                            "value": 1.5,
                            "asset": "ETH",
                            "hash": "0x123",
                        }
                    ],
                },
            }
        )
        signature = generate_alchemy_signature(payload, SIGNING_KEY)

        response = client.post(
            "/webhooks/alchemy",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Alchemy-Signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_mined_transaction(self):
        payload = json.dumps(
            {
                "webhookId": "wh_test",
                "id": "whevt_mined",
                "type": "MINED_TRANSACTION",
                "event": {"network": "ETH_MAINNET", "transaction": {"hash": "0xmined"}},
            }
        )
        signature = generate_alchemy_signature(payload, SIGNING_KEY)

        response = client.post(
            "/webhooks/alchemy",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Alchemy-Signature": signature,
            },
        )
        assert response.status_code == 200

    def test_handles_nft_activity(self):
        payload = json.dumps(
            {
                "webhookId": "wh_test",
                "id": "whevt_nft",
                "type": "NFT_ACTIVITY",
                "event": {
                    "network": "ETH_MAINNET",
                    "activity": [
                        {
                            "contractAddress": "0xnft",
                            "erc721TokenId": "0x1",
                            "fromAddress": "0xabc",
                            "toAddress": "0xdef",
                        }
                    ],
                },
            }
        )
        signature = generate_alchemy_signature(payload, SIGNING_KEY)

        response = client.post(
            "/webhooks/alchemy",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Alchemy-Signature": signature,
            },
        )
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
