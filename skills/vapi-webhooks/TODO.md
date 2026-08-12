# TODO - Known Issues and Improvements

*Last updated: 2026-08-05*

These items were identified while authoring the skill from Vapi's documentation.
They are acceptable for merge; contributions to close them are welcome.

## Deliberately generic (not defects)

- [ ] **HMAC option — default now grounded, still customer-configurable.** Vapi's
  own docs pin no default algorithm/header/encoding/signed-string (re-confirmed
  2026-08 via WebFetch of `/server-url/server-authentication` — they list only the
  configurable fields). `references/verification.md` now gives a **concrete
  default** taken from Hookdeck's verified Vapi source in `hookdeck/core`:
  HMAC-**SHA256** over the **raw request body** (no timestamp prefix), **hex**, in
  the **`x-signature`** header, with `sha1`/`sha512` and `base64`/`base64url`
  supported and MD5 excluded. This is Hookdeck's default, not a Vapi guarantee —
  the customer's dashboard credential still wins. A live capture (or a Vapi-signed
  known-answer vector) would let us add a KAT and upgrade "default" → "confirmed".

## To verify against a live account

- [ ] **No live-delivery verification yet.** This skill was authored from the
  canonical docs (`/server-url`, `/server-url/events`,
  `/server-url/server-authentication`), not from a captured live delivery. A live
  run should confirm: the exact `message.type` string set, the `tool-calls`
  `toolCallList` entry shape (`function.name`/`arguments` vs flat `name`), and the
  precise required response shapes for `transfer-destination-request` and
  `knowledge-base-request`.
- [ ] **`assistant-request` ~7.5s timeout** is documented as a hard, fixed cap
  derived from the telephony provider's 15s limit. Confirm the exact budget in a
  live inbound call.

## Notes for reviewers

- The event type is nested at **`message.type`** (confirmed from
  `/server-url/events`). A Vapi CLI tutorial page shows a flatter shape with a
  top-level `type` and names like `call-started` / `function-call` — that is
  informal example code, **not** the wire format, and is intentionally not
  followed here.
- The `verifyVapiSignature` name in that same CLI snippet is a placeholder with no
  implementation or SDK export; the skill does not use it.
