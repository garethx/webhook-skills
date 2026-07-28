# Smile API Webhooks Overview

## What Are Smile API Webhooks?

Smile API (getsmileapi.com) is an **employment, income, and financial-data
aggregator for Southeast Asia** (Philippines-focused). When a user connects a
data source (employer, HR/payroll system, government portal, gig platform, etc.)
or when Smile finishes collecting data, Smile sends a **webhook**: an HTTPS
`POST` with a JSON body to the endpoint URL you registered.

> **Disambiguation.** This is **Smile API** for employment/income data — **not**
> Smile.io (loyalty/rewards) and **not** Smile Identity (KYC/biometrics). The
> header is `Smile-Signature` and the algorithm is HMAC-**SHA512**.

## How Deliveries Are Authenticated

Every delivery carries a **`Smile-Signature`** header — the hex-encoded
**HMAC-SHA512** digest of the raw request body, keyed with the per-endpoint
secret you configured at registration. Verify this before trusting the payload.
See [verification.md](verification.md).

Deliveries also originate from a **static IP, `18.142.61.230`**, over HTTPS
only. You may allowlist that IP as a defense-in-depth layer, but signature
verification is the primary control.

## Event Payload Structure

Payloads are JSON objects. The event name is the **`type`** field; the unique
event id is the **`id`** field:

```json
{
  "id": "et-123abc456def789abc123def456abc78",
  "version": 1,
  "type": "ACCOUNT_CONNECTED",
  "createdAt": "2021-04-14T09:30:24Z",
  "data": {
    "userId": "tenantId-123abc456def789abc123def456abc78",
    "accountId": "a-123abc456def789abc123def456abc78",
    "loginName": "userLoginName",
    "providers": ["abccorp"]
  }
}
```

The `data` object varies by `type`. For `TASK_FINISHED` and
`ACCOUNT_SYNC_TASK_FINISHED`, enabling `includePayload` inlines the full data
(up to 300 list items) into `data`; otherwise you fetch the data from the Smile
API using the ids in the event.

## Common Event Types

| `type` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `ACCOUNT_CONNECTED` | A user connects a data-source account | Kick off data collection, update UI |
| `ACCOUNT_DISCONNECTED` | A connected account is disconnected | Stop syncing, notify the user |
| `TASK_FINISHED` | A data-collection task completes | Pull results, advance the flow |
| `IDENTITY_ADDED` | Identity data is added for a user | Populate KYC / profile fields |
| `INCOMES_ADDED` | Income records are added | Income verification, affordability |
| `EMPLOYMENTS_ADDED` | Employment records are added | Employment verification |
| `RECORD_COMPLETED` | A record is fully collected/completed | Finalize an application |

## Full Event Type List

Smile emits ~35 event types (UPPER_SNAKE_CASE). Subscribe to specific types or
to **`ALL_EVENTS`** to receive everything.

**Network / resources:** `USER_CREATED`, `TASK_STARTED`, `TASK_FINISHED`

**Accounts:** `ACCOUNT_CREATED`, `ACCOUNT_CONNECTED`, `ACCOUNT_DISCONNECTED`,
`ACCOUNT_FAILED`, `ACCOUNT_SYNC_TASK_FINISHED`

**Archives:** `ARCHIVE_STARTED`, `ARCHIVE_ANALYZED`, `ARCHIVE_REVOKED`,
`ARCHIVE_FAILED`

**Invitations:** `INVITE_INVITED`, `INVITE_LINKED`

**User data:** `IDENTITY_ADDED`, `RATING_ADDED`, `TRANSACTIONS_ADDED`,
`DOCUMENTS_ADDED`, `DOCUMENTS_UPDATED`, `EMPLOYMENTS_ADDED`,
`EMPLOYMENTS_UPDATED`, `INCOMES_ADDED`, `INCOMES_UPDATED`, `EINCOMES_ADDED`,
`EINCOMES_UPDATED`, `CONTRIBUTIONS_ADDED`, `CONTRIBUTIONS_UPDATED`,
`LIABILITIES_ADDED`, `LIABILITIES_UPDATED`, `INSIGHT_ADDED`, `LINK_ADDED`,
`RECORD_CREATED`, `RECORD_COMPLETED`

**Signals:** `VERIFICATION_STARTED`, `VERIFICATION_COMPLETED`

## Delivery Semantics

- **At-least-once.** Smile expects a `2xx` response. A non-2xx (or timeout) is
  **retried up to 2 times**, a few dozen seconds apart. Always **dedupe on the
  event `id`** — the same event may arrive more than once.
- Respond `2xx` quickly and do heavy work asynchronously so you do not trigger
  retries with slow processing.

## Full Event Reference

For the complete, current list of events and payloads, see Smile's
[Webhooks documentation](https://docs.getsmileapi.com/reference/webhooks).
