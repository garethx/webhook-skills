# Upollo Webhooks Overview

## What Are Upollo Webhooks?

[Upollo](https://upollo.ai) is a fraud and risk-detection platform. It analyses
users, devices, and behaviour to detect abuse such as **account sharing**,
**multi-accounting**, **free-trial abuse**, and **account takeover**.

Unlike most webhook providers, Upollo webhooks are **not** a subscription to
discrete named events (`invoice.paid`, `push`, …). Instead, a webhook fires
whenever Upollo **flags a user**. Each delivery is an **analysis** object
describing:

- the recommended **`action`** (e.g. `CHALLENGE`, `DENY`, `PERMIT`),
- the **`flags`** that were raised (e.g. `ACCOUNT_SHARING`),
- the **`eventType`** that triggered the analysis (e.g. `LOGIN`),
- **`userInfo`** and **`deviceInfo`** for the flagged user/device.

So you dispatch on `action` and iterate `flags`, rather than switching on an
event name.

## How It Fires

1. Your app reports user activity to Upollo (via the Upollo client/server SDK or
   API) — logins, registrations, purchases, etc.
2. Upollo analyses the activity. When it flags the user, it POSTs the analysis
   to your registered webhook URL.
3. The delivery is signed with `Upollo-Signature`
   (see [verification.md](verification.md)).

## Actions (`action`)

The recommended response to the flagged user. Source enum: `Outcome`
(webhook payloads use the short form, without the `OUTCOME_` prefix).

| Action (short) | Source enum | Meaning |
|----------------|-------------|---------|
| `PERMIT` | `OUTCOME_PERMIT` | Allow the user through |
| `CHALLENGE` | `OUTCOME_CHALLENGE` | Step-up verification recommended |
| `OFFER` | `OUTCOME_OFFER` | Present an upsell / offer |
| `DENY` | `OUTCOME_DENY` | Block the action |
| `LOG` | `OUTCOME_LOG` | Record only |
| `CUSTOMER_DEFINED` | `OUTCOME_CUSTOMER_DEFINED` | Your own rule outcome |

## Flags (`flags[].type`)

The reasons a user was flagged. Source enum: `FlagType`. Full list:

| Flag | Raised When |
|------|-------------|
| `ACCOUNT_SHARING` | Credentials shared across users |
| `ACCOUNT_SHARING_SAME_HOUSEHOLD` | Sharing within one household |
| `MULTIPLE_ACCOUNTS` | One person operating multiple accounts |
| `REPEATED_SIGNUP` | Same person signing up repeatedly |
| `TRIALED_ON_OTHER_ACCOUNT` | Free trial already used on another account |
| `REPEATED_REDEMPTION` | Offer/coupon redeemed repeatedly |
| `SUSPECTED_FRAUD` | General fraud signal |
| `SUSPECTED_BOT` | Automated / bot behaviour |
| `SUSPECTED_ACCOUNT_COMPROMISE` | Possible account takeover |
| `CREDENTIAL_STUFFING` | Credential-stuffing pattern |
| `ACCOUNT_COMPROMISE_NEW_LOCATION` | Login from a new location |
| `ACCOUNT_COMPROMISE_NEW_DEVICE` | Login from a new device |
| `RATE_LIMITED_IP` / `RATE_LIMITED_DEVICE` | Rate limit hit for IP / device |
| `BLACKLISTED_IP` / `BLACKLISTED_DEVICE` | IP / device on a blocklist |
| `DEVICE_BLOCKED_GLOBALLY` | Device blocked across all users |
| `DEVICE_BLOCKED_FOR_THIS_USER` | Device blocked for this user |
| `USING_VPN` / `USING_TOR` | Connecting via VPN / Tor |
| `DISPOSABLE_EMAIL` | Throwaway email address |
| `INVALID_EMAIL` | Email failed validation |
| `INVALID_PHONE_NUMBER` / `INVALID_PHONE_TYPE` | Phone failed validation |
| `ALREADY_USED_EMAIL` / `ALREADY_USED_PHONE` | Email / phone already used |
| `LIMITED_DEVICE_INFORMATION` | Not enough device signal |
| `COMMERCIAL_USER` | Business/commercial usage detected |
| `PAYMENT_NAME_DIFFERS` | Payment name differs from account |

## Event Types (`eventType`)

The activity that triggered the analysis. Source enum: `EventType` (short form
strips the `EVENT_TYPE_` prefix). Common values:

`LOGIN`, `REGISTER`, `LOGIN_SUCCESS`, `REGISTER_SUCCESS`, `ATTEMPT_PURCHASE`,
`COMPLETE_PURCHASE`, `ADD_PAYMENT_METHOD`, `START_SUBSCRIPTION`,
`END_SUBSCRIPTION`, `ATTEMPT_REDEEM_OFFER`, `REDEEMED_OFFER`,
`ADD_TEAM_MEMBER`, `REMOVE_TEAM_MEMBER`, `ATTEMPT_DELETE_ACCOUNT`,
`PAGE_VISIT`, `HEARTBEAT`, `VERIFY_DEVICE`, `REPORT_DEVICE`,
`CUSTOMER_DEFINED`.

## Event Payload Structure

The payload is Upollo's `AnalysisResponse` in protobuf-JSON (camelCase keys).
Observed deliveries use the short (prefix-stripped) enum forms:

```json
{
  "action": "CHALLENGE",
  "eventType": "LOGIN",
  "flags": [
    {
      "type": "ACCOUNT_SHARING",
      "firstFlagged": "2026-07-01T12:00:00Z",
      "mostRecentlyFlagged": "2026-07-27T09:00:00Z"
    }
  ],
  "userInfo": {
    "userId": "user_123",
    "userEmail": "user@example.com",
    "userName": "Jane Doe"
  },
  "deviceInfo": {
    "deviceId": "dev_abc",
    "os": "macOS",
    "deviceClass": "DEVICE_CLASS_DESKTOP",
    "browser": "Chrome"
  },
  "geoInfo": { "geoIpCity": "London", "geoIpRegion": "GB" },
  "isUsingVpn": false,
  "isUsingTor": false,
  "requestId": "req_xyz"
}
```

Key fields (from Upollo's `AnalysisResponse`):

- `action` — recommended outcome (see Actions).
- `flags[]` — each has `type`, `firstFlagged`, `mostRecentlyFlagged` (and
  optionally `ignoredUntil`).
- `eventType` — the triggering activity.
- `userInfo` — `userId`, `userEmail`, `userPhone`, `userName`, addresses.
- `deviceInfo` — `deviceId`, `os`, `deviceClass`, `browser`, block flags.
- `geoInfo` — city/region and coordinates.
- `isUsingVpn` / `isUsingTor` — boolean network signals.
- `requestId` — the analysis request identifier.

> **Enum prefixes.** Upollo's protobuf enums prefix their values
> (`OUTCOME_CHALLENGE`, `EVENT_TYPE_LOGIN`, `FLAG_TYPE_UNSPECIFIED`). Observed
> webhook JSON uses the short form. Handle both by stripping the
> `OUTCOME_` / `EVENT_TYPE_` / `FLAG_TYPE_` prefix before matching — the example
> handlers do this.

## Delivery and Retries

Upollo's retry/backoff behaviour is **not documented**. Follow the usual webhook
discipline: respond `2xx` quickly to acknowledge, defer heavy work, and make
handling idempotent (the same user can be flagged repeatedly). See the
[webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns)
skill.

## Testing Flags

Trigger a real flag by using a suffixed email when reporting a user to Upollo:

| Email suffix | Flag raised |
|--------------|-------------|
| `+account_sharing` | `ACCOUNT_SHARING` |
| `+multiple_accounts` | `MULTIPLE_ACCOUNTS` |

For example `you+account_sharing@example.com`.

## Full Reference

Upollo's webhook and verification documentation lives at
`https://app.upollo.ai/docs/reference/webhooks`. **Note:** at the time of
writing this host did not resolve — confirm Upollo is operational and re-verify
against a live delivery. The actions, flags, and event types above were taken
directly from Upollo's own `upollo-python` protobuf definitions.
