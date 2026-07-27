# Generated with: ethoca-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import base64
import hmac
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException

load_dotenv()

app = FastAPI(title="Ethoca Webhook Handler")


def verify_ethoca_auth(authorization: str, username: str, password: str) -> bool:
    """
    Verify Ethoca webhook HTTP Basic Auth.

    Ethoca Alerts Push API deliveries have NO HMAC/signature header. Trust comes
    from mutual TLS (MSSL, Entrust CA) at the transport layer plus these Basic
    Auth credentials at the application layer.
    """
    if not authorization or not authorization.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(authorization[6:]).decode("utf-8")
    except Exception:
        return False
    if ":" not in decoded:
        return False
    user, _, pw = decoded.partition(":")  # split on the FIRST colon; passwords may contain ':'
    return hmac.compare_digest(user, username) and hmac.compare_digest(pw, password)


def alert_category(alert_type: Any) -> str:
    """
    Normalize alertType to one of the two Ethoca categories. Confirm the literal
    values (historically numeric) against your Ethoca onboarding schema.
    """
    mapping = {"fraud": "fraud", "dispute": "dispute", "1": "fraud", "2": "dispute"}
    return mapping.get(str(alert_type), "unknown")


def require_ethoca_auth(authorization: Optional[str] = Header(None)) -> bool:
    """FastAPI dependency that enforces Ethoca Basic Auth."""
    expected_username = os.getenv("ETHOCA_WEBHOOK_USERNAME")
    expected_password = os.getenv("ETHOCA_WEBHOOK_PASSWORD")

    if not expected_username or not expected_password:
        print("ERROR: Missing ETHOCA_WEBHOOK_USERNAME or ETHOCA_WEBHOOK_PASSWORD")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not verify_ethoca_auth(authorization or "", expected_username, expected_password):
        raise HTTPException(status_code=401, detail="Unauthorized")

    return True


@app.post("/webhooks/ethoca")
async def handle_ethoca_webhook(
    alert: Dict[str, Any],
    _auth: bool = Depends(require_ethoca_auth),
):
    """Handle Ethoca Alerts (fraud and dispute)."""
    category = alert_category(alert.get("alertType"))
    transaction = alert.get("transaction", {})

    print(f"Received Ethoca {alert.get('alertType')} alert ({category}): {alert.get('id')}")

    if category == "fraud":
        print(f"Fraud alert: {alert.get('id')} {transaction.get('arn')}")
        # TODO: Stop fulfilment, refund, cancel subscription, block the account.

    elif category == "dispute":
        print(f"Dispute alert: {alert.get('id')} {transaction.get('arn')}")
        # TODO: Refund to prevent a chargeback, gather evidence, update the order.

    else:
        print(f"Unhandled alertType: {alert.get('alertType')}")

    # TODO: Report the outcome back to Ethoca via the OAuth 1.0a Outcome API.

    # Acknowledge receipt.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
