"""Tests for the AWS SNS FastAPI webhook handler.

The test plays SNS's role: it signs messages with a fixed RSA test key and the
handler verifies them against the matching self-signed certificate. The
certificate fetch and the subscription-confirmation GET are patched so the
tests run offline.
"""
import base64
import json

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from fastapi.testclient import TestClient

import main
from main import app

TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:MyTopic"
SIGNING_CERT_URL = "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem"

TEST_PRIVATE_KEY = b"""-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCq7NPsBMMIqXhb
aAyLCjmjq4pLfH5YJsYOhwo1jXLXbYWttuTma4wrWMyjcmqeED3LFCBZ5fVAisgR
+vpjhA3+f2/huHZPcif6oTaYiJvINw/fL6AXhDsb2BA3tjoByeephSu3TbJraH2O
Dw37RJydEy7gvCE+kMLdu/9fGIwFeh2gndf80KU+HdvJiTK2rDKk1qZsFkbRy9Ku
QX5Osa3qbR7v4oGzK0D79kxZUbmRklSOkmONO9CwAKGchQVvWE6FCokOrJ29+J/2
5rYrpO0TNiOifDc7M7JKRzYoiHC/42mIKiWglXCYj/mzAKR0tEmolm/+bMEdrlCt
q4SFUPg3AgMBAAECggEANyzO9iPNX4jxQLR0RBfPZm2T7W0pDcSqb3sZCRN5jGAe
5GYjOtxhuYZnPKXNE+wTPnBnRw3L3wNNtTwqwqAYslwp3hfhHSExFZ8f1BpZC0b2
+SlTCPRW7lSPW6SX0gb+oMLLy1ap7zEiQo7KiR9rXOsZ2VLxelRZiyFKPMTcQlHT
C210bodqNpuuecuJ9oqnphcC+ZZGX+Xk+7ZAh8zXNWS8os1zXIea9Wrq4esMF/JL
hwWjg7vguc0SrW1FoSfyGENjLViEzxoWgHo3OPQK/BVG/5wHFpL0oQ+sUj4l9QTW
hMMi2OquRDLR8yUk1I0yTFBiav8q1R1SjS/QOG2vfQKBgQDlQAm4oqEqC+mlBxzx
2bK8OeznV56Kiv9s0mCLMpZglzFAgKtBMFp5X3aleNLxwkq3qEGOzn1KigWP5ECn
+9RWBINgLHeDidAhhmhVWMz/wwPWQgQGBY3MGM3fbQ+8udhj0bs7iqXR/XNHQ8hP
THw6CTp6yY7i45Wx/kbgfhMBewKBgQC+3o4DYyqKiJ+k+Xg0toKqfy+nAQr0g2V2
l9a1mbWOzNSD1bDma5UP47nSu4QM4CAgyIJgq0TpJkR91Dh+T+Cl9BRURkd+amha
4VZ0fEhgByutENuILWN/zr1DLaZPGa3gGhaO/VvahM8kBphDOjA+5PkraGKWIfDi
d9JOVs5xdQKBgG47ubDvemF2cvWokvF0Ra6eh9zB0/k4VxPjoQqt24M8kDE87Zwd
/RMppSpyC7S2QSlInaVmgvaJoZ0MG07rF7H435cqKpm0dcD5GUgYuBIvmrO28KpY
l1NRhgTuM0gDcRqmacp6o7tyjLDy1enTlFRvxY/vRWayGnQJGdmupcLrAoGAX/pT
mRp1muHmvTOBIaig/hEkqirZEmk8TS0/F2RqqpsPRhffc46njyzpFTGbzkmpfjK1
dNzKsx6+FDPyEHokMe8RhestKkFhpklniv2v+zG/4a/3ZHvGa89O1ogO9/mmuGkF
7PM0DCb6blgumqeY+Rd0wEImSO5aTdcI1sHJ370CgYEAz/1yWA7y8v9lOCx+Ye2m
B9lxQw85zP+0YqhiE/gd1aOt1KozURh8nUXa8/XyOC4eFz9MZhEjpj9ASInm0Q63
IkHGmALI8nfJVvE1iSB/JLDae00fm1NyhrL4sywFwPhxTibZPqZN1QrwJNMDR57I
oA3ZH3+BoWC0j+4LjFx0YrM=
-----END PRIVATE KEY-----"""

TEST_CERT = b"""-----BEGIN CERTIFICATE-----
MIIDGzCCAgOgAwIBAgIUVOndghVTSFsZgYvi7NplBLEmEqEwDQYJKoZIhvcNAQEL
BQAwHDEaMBgGA1UEAwwRc25zLmFtYXpvbmF3cy5jb20wIBcNMjYwNzIyMTMzNTIx
WhgPMjEyNjA2MjgxMzM1MjFaMBwxGjAYBgNVBAMMEXNucy5hbWF6b25hd3MuY29t
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAquzT7ATDCKl4W2gMiwo5
o6uKS3x+WCbGDocKNY1y122Frbbk5muMK1jMo3JqnhA9yxQgWeX1QIrIEfr6Y4QN
/n9v4bh2T3In+qE2mIibyDcP3y+gF4Q7G9gQN7Y6AcnnqYUrt02ya2h9jg8N+0Sc
nRMu4LwhPpDC3bv/XxiMBXodoJ3X/NClPh3byYkytqwypNambBZG0cvSrkF+TrGt
6m0e7+KBsytA+/ZMWVG5kZJUjpJjjTvQsAChnIUFb1hOhQqJDqydvfif9ua2K6Tt
EzYjonw3OzOySkc2KIhwv+NpiColoJVwmI/5swCkdLRJqJZv/mzBHa5QrauEhVD4
NwIDAQABo1MwUTAdBgNVHQ4EFgQUgvsZVS+ZpcIYL+hSMLgFnTCNDhIwHwYDVR0j
BBgwFoAUgvsZVS+ZpcIYL+hSMLgFnTCNDhIwDwYDVR0TAQH/BAUwAwEB/zANBgkq
hkiG9w0BAQsFAAOCAQEAFzqkO4ODkL+ivq9PLUGqInCQAipiH9E/Q0KM6f2Ye22a
b/OQ3bAEIfXX4r0dD3bFLGheiQnNpVKAgbVuFRxs7G+F9VzhOJOF9otUmP+giIPi
0qe8vy9+DLlLlg2DNGF5MCGQfq0MITfD2PmNzIfLwQ7G2WKSSdhryA2hVD4KsIBX
wLbbFZntjeiGYzb7GFcpZx3iHbZ+g2AkUey+WCK5yQN25vUnjAjTk+4TTUHkIal7
SdxNtQHqVVlZ60C2WgTv/f+BdH5AYptNKLkzt4O1CglRfYMboxg2Z99CNShNGTLI
29vrwQik+qCuwCrXoQMV0yKHDnGx3CAu5XLPY87AGw==
-----END CERTIFICATE-----"""

_private_key = load_pem_private_key(TEST_PRIVATE_KEY, password=None)


def string_to_sign(message: dict) -> bytes:
    """Same canonical-string logic the handler uses."""
    return main.canonical_string(message)


def sign_message(message: dict) -> dict:
    algorithm = hashes.SHA256() if message.get("SignatureVersion") == "2" else hashes.SHA1()
    signature = _private_key.sign(string_to_sign(message), padding.PKCS1v15(), algorithm)
    return {**message, "Signature": base64.b64encode(signature).decode()}


def notification(**overrides) -> dict:
    msg = {
        "Type": "Notification",
        "MessageId": "22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324",
        "TopicArn": TOPIC_ARN,
        "Subject": "My subject",
        "Message": "Hello world!",
        "Timestamp": "2012-05-02T00:54:06.655Z",
        "SignatureVersion": "1",
        "SigningCertURL": SIGNING_CERT_URL,
        "UnsubscribeURL": "https://sns.us-east-1.amazonaws.com/?Action=Unsubscribe",
    }
    msg.update(overrides)
    return sign_message(msg)


def subscription_confirmation(**overrides) -> dict:
    msg = {
        "Type": "SubscriptionConfirmation",
        "MessageId": "165545c9-2a5c-472c-8df2-7ff2be2b3b1b",
        "Token": "2336412f37",
        "TopicArn": TOPIC_ARN,
        "Message": "You have chosen to subscribe to the topic.",
        "SubscribeURL": "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=2336412f37",
        "Timestamp": "2012-04-26T20:45:04.751Z",
        "SignatureVersion": "1",
        "SigningCertURL": SIGNING_CERT_URL,
    }
    msg.update(overrides)
    return sign_message(msg)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("AWS_SNS_TOPIC_ARN", TOPIC_ARN)
    # Serve the signing certificate offline.
    monkeypatch.setattr(main, "fetch_certificate", lambda url: TEST_CERT)
    return TestClient(app)


def post(client: TestClient, message: dict, include_type_header: bool = True):
    headers = {"Content-Type": "text/plain"}
    if include_type_header:
        headers["x-amz-sns-message-type"] = message["Type"]
    return client.post("/webhooks/aws-sns", content=json.dumps(message), headers=headers)


def test_missing_message_type_header(client):
    res = post(client, notification(), include_type_header=False)
    assert res.status_code == 400


def test_invalid_json_body(client):
    res = client.post(
        "/webhooks/aws-sns",
        content="not json",
        headers={"Content-Type": "text/plain", "x-amz-sns-message-type": "Notification"},
    )
    assert res.status_code == 400


def test_valid_signature_version_1_notification(client):
    res = post(client, notification())
    assert res.status_code == 200


def test_valid_signature_version_2_notification(client):
    res = post(client, notification(SignatureVersion="2"))
    assert res.status_code == 200


def test_notification_without_subject(client):
    msg = notification()
    del msg["Subject"]
    res = post(client, sign_message(msg))
    assert res.status_code == 200


def test_tampered_notification_rejected(client):
    msg = notification()
    msg["Message"] = "tampered after signing"
    res = post(client, msg)
    assert res.status_code == 400


def test_untrusted_certificate_host_rejected(client):
    msg = notification()
    msg["SigningCertURL"] = "https://evil.example.com/cert.pem"
    res = post(client, msg)
    assert res.status_code == 400


def test_untrusted_topic_rejected(client):
    res = post(client, notification(TopicArn="arn:aws:sns:us-east-1:999999999999:OtherTopic"))
    assert res.status_code == 403


def test_subscription_confirmation_confirms(client, monkeypatch):
    called = {}
    monkeypatch.setattr(main, "confirm_subscription", lambda url: called.setdefault("url", url))
    res = post(client, subscription_confirmation())
    assert res.status_code == 200
    assert called["url"].startswith("https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription")


def test_unsubscribe_confirmation(client):
    msg = sign_message(
        {
            "Type": "UnsubscribeConfirmation",
            "MessageId": "165545c9-2a5c-472c-8df2-7ff2be2b3b1c",
            "Token": "2336412f38",
            "TopicArn": TOPIC_ARN,
            "Message": "You have chosen to deactivate the subscription.",
            "SubscribeURL": "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=2336412f38",
            "Timestamp": "2012-04-26T20:06:41.581Z",
            "SignatureVersion": "1",
            "SigningCertURL": SIGNING_CERT_URL,
        }
    )
    res = post(client, msg)
    assert res.status_code == 200


def test_health_endpoint(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
