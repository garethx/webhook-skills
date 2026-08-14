import os

import pytest

# Set test token before importing the app.
# Aircall tokens are opaque strings issued at webhook creation.
TEST_TOKEN = "df76g76dpziygs567f0"
os.environ["AIRCALL_WEBHOOK_TOKEN"] = TEST_TOKEN

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_aircall_webhook  # noqa: E402

client = TestClient(app)


def build_payload(event, data=None, **overrides):
    """Build an Aircall webhook payload.

    The envelope always has resource, event, timestamp, token, data.
    The `token` IS the credential — there is no signature to generate.
    """
    payload = {
        "resource": "call",
        "event": event,
        "timestamp": 1732622896,
        "token": TEST_TOKEN,
        "data": data if data is not None else {},
    }
    payload.update(overrides)
    return payload


# Doc-sourced call.created data (Aircall API reference sample)
CALL_DATA = {
    "id": 123,
    "direct_link": "https://api.aircall.io/v1/calls/123",
    "direction": "outbound",
    "call_uuid": "CAed058bba60a84d62c77cee898a852b05",
    "status": "initial",
    "missed_call_reason": None,
    "started_at": 1732622895,
    "answered_at": None,
    "ended_at": None,
    "duration": 0,
    "cost": "0",
    "hangup_cause": None,
    "voicemail": None,
    "recording": None,
    "raw_digits": "+1 800-123-4567",
    "participants": [
        {"phone_number": "+1 800-123-4567", "type": "external"},
        {"id": 123, "name": "John Doe", "type": "user"},
    ],
}

# Doc-sourced number.closed data (Aircall API reference sample)
NUMBER_DATA = {
    "id": 456,
    "direct_link": "https://api.aircall.io/v1/numbers/123",
    "name": "My first Aircall Number",
    "digits": "+33 1 76 36 06 95",
    "country": "FR",
    "time_zone": "Europe/Paris",
    "open": False,
    "users": [
        {
            "id": 456,
            "direct_link": "https://api.aircall.io/v1/users/456",
            "name": "Madelaine Dupont",
            "email": "madelaine.dupont@aircall.io",
            "available": False,
            "language": "en-US",
        }
    ],
}


class TestHealthCheck:
    def test_health_check(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestVerifyFunction:
    def test_accepts_exact_token(self):
        assert verify_aircall_webhook(TEST_TOKEN, TEST_TOKEN) is True

    def test_rejects_wrong_token_of_same_length(self):
        wrong = "x" * len(TEST_TOKEN)
        assert len(wrong) == len(TEST_TOKEN)
        assert verify_aircall_webhook(wrong, TEST_TOKEN) is False

    def test_rejects_different_length_token_without_raising(self):
        # secrets.compare_digest handles unequal lengths without raising
        assert verify_aircall_webhook("short", TEST_TOKEN) is False

    def test_rejects_missing_tokens(self):
        assert verify_aircall_webhook(None, TEST_TOKEN) is False
        assert verify_aircall_webhook("", TEST_TOKEN) is False

    def test_rejects_when_no_expected_token_configured(self):
        assert verify_aircall_webhook(TEST_TOKEN, None) is False
        assert verify_aircall_webhook(TEST_TOKEN, "") is False

    def test_rejects_non_string_token(self):
        assert verify_aircall_webhook(12345, TEST_TOKEN) is False

    def test_is_case_sensitive(self):
        assert verify_aircall_webhook(TEST_TOKEN.upper(), TEST_TOKEN) is False


class TestTokenVerification:
    def test_rejects_payload_with_no_token_field(self):
        payload = build_payload("call.created", CALL_DATA)
        del payload["token"]

        response = client.post("/webhooks/aircall", json=payload)

        assert response.status_code == 401
        assert response.json() == {"error": "Unauthorized"}

    def test_rejects_payload_with_wrong_token(self):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload("call.created", CALL_DATA, token="wrong_token_value"),
        )

        assert response.status_code == 401
        assert response.json() == {"error": "Unauthorized"}

    def test_rejects_token_differing_only_in_last_character(self):
        near_miss = TEST_TOKEN[:-1] + "X"
        response = client.post(
            "/webhooks/aircall",
            json=build_payload("call.created", CALL_DATA, token=near_miss),
        )

        assert response.status_code == 401

    def test_rejects_different_length_token(self):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload("call.created", CALL_DATA, token="short"),
        )

        assert response.status_code == 401

    def test_does_not_accept_token_from_header(self):
        # Aircall has no signature header — only the body token counts.
        payload = build_payload("call.created", CALL_DATA)
        del payload["token"]

        response = client.post(
            "/webhooks/aircall",
            headers={
                "X-Aircall-Signature": TEST_TOKEN,
                "X-Aircall-Token": TEST_TOKEN,
                "Authorization": f"Bearer {TEST_TOKEN}",
            },
            json=payload,
        )

        assert response.status_code == 401

    def test_accepts_payload_with_correct_token(self):
        response = client.post(
            "/webhooks/aircall", json=build_payload("call.created", CALL_DATA)
        )

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": "call.created"}


class TestPayloadValidation:
    def test_returns_400_for_invalid_json(self):
        response = client.post(
            "/webhooks/aircall",
            headers={"Content-Type": "application/json"},
            content=b"{ not valid json",
        )

        assert response.status_code == 400
        assert response.json() == {"error": "Invalid JSON"}

    def test_returns_400_when_event_missing(self):
        payload = build_payload("call.created", CALL_DATA)
        del payload["event"]

        response = client.post("/webhooks/aircall", json=payload)

        assert response.status_code == 400
        assert response.json() == {"error": "Missing event"}

    def test_verifies_token_before_validating_envelope(self):
        # Missing `event` AND a bad token -> 401 wins, proving verification is first
        payload = build_payload("call.created", CALL_DATA, token="wrong_token_value")
        del payload["event"]

        response = client.post("/webhooks/aircall", json=payload)

        assert response.status_code == 401

    def test_returns_400_for_non_object_payload(self):
        response = client.post("/webhooks/aircall", json=["not", "an", "object"])

        assert response.status_code == 400


CALL_EVENTS = [
    "call.created",
    "call.ringing_on_agent",
    "call.agent_declined",
    "call.answered",
    "call.transferred",
    "call.external_transferred",
    "call.unsuccessful_transfer",
    "call.hungup",
    "call.ended",
    "call.hold",
    "call.unhold",
    "call.ivr_option_selected",
    "call.comm_assets_generated",
    "call.voicemail_left",
    "call.assigned",
    "call.archived",
    "call.tagged",
    "call.untagged",
    "call.commented",
]


class TestCallEvents:
    @pytest.mark.parametrize("event", CALL_EVENTS)
    def test_handles_call_event(self, event):
        data = {**CALL_DATA, "tags": [{"name": "support"}]}
        response = client.post("/webhooks/aircall", json=build_payload(event, data))

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": event}

    def test_handles_call_ended_with_duration_and_cost(self):
        data = {
            **CALL_DATA,
            "status": "done",
            "answered_at": 1732622900,
            "ended_at": 1732622960,
            "duration": 60,
            "cost": "0.02",
            "hangup_cause": "normal_clearing",
        }
        response = client.post("/webhooks/aircall", json=build_payload("call.ended", data))

        assert response.status_code == 200
        assert response.json()["event"] == "call.ended"


USER_V2_EVENTS = [
    "user.created.v2",
    "user.deleted.v2",
    "user.connected.v2",
    "user.disconnected.v2",
    "user.opened.v2",
    "user.closed.v2",
    "user.wut_start.v2",
    "user.wut_end.v2",
]

USER_V1_EVENTS = [
    "user.created",
    "user.deleted",
    "user.connected",
    "user.disconnected",
    "user.opened",
    "user.closed",
    "user.wut_start",
    "user.wut_end",
]


class TestUserEvents:
    @pytest.mark.parametrize("event", USER_V2_EVENTS)
    def test_handles_user_v2_event(self, event):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload(
                event,
                {
                    "id": 456,
                    "name": "Madelaine Dupont",
                    "email": "madelaine.dupont@aircall.io",
                },
                resource="user",
            ),
        )

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": event}

    @pytest.mark.parametrize("event", USER_V1_EVENTS)
    def test_still_handles_deprecated_user_v1_event(self, event):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload(
                event, {"id": 456, "name": "Madelaine Dupont"}, resource="user"
            ),
        )

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": event}

    def test_handles_both_user_closed_events_with_substatus(self):
        # Aircall sends TWO user.closed events when substatus is enabled:
        # one with availability_status only, one with the selected substatus.
        first = client.post(
            "/webhooks/aircall",
            json=build_payload(
                "user.closed.v2",
                {
                    "id": 456,
                    "name": "Madelaine Dupont",
                    "availability_status": "unavailable",
                },
                resource="user",
            ),
        )
        second = client.post(
            "/webhooks/aircall",
            json=build_payload(
                "user.closed.v2",
                {
                    "id": 456,
                    "name": "Madelaine Dupont",
                    "availability_status": "unavailable",
                    "substatus": "in_meeting",
                },
                resource="user",
            ),
        )

        assert first.status_code == 200
        assert second.status_code == 200


class TestNumberEvents:
    @pytest.mark.parametrize(
        "event", ["number.created", "number.opened", "number.closed", "number.deleted"]
    )
    def test_handles_number_event(self, event):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload(event, NUMBER_DATA, resource="number"),
        )

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": event}

    def test_handles_documented_number_closed_payload_verbatim(self):
        response = client.post(
            "/webhooks/aircall",
            json={
                "resource": "number",
                "event": "number.closed",
                "timestamp": 1585001020,
                "token": TEST_TOKEN,
                "data": NUMBER_DATA,
            },
        )

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": "number.closed"}


class TestContactEvents:
    @pytest.mark.parametrize(
        "event", ["contact.created", "contact.updated", "contact.deleted"]
    )
    def test_handles_contact_event(self, event):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload(
                event,
                {
                    "id": 789,
                    "first_name": "Ada",
                    "last_name": "Lovelace",
                    # Contact events use UTC strings, not integers
                    "created_at": "2026-03-03T09:35:00Z",
                    "updated_at": "2026-03-03T09:40:00Z",
                },
                resource="contact",
            ),
        )

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": event}


class TestMessageEvents:
    @pytest.mark.parametrize(
        "event", ["message.sent", "message.received", "message.status_updated"]
    )
    def test_handles_message_event(self, event):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload(
                event,
                # channel: None means SMS or MMS
                {"id": "msg-1", "body": "Hello", "status": "delivered", "channel": None},
                resource="message",
            ),
        )

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": event}

    def test_handles_whatsapp_message(self):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload(
                "message.received",
                {"id": "msg-2", "body": "Hi there", "channel": "whatsapp"},
                resource="message",
            ),
        )

        assert response.status_code == 200
        assert response.json()["event"] == "message.received"

    @pytest.mark.parametrize(
        "event",
        ["group_message.sent", "group_message.received", "group_message.status_updated"],
    )
    def test_handles_group_message_event(self, event):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload(
                event,
                {
                    "id": "a3f7c821-4e92-4b1d-8c6f-0d5e2a9b3f74",
                    "group_conversation_id": "b8d2e047-7f3a-4c85-9e1d-6a4b0c7f2e38",
                    "participants": ["12025550147", "13105550293", "16465550812"],
                    "body": "test",
                    "status": "sent",
                    "created_at": "2026-03-03T09:35:00.520Z",
                },
                resource="message",
            ),
        )

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": event}


CI_EVENTS = [
    "transcription.created",
    "summary.created",
    "topics.created",
    "sentiment.created",
    "action_item.created",
    "playbook_result.created",
    "playbook_result.updated",
    "realtime_transcription.utterances_received",
    "custom_summary.result_created",
    "custom_summary.result_updated",
    "call_evaluation.created",
    "call_evaluation.updated",
]


class TestConversationIntelligenceAndAIEvents:
    @pytest.mark.parametrize("event", CI_EVENTS)
    def test_handles_conversation_intelligence_event(self, event):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload(
                event, {"call_id": 123}, resource="conversation_intelligence"
            ),
        )

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": event}

    @pytest.mark.parametrize(
        "event",
        [
            "ai_voice_agent.started",
            "ai_voice_agent.ended",
            "ai_voice_agent.escalated",
            "ai_voice_agent.summary",
        ],
    )
    def test_handles_ai_voice_agent_event(self, event):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload(event, {"call_id": 123}, resource="ai_voice_agent"),
        )

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": event}

    @pytest.mark.parametrize(
        "event", ["analytics.report_created", "analytics.report_failed"]
    )
    def test_handles_analytics_event(self, event):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload(
                event,
                {"download_url": "https://example.s3.amazonaws.com/export.csv"},
                resource="analytics",
            ),
        )

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": event}

    def test_handles_integration_deleted(self):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload(
                "integration.deleted",
                {"integration_id": 42, "company_id": 1},
                resource="integration",
            ),
        )

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": "integration.deleted"}


class TestForwardCompatibilityAndIdempotency:
    def test_returns_200_for_unknown_event(self):
        # A non-2xx counts toward the 50 failures that auto-disable the webhook,
        # so unknown events must still be acknowledged.
        response = client.post(
            "/webhooks/aircall", json=build_payload("call.some_future_event", CALL_DATA)
        )

        assert response.status_code == 200
        assert response.json() == {"received": True, "event": "call.some_future_event"}

    def test_returns_200_for_unknown_resource(self):
        response = client.post(
            "/webhooks/aircall",
            json=build_payload("future_resource.created", {}, resource="future_resource"),
        )

        assert response.status_code == 200

    def test_accepts_duplicate_deliveries(self):
        # Delivery is at-least-once.
        payload = build_payload("call.answered", CALL_DATA)

        first = client.post("/webhooks/aircall", json=payload)
        second = client.post("/webhooks/aircall", json=payload)

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json() == second.json()

    def test_accepts_out_of_order_deliveries(self):
        # call.ended arriving before call.created is legal per Aircall's docs.
        ended = client.post(
            "/webhooks/aircall",
            json=build_payload("call.ended", {**CALL_DATA, "duration": 60}),
        )
        created = client.post(
            "/webhooks/aircall", json=build_payload("call.created", CALL_DATA)
        )

        assert ended.status_code == 200
        assert created.status_code == 200

    def test_accepts_old_timestamp_no_replay_window(self):
        # `timestamp` is unsigned metadata and must NOT gate acceptance.
        response = client.post(
            "/webhooks/aircall",
            json=build_payload("call.created", CALL_DATA, timestamp=1),
        )

        assert response.status_code == 200
        assert response.json()["event"] == "call.created"
