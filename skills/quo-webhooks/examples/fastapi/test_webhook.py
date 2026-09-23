# Generated with: quo-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time

import pytest

# SCHEME A key. Quo returns `whsec_` + base64(raw key bytes) from POST /webhooks.
# Here the raw key is the ASCII string below so the base64 is readable in
# failure output.
RAW_KEY = "quo_test_secret_key_32_bytes!!"
TEST_WEBHOOK_KEY = "whsec_" + base64.b64encode(RAW_KEY.encode()).decode()
WRONG_WEBHOOK_KEY = "whsec_" + base64.b64encode(b"wrong_key").decode()

# SCHEME B secret. Bare base64, no prefix -- this is what "Reveal signing
# secret" shows in the Quo app. Quo's own docs use an example key that decodes
# to the ASCII string below.
LEGACY_RAW_KEY = "GfK3j4lXA5ZrRu64ofat50srGzoIHHUX"
TEST_LEGACY_SECRET = base64.b64encode(LEGACY_RAW_KEY.encode()).decode()

os.environ["QUO_WEBHOOK_KEY"] = TEST_WEBHOOK_KEY
os.environ["QUO_LEGACY_SIGNING_SECRET"] = TEST_LEGACY_SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import (  # noqa: E402
    app,
    normalize_event,
    verify_quo_legacy_signature,
    verify_quo_signature,
)

client = TestClient(app)

# --- Fixtures ---------------------------------------------------------------

# Current envelope (apiVersion 2026-03-30): data.resource / context / links.
CURRENT_EVENT = {
    "id": "EV123",
    "apiVersion": "2026-03-30",
    "createdAt": "2026-04-13T12:00:00.000Z",
    "type": "call.summary.completed",
    "data": {
        "resource": {"id": "AC123", "updatedAt": "2026-04-13T12:00:00.000Z"},
        "context": {"orgId": "OR123"},
        "links": {"quo": "https://my.quo.com/calls/AC123"},
    },
}

# Legacy envelope (apiVersion v2): data.object, plus a top-level object: "event".
LEGACY_EVENT = {
    "id": "EVc67ec998b35c41d388af50799aeeba3e",
    "object": "event",
    "apiVersion": "v2",
    "createdAt": "2022-01-23T16:55:52.557Z",
    "type": "message.received",
    "data": {
        "object": {
            "id": "AC24a8",
            "object": "message",
            "from": "+14155550100",
            "to": "+13105550199",
            "direction": "incoming",
            "body": "Hello",
            "media": [],
            "status": "received",
            "createdAt": "2022-01-23T16:55:52.420Z",
            "userId": "USu5AsEHuQ",
            "phoneNumberId": "PNtoDbDhuz",
            "conversationId": "CN78ba0373683c48fd8fd96bc836c51f79",
        }
    },
}

# Compact, separator-tight JSON -- the bytes Quo actually puts on the wire.
CURRENT_BODY = json.dumps(CURRENT_EVENT, separators=(",", ":"))
LEGACY_BODY = json.dumps(LEGACY_EVENT, separators=(",", ":"))

JSON_TYPE = "application/json"


def sign_current(body, webhook_id="msg_2abc", timestamp=None, key=TEST_WEBHOOK_KEY):
    """Sign exactly as Quo does for Scheme A.

    HMAC-SHA256 over ``{webhook-id}.{webhook-timestamp}.{raw-body}``, base64.
    The key is base64(raw bytes) once the ``whsec_`` prefix is stripped.
    """
    ts = str(timestamp if timestamp is not None else int(time.time()))  # SECONDS
    secret = base64.b64decode(key[len("whsec_") :])
    signature = base64.b64encode(
        hmac.new(secret, f"{webhook_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
    ).decode()
    return {
        "webhook-id": webhook_id,
        "webhook-timestamp": ts,
        "webhook-signature": f"v1,{signature}",
    }


def sign_legacy(body, timestamp=None, secret=TEST_LEGACY_SECRET):
    """Sign exactly as Quo does for Scheme B.

    HMAC-SHA256 over ``{timestamp}.{raw-body}``, base64, wrapped in
    ``hmac;1;{timestamp};{signature}``. The timestamp is UNIX MILLISECONDS.
    """
    ts = str(timestamp if timestamp is not None else int(time.time() * 1000))
    key = base64.b64decode(secret)
    signature = base64.b64encode(
        hmac.new(key, f"{ts}.{body}".encode(), hashlib.sha256).digest()
    ).decode()
    return f"hmac;1;{ts};{signature}"


def post(body, headers):
    return client.post(
        "/webhooks/quo",
        content=body.encode() if isinstance(body, str) else body,
        headers={"Content-Type": JSON_TYPE, **headers},
    )


# --- Scheme A: current API --------------------------------------------------


class TestSchemeACurrent:
    def test_accepts_a_correctly_signed_delivery(self):
        res = post(CURRENT_BODY, sign_current(CURRENT_BODY))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_a_signature_made_with_the_wrong_key(self):
        res = post(CURRENT_BODY, sign_current(CURRENT_BODY, key=WRONG_WEBHOOK_KEY))
        assert res.status_code == 400
        assert res.json()["error"] == "Invalid signature"

    def test_rejects_a_tampered_body(self):
        headers = sign_current(CURRENT_BODY)
        tampered = json.dumps(
            {**CURRENT_EVENT, "type": "call.completed"}, separators=(",", ":")
        )
        assert post(tampered, headers).status_code == 400

    def test_rejects_a_stale_timestamp(self):
        stale = int(time.time()) - 600  # 10 minutes old
        res = post(CURRENT_BODY, sign_current(CURRENT_BODY, timestamp=stale))
        assert res.status_code == 400

    def test_rejects_a_delivery_with_no_signature_headers_at_all(self):
        # Quo sends no unsigned requests: no handshake, no challenge, no
        # webhook.test event. An unsigned request is not from Quo.
        res = post(CURRENT_BODY, {})
        assert res.status_code == 400
        assert res.json()["error"] == "Missing signature headers"

    def test_accepts_when_any_space_separated_v1_entry_matches(self):
        # Secret rotation: Quo may send several signatures at once.
        headers = sign_current(CURRENT_BODY)
        good = headers["webhook-signature"]
        stale = "v1,c3RhbGVzaWduYXR1cmV2YWx1ZWhlcmVwYWRkaW5nMDAwMA=="
        assert verify_quo_signature(
            CURRENT_BODY.encode(),
            {**headers, "webhook-signature": f"{stale} {good}"},
            TEST_WEBHOOK_KEY,
        )

    def test_ignores_entries_whose_version_is_not_v1(self):
        headers = sign_current(CURRENT_BODY)
        sig = headers["webhook-signature"][len("v1,") :]
        assert not verify_quo_signature(
            CURRENT_BODY.encode(),
            {**headers, "webhook-signature": f"v2,{sig}"},
            TEST_WEBHOOK_KEY,
        )

    def test_rejects_a_key_whose_whsec_prefix_was_not_stripped(self):
        # The classic Scheme A bug: hashing with the literal `whsec_...` string.
        headers = sign_current(CURRENT_BODY)
        wrong = base64.b64encode(
            hmac.new(
                TEST_WEBHOOK_KEY.encode(),  # prefixed string used as the key
                f"{headers['webhook-id']}.{headers['webhook-timestamp']}."
                f"{CURRENT_BODY}".encode(),
                hashlib.sha256,
            ).digest()
        ).decode()
        assert not verify_quo_signature(
            CURRENT_BODY.encode(),
            {**headers, "webhook-signature": f"v1,{wrong}"},
            TEST_WEBHOOK_KEY,
        )

    def test_rejects_a_signature_over_the_body_alone(self):
        # The signed content is `{id}.{timestamp}.{body}`, not the body.
        headers = sign_current(CURRENT_BODY)
        secret = base64.b64decode(TEST_WEBHOOK_KEY[len("whsec_") :])
        body_only = base64.b64encode(
            hmac.new(secret, CURRENT_BODY.encode(), hashlib.sha256).digest()
        ).decode()
        assert not verify_quo_signature(
            CURRENT_BODY.encode(),
            {**headers, "webhook-signature": f"v1,{body_only}"},
            TEST_WEBHOOK_KEY,
        )

    def test_does_not_raise_on_a_wrong_length_signature(self):
        # hmac.compare_digest tolerates length mismatch; make sure nothing
        # upstream of it (the base64 decode, the split) raises instead.
        headers = sign_current(CURRENT_BODY)
        assert not verify_quo_signature(
            CURRENT_BODY.encode(),
            {**headers, "webhook-signature": "v1,short"},
            TEST_WEBHOOK_KEY,
        )

    def test_does_not_raise_on_a_malformed_signature_header(self):
        headers = sign_current(CURRENT_BODY)
        for value in ("", "garbage", "v1", "v1,", ",", "v1,not base64 !!"):
            assert not verify_quo_signature(
                CURRENT_BODY.encode(),
                {**headers, "webhook-signature": value},
                TEST_WEBHOOK_KEY,
            )

    def test_rejects_a_non_numeric_timestamp(self):
        headers = sign_current(CURRENT_BODY)
        assert not verify_quo_signature(
            CURRENT_BODY.encode(),
            {**headers, "webhook-timestamp": "not-a-number"},
            TEST_WEBHOOK_KEY,
        )

    def test_fails_closed_when_no_key_is_configured(self):
        assert not verify_quo_signature(
            CURRENT_BODY.encode(), sign_current(CURRENT_BODY), None
        )


# --- Scheme B: legacy openphone-signature -----------------------------------


class TestSchemeBLegacy:
    def test_accepts_a_correctly_signed_legacy_delivery(self):
        res = post(LEGACY_BODY, {"openphone-signature": sign_legacy(LEGACY_BODY)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_parses_the_documented_header_shape(self):
        # hmac;1;<ms>;<base64>
        scheme, version, timestamp, signature = sign_legacy(LEGACY_BODY).split(";")
        assert scheme == "hmac"
        assert version == "1"
        assert len(timestamp) == 13  # UNIX MILLISECONDS
        # Standard base64, not base64url: `+` and `/`, never `-` or `_`.
        assert "-" not in signature and "_" not in signature
        assert base64.b64decode(signature)  # decodes cleanly

    def test_rejects_a_signature_made_with_the_wrong_secret(self):
        wrong = base64.b64encode(b"not_the_signing_secret").decode()
        res = post(
            LEGACY_BODY,
            {"openphone-signature": sign_legacy(LEGACY_BODY, secret=wrong)},
        )
        assert res.status_code == 400
        assert res.json()["error"] == "Invalid signature"

    def test_treats_a_13_digit_timestamp_as_milliseconds(self):
        # A current ms timestamp must be FRESH. Read as seconds it would land
        # ~52,000 years in the future and every delivery would be dropped.
        now_ms = int(time.time() * 1000)
        assert len(str(now_ms)) == 13
        assert verify_quo_legacy_signature(
            LEGACY_BODY.encode(),
            sign_legacy(LEGACY_BODY, timestamp=now_ms),
            TEST_LEGACY_SECRET,
        )

    def test_also_accepts_a_10_digit_seconds_timestamp(self):
        # The unit is INFERRED from Quo's 13-digit example, never stated in
        # words, so the freshness check detects it rather than hardcoding a
        # divisor.
        now_seconds = int(time.time())
        assert len(str(now_seconds)) == 10
        assert verify_quo_legacy_signature(
            LEGACY_BODY.encode(),
            sign_legacy(LEGACY_BODY, timestamp=now_seconds),
            TEST_LEGACY_SECRET,
        )

    def test_rejects_a_stale_legacy_timestamp(self):
        stale_ms = int(time.time() * 1000) - 10 * 60 * 1000
        assert not verify_quo_legacy_signature(
            LEGACY_BODY.encode(),
            sign_legacy(LEGACY_BODY, timestamp=stale_ms),
            TEST_LEGACY_SECRET,
        )

    def test_accepts_when_any_comma_separated_signature_matches(self):
        # Quo: "Future versions may include multiple signatures separated by
        # commas." Note: COMMAS here, SPACES in Scheme A.
        good = sign_legacy(LEGACY_BODY)
        other = sign_legacy(
            LEGACY_BODY, secret=base64.b64encode(b"another_key").decode()
        )
        assert verify_quo_legacy_signature(
            LEGACY_BODY.encode(), f"{other},{good}", TEST_LEGACY_SECRET
        )

    def test_rejects_a_malformed_header(self):
        for value in ("hmac;1;123", "garbage", "", "hmac;1;;", "a;b;c;d;e"):
            assert not verify_quo_legacy_signature(
                LEGACY_BODY.encode(), value, TEST_LEGACY_SECRET
            )

    def test_rejects_a_scheme_or_version_other_than_hmac_1(self):
        _, _, timestamp, signature = sign_legacy(LEGACY_BODY).split(";")
        assert not verify_quo_legacy_signature(
            LEGACY_BODY.encode(),
            f"hmac;2;{timestamp};{signature}",
            TEST_LEGACY_SECRET,
        )
        assert not verify_quo_legacy_signature(
            LEGACY_BODY.encode(),
            f"rsa;1;{timestamp};{signature}",
            TEST_LEGACY_SECRET,
        )

    def test_rejects_an_undecoded_signing_secret(self):
        # The legacy secret is base64 and must be DECODED to raw bytes first.
        # Signing with the base64 STRING as the key must not verify.
        _, _, timestamp, _ = sign_legacy(LEGACY_BODY).split(";")
        wrong = base64.b64encode(
            hmac.new(
                TEST_LEGACY_SECRET.encode(),  # base64 string used directly
                f"{timestamp}.{LEGACY_BODY}".encode(),
                hashlib.sha256,
            ).digest()
        ).decode()
        assert not verify_quo_legacy_signature(
            LEGACY_BODY.encode(),
            f"hmac;1;{timestamp};{wrong}",
            TEST_LEGACY_SECRET,
        )

    def test_fails_closed_when_no_legacy_secret_is_configured(self):
        assert not verify_quo_legacy_signature(
            LEGACY_BODY.encode(), sign_legacy(LEGACY_BODY), None
        )


# --- Raw body ---------------------------------------------------------------


class TestRawBody:
    # Quo's own legacy Node sample signs JSON.stringify(req.body) while its
    # Python sample signs request.data. They agree only because Quo sends
    # compact JSON. Verification must be done over the RAW bytes, so a
    # pretty-printed body with the same semantic content must NOT verify
    # against a compact one.
    PRETTY_BODY = json.dumps(LEGACY_EVENT, indent=2)

    def test_rejects_a_re_serialized_body_that_differs_byte_for_byte(self):
        header = sign_legacy(LEGACY_BODY)  # signed over the compact bytes
        assert not verify_quo_legacy_signature(
            self.PRETTY_BODY.encode(), header, TEST_LEGACY_SECRET
        )

    def test_verifies_a_pretty_printed_body_when_that_is_what_was_signed(self):
        header = sign_legacy(self.PRETTY_BODY)
        assert verify_quo_legacy_signature(
            self.PRETTY_BODY.encode(), header, TEST_LEGACY_SECRET
        )

    def test_handles_non_ascii_bodies_in_both_schemes(self):
        body = json.dumps(
            {
                **LEGACY_EVENT,
                "data": {"object": {**LEGACY_EVENT["data"]["object"], "body": "héllo 👋 émoji"}},
            },
            separators=(",", ":"),
            ensure_ascii=False,
        )
        raw = body.encode("utf-8")
        assert verify_quo_legacy_signature(raw, sign_legacy(body), TEST_LEGACY_SECRET)
        assert verify_quo_signature(raw, sign_current(body), TEST_WEBHOOK_KEY)

    def test_accepts_a_multibyte_body_end_to_end(self):
        body = json.dumps(
            {
                **LEGACY_EVENT,
                "data": {"object": {**LEGACY_EVENT["data"]["object"], "body": "héllo 👋"}},
            },
            separators=(",", ":"),
            ensure_ascii=False,
        )
        res = post(body.encode("utf-8"), {"openphone-signature": sign_legacy(body)})
        assert res.status_code == 200


# --- Envelope normalisation -------------------------------------------------


class TestEnvelopeNormalisation:
    def test_reads_resource_context_links_on_the_current_envelope(self):
        n = normalize_event(CURRENT_EVENT)
        assert n["is_legacy"] is False
        assert n["resource"]["id"] == "AC123"
        assert n["context"]["orgId"] == "OR123"
        assert "my.quo.com" in n["links"]["quo"]

    def test_reads_data_object_on_the_legacy_envelope(self):
        n = normalize_event(LEGACY_EVENT)
        assert n["is_legacy"] is True
        assert n["resource"]["body"] == "Hello"  # legacy uses `body`, not `text`
        assert n["resource"]["from"] == "+14155550100"
        assert n["api_version"] == "v2"


# --- Configuration ----------------------------------------------------------


class TestConfiguration:
    def test_returns_500_when_the_current_key_is_unset(self, monkeypatch):
        # Misconfiguration is a 500, not a 400, so an operator can tell it
        # apart from "someone sent a bad signature". Never a silent accept.
        monkeypatch.delenv("QUO_WEBHOOK_KEY", raising=False)
        res = post(CURRENT_BODY, sign_current(CURRENT_BODY))
        assert res.status_code == 500
        assert res.json()["error"] == "Webhook secret not configured"

    def test_returns_500_when_the_legacy_secret_is_unset(self, monkeypatch):
        monkeypatch.delenv("QUO_LEGACY_SIGNING_SECRET", raising=False)
        res = post(LEGACY_BODY, {"openphone-signature": sign_legacy(LEGACY_BODY)})
        assert res.status_code == 500

    def test_rejects_verified_but_unparseable_json(self):
        body = "{not json"
        res = post(body, sign_current(body))
        assert res.status_code == 400
        assert res.json()["error"] == "Invalid JSON"

    def test_health_endpoint(self):
        assert client.get("/health").json() == {"status": "ok"}


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
