# Generated with: trello-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import base64
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, HTTPException

load_dotenv()

app = FastAPI()

trello_secret = os.environ.get("TRELLO_SECRET", "")
trello_callback_url = os.environ.get("TRELLO_CALLBACK_URL", "")


def verify_trello_webhook(
    raw_body: bytes, signature: str, secret: str, callback_url: str
) -> bool:
    """Verify a Trello webhook signature.

    Trello signs base64(HMAC-SHA1(rawBody + callbackURL, applicationSecret)) and
    sends it in the ``x-trello-webhook`` header. The callback URL is concatenated to
    the raw body exactly as it was registered when the webhook was created.
    """
    if not signature:
        return False
    digest = hmac.new(
        secret.encode(),
        raw_body + callback_url.encode(),
        hashlib.sha1,
    ).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, signature)


@app.head("/webhooks/trello")
async def trello_webhook_head():
    # When a webhook is created, Trello sends a HEAD request to the callback URL and
    # creation fails unless it returns 200. HEAD carries no body or signature.
    return Response(status_code=200)


@app.post("/webhooks/trello")
async def trello_webhook(request: Request):
    # Read the raw body for signature verification (do not parse first).
    raw_body = await request.body()
    signature = request.headers.get("x-trello-webhook", "")

    if not verify_trello_webhook(
        raw_body, signature, trello_secret, trello_callback_url
    ):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification.
    payload = json.loads(raw_body)
    action = payload.get("action", {})
    action_type = action.get("type")
    data = action.get("data", {})

    print(f"Received Trello action: {action_type}")

    # The event name is action.type (there is no event header).
    if action_type == "createCard":
        print(f"New card: {data.get('card', {}).get('name')}")
        # TODO: Sync new card, trigger automation, etc.

    elif action_type == "updateCard":
        print(f"Card updated: {data.get('card', {}).get('name')}")
        # TODO: Inspect data['old'] / listBefore / listAfter for the change.

    elif action_type == "deleteCard":
        print(f"Card deleted from board: {data.get('board', {}).get('name')}")
        # TODO: Clean up linked records.

    elif action_type == "commentCard":
        print(f"Comment added: {data.get('text')}")
        # TODO: Notify stakeholders, log discussion.

    elif action_type == "addAttachmentToCard":
        print(f"Attachment added: {data.get('attachment', {}).get('name')}")
        # TODO: Ingest file, scan link.

    elif action_type == "addMemberToCard":
        print(f"Member added to card: {data.get('idMember')}")
        # TODO: Notify the assignee.

    elif action_type == "createList":
        print(f"New list: {data.get('list', {}).get('name')}")
        # TODO: Mirror board structure.

    elif action_type == "updateList":
        print(f"List updated: {data.get('list', {}).get('name')}")
        # TODO: Keep column mappings in sync.

    elif action_type == "addMemberToBoard":
        print(f"Member added to board: {data.get('idMemberAdded')}")
        # TODO: Provision access.

    elif action_type == "removeMemberFromBoard":
        print(f"Member removed from board: {data.get('idMember')}")
        # TODO: Deprovision access.

    elif action_type == "updateBoard":
        print(f"Board updated: {data.get('board', {}).get('name')}")
        # TODO: Update cached metadata.

    else:
        print(f"Unhandled action type: {action_type}")

    # Acknowledge quickly; do heavy work asynchronously.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
