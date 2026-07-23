# Generated with: microsoft-graph-webhooks skill
# https://github.com/hookdeck/webhook-skills
#
# Create (and renew) a Microsoft Graph subscription with the official SDK.
# The SDK manages subscriptions only — it does NOT verify notifications.
#
# Usage:
#   python subscribe.py            # create a subscription
#   python subscribe.py renew <id> # renew an existing subscription
#
# Requires (in .env): MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID,
# MICROSOFT_CLIENT_SECRET, NOTIFICATION_URL, MICROSOFT_GRAPH_CLIENT_STATE,
# and optionally GRAPH_RESOURCE, GRAPH_CHANGE_TYPES.

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

from azure.identity.aio import ClientSecretCredential
from dotenv import load_dotenv
from msgraph import GraphServiceClient
from msgraph.generated.models.subscription import Subscription

load_dotenv()


def graph_client() -> GraphServiceClient:
    credential = ClientSecretCredential(
        tenant_id=os.environ["MICROSOFT_TENANT_ID"],
        client_id=os.environ["MICROSOFT_CLIENT_ID"],
        client_secret=os.environ["MICROSOFT_CLIENT_SECRET"],
    )
    return GraphServiceClient(
        credentials=credential,
        scopes=["https://graph.microsoft.com/.default"],
    )


def expiry_from_now(minutes: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)


async def create_subscription() -> None:
    client = graph_client()
    subscription = Subscription(
        change_type=os.environ.get("GRAPH_CHANGE_TYPES", "created,updated"),
        notification_url=os.environ["NOTIFICATION_URL"],
        lifecycle_notification_url=os.environ["NOTIFICATION_URL"],
        resource=os.environ.get("GRAPH_RESOURCE", "me/messages"),
        expiration_date_time=expiry_from_now(60),  # renew before this passes
        client_state=os.environ["MICROSOFT_GRAPH_CLIENT_STATE"],
        latest_supported_tls_version="v1_2",
    )
    result = await client.subscriptions.post(subscription)
    print("Created subscription:", result.id)


async def renew_subscription(subscription_id: str) -> None:
    client = graph_client()
    result = await client.subscriptions.by_subscription_id(subscription_id).patch(
        Subscription(expiration_date_time=expiry_from_now(60))
    )
    print("Renewed subscription:", result.id, "until", result.expiration_date_time)


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "renew":
        asyncio.run(renew_subscription(sys.argv[2]))
    else:
        asyncio.run(create_subscription())
