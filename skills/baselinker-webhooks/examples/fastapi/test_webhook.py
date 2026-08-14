import os

from fastapi.testclient import TestClient

# Configure the OPTIONAL url token before importing the app. This is NOT a
# BaseLinker signature — BaseLinker signs nothing.
os.environ["BASELINKER_URL_TOKEN"] = "test_url_token_abc123"
# Keep the API fetch-back inert so tests make no network calls.
os.environ.pop("BASELINKER_API_TOKEN", None)

from main import app, parse_order_id, verify_url_token

client = TestClient(app)

TOKEN = os.environ["BASELINKER_URL_TOKEN"]


def head(**query):
    """Send a BaseLinker-style delivery: an HTTP HEAD request, payload in the query string."""
    params = {"token": TOKEN}
    params.update({k: v for k, v in query.items() if v is not None})
    return client.head("/webhooks/baselinker", params=params)


class TestParseOrderId:
    def test_coerces_string_to_int(self):
        assert parse_order_id("42") == 42

    def test_returns_none_when_absent(self):
        assert parse_order_id(None) is None

    def test_returns_none_when_not_numeric(self):
        assert parse_order_id("not-a-number") is None

    def test_returns_none_for_non_integer(self):
        assert parse_order_id("4.2") is None

    def test_returns_none_for_non_positive(self):
        assert parse_order_id("0") is None
        assert parse_order_id("-1") is None


class TestVerifyUrlToken:
    def test_accepts_matching_token(self):
        assert verify_url_token(TOKEN, TOKEN) is True

    def test_rejects_wrong_token(self):
        assert verify_url_token("nope", TOKEN) is False

    def test_rejects_missing_token(self):
        assert verify_url_token(None, TOKEN) is False

    def test_rejects_length_mismatch(self):
        assert verify_url_token(TOKEN + "x", TOKEN) is False

    def test_rejects_non_ascii_token(self):
        # compare_digest() raises TypeError on non-ASCII str input, so the
        # comparison must happen on bytes.
        assert verify_url_token("ü", TOKEN) is False

    def test_skips_check_when_not_configured(self):
        assert verify_url_token(None, None) is True


class TestHeadDelivery:
    def test_accepts_order_id_and_state(self):
        response = head(order_id="42", state="packed")
        assert response.status_code == 200

    def test_response_has_no_body(self):
        # RFC 9110 section 9.3.2 forbids a body on a HEAD response.
        response = head(order_id="42", state="packed")
        assert response.content == b""

    def test_accepts_order_id_only(self):
        # `state` is not guaranteed to be present.
        response = head(order_id="42")
        assert response.status_code == 200

    def test_accepts_unrecognised_state(self):
        # `state` is opaque — not an event-type discriminator or documented enum.
        response = head(order_id="42", state="some_future_state")
        assert response.status_code == 200

    def test_missing_order_id_returns_bodyless_400(self):
        response = head(state="packed")
        assert response.status_code == 400
        assert response.content == b""

    def test_non_numeric_order_id_returns_400(self):
        response = head(order_id="abc", state="packed")
        assert response.status_code == 400

    def test_missing_url_token_returns_bodyless_401(self):
        response = client.head("/webhooks/baselinker", params={"order_id": "42"})
        assert response.status_code == 401
        assert response.content == b""

    def test_wrong_url_token_returns_401(self):
        response = client.head(
            "/webhooks/baselinker", params={"order_id": "42", "token": "wrong"}
        )
        assert response.status_code == 401

    def test_non_ascii_url_token_returns_401_not_500(self):
        response = client.head(
            "/webhooks/baselinker", params={"order_id": "42", "token": "ü"}
        )
        assert response.status_code == 401
        assert response.content == b""

    def test_post_is_not_allowed(self):
        # BaseLinker only ever sends HEAD; the route is registered with @app.head.
        response = client.post("/webhooks/baselinker", params={"order_id": "42"})
        assert response.status_code == 405


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
