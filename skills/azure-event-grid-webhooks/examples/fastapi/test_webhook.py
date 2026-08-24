# Generated with: azure-event-grid-webhooks skill
# https://github.com/hookdeck/webhook-skills
#
# Azure Event Grid does not sign the request body, so there are no signatures to
# generate here. What IS exercised: both endpoint-validation handshakes, the
# aeg-subscription-name identity guard, delivery-property / query-parameter /
# Microsoft Entra ID channel authentication (with REAL RS256 tokens signed by a
# throwaway key), and normalisation of the Event Grid array vs CloudEvents object.
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

import main
from main import app, check_against_any, check_delivery_secret

WEBHOOK_PATH = "/webhooks/azure-event-grid"
SUBSCRIPTION = "my-webhook-subscription"
SECRET = "a" * 64
SECRET_HEADER = "x-eventgrid-token"
TENANT_ID = "11111111-2222-3333-4444-555555555555"
AUDIENCE = "api://event-grid-webhook"

client = TestClient(app)

# Throwaway RSA key pair: the tests sign real RS256 tokens with the private key
# and hand the public key to the handler's resolver, so PyJWT performs a genuine
# signature verification rather than a stubbed one.
_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PRIVATE_PEM = _private_key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
)
PUBLIC_KEY = _private_key.public_key()


def validation_event(code="512d38b6-c7b8-40c8-89fe-f46f9e9622b6"):
    """The documented SubscriptionValidationEvent, delivered as a single-element array."""
    return [
        {
            "id": "2d1781af-3a4c-4d7c-bd0c-e34b19da4e66",
            "topic": "/subscriptions/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
            "subject": "",
            "data": {
                "validationCode": code,
                "validationUrl": "https://rp-eastus2.eventgrid.azure.net:553/eventsubscriptions/myeventsub/validate?id=x",
            },
            "eventType": "Microsoft.EventGrid.SubscriptionValidationEvent",
            "eventTime": "2022-10-28T04:23:35.1981776Z",
            "metadataVersion": "1",
            "dataVersion": "1",
        }
    ]


def blob_created_event():
    return {
        "topic": "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa",
        "subject": "/blobServices/default/containers/test/blobs/file.jpg",
        "eventType": "Microsoft.Storage.BlobCreated",
        "id": "aaaaaaaa-0000-1111-2222-bbbbbbbbbbbb",
        "data": {"api": "PutBlob", "url": "https://sa.blob.core.windows.net/test/file.jpg"},
        "dataVersion": "",
        "metadataVersion": "1",
        "eventTime": "2024-12-06T03:32:15.7238874Z",
    }


def cloud_event():
    """CloudEvents v1.0 structured mode: a single JSON OBJECT, not an array."""
    return {
        "specversion": "1.0",
        "type": "Microsoft.Storage.BlobCreated",
        "source": "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa",
        "id": "9aeb0fdf-c01e-0131-0922-9eb54906e209",
        "time": "2019-11-18T15:13:39.4589254Z",
        "subject": "blobServices/default/containers/test/blobs/file.png",
        "datacontenttype": "application/json",
        "data": {"api": "PutBlockList"},
    }


def make_token(**overrides):
    now = int(time.time())
    claims = {
        "aud": AUDIENCE,
        "iss": f"https://login.microsoftonline.com/{TENANT_ID}/v2.0",
        "iat": now,
        "nbf": now,
        "exp": now + 3600,
        "appid": "22222222-3333-4444-5555-666666666666",
    }
    claims.update(overrides)
    return jwt.encode(claims, PRIVATE_PEM, algorithm="RS256")


def post(body, headers=None, params=None):
    """POST helper that sets the headers Event Grid actually sends."""
    merged = {
        "aeg-subscription-name": SUBSCRIPTION,
        "aeg-event-type": "Notification",
        SECRET_HEADER: SECRET,
    }
    for name, value in (headers or {}).items():
        if value is None:
            merged.pop(name.lower(), None)
        else:
            merged[name.lower()] = value
    return client.post(WEBHOOK_PATH, json=body, headers=merged, params=params or {})


def post_with_query(body, params=None):
    """POST that authenticates ONLY via the query string — no secret header."""
    return client.post(
        WEBHOOK_PATH,
        json=body,
        headers={"aeg-subscription-name": SUBSCRIPTION, "aeg-event-type": "Notification"},
        params=params or {},
    )


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setattr(
        main, "SIGNING_KEY_RESOLVER", lambda token, tenant_id: PUBLIC_KEY, raising=False
    )
    monkeypatch.setenv("AZURE_EVENT_GRID_SUBSCRIPTION_NAMES", SUBSCRIPTION)
    monkeypatch.setenv("AZURE_EVENT_GRID_DELIVERY_SECRET_HEADER", SECRET_HEADER)
    monkeypatch.setenv("AZURE_EVENT_GRID_DELIVERY_SECRET", SECRET)
    monkeypatch.setenv("AZURE_EVENT_GRID_ALLOW_UNAUTHENTICATED", "false")
    for name in (
        "AZURE_EVENT_GRID_ENTRA_TENANT_ID",
        "AZURE_EVENT_GRID_ENTRA_AUDIENCE",
        "AZURE_EVENT_GRID_ALLOWED_ORIGINS",
        "AZURE_EVENT_GRID_ALLOWED_RATE",
        "AZURE_EVENT_GRID_QUERY_SECRET",
        "AZURE_EVENT_GRID_QUERY_SECRET_PARAM",
    ):
        monkeypatch.delenv(name, raising=False)
    yield


class TestSubscriptionValidationHandshake:
    def test_echoes_the_validation_code(self):
        res = post(validation_event())
        assert res.status_code == 200
        # Documented field name is camelCase; a single OBJECT, not an array.
        assert res.json() == {"validationResponse": "512d38b6-c7b8-40c8-89fe-f46f9e9622b6"}

    def test_returns_200_not_202(self):
        # "HTTP 202 Accepted isn't recognized as a valid Event Grid
        # subscription validation response."
        assert post(validation_event()).status_code == 200

    def test_refuses_to_validate_an_unrecognized_subscription(self):
        res = post(validation_event(), headers={"aeg-subscription-name": "someone-elses-sub"})
        assert res.status_code == 403
        assert "validationResponse" not in res.text

    def test_refuses_to_validate_when_no_subscriptions_configured(self, monkeypatch):
        monkeypatch.delenv("AZURE_EVENT_GRID_SUBSCRIPTION_NAMES", raising=False)
        assert post(validation_event()).status_code == 403


class TestCloudEventsAbuseProtection:
    def test_grants_the_origin(self):
        res = client.options(
            WEBHOOK_PATH, headers={"WebHook-Request-Origin": "eventgrid.azure.net"}
        )
        assert res.status_code == 200
        assert res.headers["webhook-allowed-origin"] == "*"
        assert res.headers["webhook-allowed-rate"] == "120"

    def test_echoes_a_specific_allowed_origin(self, monkeypatch):
        monkeypatch.setenv("AZURE_EVENT_GRID_ALLOWED_ORIGINS", "eventgrid.azure.net")
        res = client.options(
            WEBHOOK_PATH, headers={"WebHook-Request-Origin": "eventgrid.azure.net"}
        )
        assert res.status_code == 200
        assert res.headers["webhook-allowed-origin"] == "eventgrid.azure.net"

    def test_withholds_the_grant_for_a_disallowed_origin(self, monkeypatch):
        monkeypatch.setenv("AZURE_EVENT_GRID_ALLOWED_ORIGINS", "eventgrid.azure.net")
        res = client.options(WEBHOOK_PATH, headers={"WebHook-Request-Origin": "evil.example"})
        assert res.status_code == 403
        # Refusal IS the absence of the grant header, not the status code.
        assert "webhook-allowed-origin" not in res.headers

    def test_rejects_a_preflight_with_no_origin(self):
        res = client.options(WEBHOOK_PATH)
        assert res.status_code == 400
        assert "webhook-allowed-origin" not in res.headers


class TestEventDelivery:
    def test_accepts_an_event_grid_schema_array(self):
        res = post([blob_created_event()])
        assert res.status_code == 200
        assert res.json() == {"received": 1}

    def test_accepts_a_batch(self):
        res = post([blob_created_event(), blob_created_event()])
        assert res.json() == {"received": 2}

    def test_accepts_a_cloudevents_object(self):
        res = post(cloud_event())
        assert res.status_code == 200
        assert res.json() == {"received": 1}

    def test_rejects_invalid_json(self):
        res = client.post(
            WEBHOOK_PATH,
            content="not json",
            headers={
                "content-type": "application/json",
                "aeg-subscription-name": SUBSCRIPTION,
                SECRET_HEADER: SECRET,
            },
        )
        assert res.status_code == 400

    def test_rejects_a_non_object_payload(self):
        assert post(["nope"]).status_code == 400

    def test_tolerates_a_retry_delivery_count(self):
        res = post([blob_created_event()], headers={"aeg-delivery-count": "4"})
        assert res.status_code == 200


class TestDeliveryPropertyAuth:
    def test_rejects_a_missing_credential(self):
        assert post([blob_created_event()], headers={SECRET_HEADER: None}).status_code == 401

    def test_rejects_a_wrong_credential_of_the_same_length(self):
        assert post([blob_created_event()], headers={SECRET_HEADER: "b" * 64}).status_code == 401

    def test_rejects_a_wrong_credential_of_a_different_length(self):
        assert post([blob_created_event()], headers={SECRET_HEADER: "short"}).status_code == 401

    def test_reads_a_custom_header_name(self, monkeypatch):
        monkeypatch.setenv("AZURE_EVENT_GRID_DELIVERY_SECRET_HEADER", "x-my-token")
        assert post([blob_created_event()]).status_code == 401
        assert post([blob_created_event()], headers={"x-my-token": SECRET}).status_code == 200

    def test_fails_closed_when_nothing_is_configured(self, monkeypatch):
        monkeypatch.delenv("AZURE_EVENT_GRID_DELIVERY_SECRET", raising=False)
        assert post([blob_created_event()]).status_code == 500

    def test_allows_unauthenticated_only_when_explicitly_enabled(self, monkeypatch):
        monkeypatch.delenv("AZURE_EVENT_GRID_DELIVERY_SECRET", raising=False)
        monkeypatch.setenv("AZURE_EVENT_GRID_ALLOW_UNAUTHENTICATED", "true")
        assert post([blob_created_event()]).status_code == 200

    def test_never_fails_open_on_an_empty_secret(self):
        assert check_delivery_secret("", "") is False
        assert check_delivery_secret("anything", None) is False
        assert check_delivery_secret(SECRET, SECRET) is True


class TestQueryParameterAuth:
    @pytest.fixture(autouse=True)
    def use_query_auth(self, monkeypatch):
        # Query-param auth replaces the header credential in these tests.
        monkeypatch.delenv("AZURE_EVENT_GRID_DELIVERY_SECRET", raising=False)
        monkeypatch.setenv("AZURE_EVENT_GRID_QUERY_SECRET", SECRET)

    def test_accepts_the_default_token_parameter(self):
        assert post_with_query([blob_created_event()], {"token": SECRET}).status_code == 200

    def test_rejects_a_missing_query_secret(self):
        assert post_with_query([blob_created_event()]).status_code == 401

    def test_rejects_a_wrong_query_secret(self):
        assert post_with_query([blob_created_event()], {"token": "b" * 64}).status_code == 401

    def test_reads_a_custom_query_parameter_name(self, monkeypatch):
        monkeypatch.setenv("AZURE_EVENT_GRID_QUERY_SECRET_PARAM", "code")
        assert post_with_query([blob_created_event()], {"token": SECRET}).status_code == 401
        assert post_with_query([blob_created_event()], {"code": SECRET}).status_code == 200

    def test_accepts_both_old_and_new_secrets_during_rotation(self, monkeypatch):
        # The docs require an overlap window, otherwise deliveries fail between
        # rotating the secret and updating the event subscription.
        old_secret, new_secret = "o" * 64, "n" * 64
        monkeypatch.setenv("AZURE_EVENT_GRID_QUERY_SECRET", f"{old_secret},{new_secret}")
        assert post_with_query([blob_created_event()], {"token": old_secret}).status_code == 200
        assert post_with_query([blob_created_event()], {"token": new_secret}).status_code == 200
        assert post_with_query([blob_created_event()], {"token": "z" * 64}).status_code == 401

    def test_preserves_secret_case(self, monkeypatch):
        mixed = "AbCdEf0123456789"
        monkeypatch.setenv("AZURE_EVENT_GRID_QUERY_SECRET", mixed)
        assert post_with_query([blob_created_event()], {"token": mixed}).status_code == 200
        assert post_with_query([blob_created_event()], {"token": mixed.lower()}).status_code == 401

    def test_never_fails_open_on_an_empty_accepted_list(self):
        assert check_against_any("anything", "") is False
        assert check_against_any("anything", None) is False
        assert check_against_any(SECRET, SECRET) is True


class TestEntraIdAuth:
    @pytest.fixture(autouse=True)
    def use_entra(self, monkeypatch):
        monkeypatch.delenv("AZURE_EVENT_GRID_DELIVERY_SECRET", raising=False)
        monkeypatch.setenv("AZURE_EVENT_GRID_ENTRA_TENANT_ID", TENANT_ID)
        monkeypatch.setenv("AZURE_EVENT_GRID_ENTRA_AUDIENCE", AUDIENCE)

    def test_accepts_a_valid_token(self):
        res = post(
            [blob_created_event()],
            headers={SECRET_HEADER: None, "authorization": f"Bearer {make_token()}"},
        )
        assert res.status_code == 200

    def test_accepts_the_v1_issuer_form(self):
        token = make_token(iss=f"https://sts.windows.net/{TENANT_ID}/")
        res = post(
            [blob_created_event()],
            headers={SECRET_HEADER: None, "authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200

    def test_rejects_a_missing_token(self):
        assert post([blob_created_event()], headers={SECRET_HEADER: None}).status_code == 401

    def test_rejects_a_wrong_audience(self):
        token = make_token(aud="api://someone-else")
        res = post(
            [blob_created_event()],
            headers={SECRET_HEADER: None, "authorization": f"Bearer {token}"},
        )
        assert res.status_code == 401

    def test_rejects_a_wrong_issuer(self):
        token = make_token(iss="https://login.microsoftonline.com/other-tenant/v2.0")
        res = post(
            [blob_created_event()],
            headers={SECRET_HEADER: None, "authorization": f"Bearer {token}"},
        )
        assert res.status_code == 401

    def test_rejects_an_expired_token(self):
        now = int(time.time())
        token = make_token(exp=now - 60, iat=now - 3600, nbf=now - 3600)
        res = post(
            [blob_created_event()],
            headers={SECRET_HEADER: None, "authorization": f"Bearer {token}"},
        )
        assert res.status_code == 401

    def test_rejects_an_unsigned_none_algorithm_token(self):
        # The handler pins algorithms=["RS256"], so `alg: none` must not pass.
        token = jwt.encode(
            {"aud": AUDIENCE, "iss": f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"},
            None,
            algorithm="none",
        )
        res = post(
            [blob_created_event()],
            headers={SECRET_HEADER: None, "authorization": f"Bearer {token}"},
        )
        assert res.status_code == 401

    def test_rejects_a_non_bearer_scheme(self):
        res = post(
            [blob_created_event()],
            headers={SECRET_HEADER: None, "authorization": f"Basic {make_token()}"},
        )
        assert res.status_code == 401


class TestHealth:
    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
