# TODO - Known Issues and Improvements

*Last updated: 2026-07-27*

These items were identified during automated review. The Major item below has
been addressed; the remaining points are onboarding-dependent or minor.
Contributions are welcome.

## Resolved

### Major (fixed)

- [x] **Basic Auth is no longer presented as guaranteed/required.** Ethoca's docs
  (api-basics, llms-full.txt) describe inbound Push API security as mTLS
  (MSSL / Entrust) + TLS only, with no documented per-message signature and no
  guaranteed Basic Auth on the POST. The skill now leads with **mTLS as the
  definitive trust mechanism** and treats **Basic Auth as an OPTIONAL,
  onboarding-agreed second factor**:
  - Handlers enforce Basic Auth **only when `ETHOCA_WEBHOOK_USERNAME` /
    `ETHOCA_WEBHOOK_PASSWORD` are configured**. With no credentials set they do
    **not** return `401` — they accept the delivery and rely on mTLS. See
    `examples/express/src/index.js`, `examples/nextjs/app/webhooks/ethoca/route.ts`,
    and `examples/fastapi/main.py` (the FastAPI dependency now returns `True`
    instead of raising `500`/`401` when credentials are absent).
  - Docs updated to match: SKILL.md (Verification core), `references/overview.md`
    (How Delivery Works), `references/setup.md`, `references/verification.md`,
    and the `.env.example` / README files across all three examples.

## Remaining / onboarding-dependent

- [ ] Whether Ethoca actually sends Basic Auth (and the exact credentials) is
  agreed with the Ethoca Customer Delivery Team at onboarding — confirm your
  endpoint's configuration there. An mTLS-only endpoint is valid.
- [ ] The numeric `alertType` mapping (`1 -> fraud`, `2 -> dispute`) remains an
  **unconfirmed guess** — the literal enum is not published publicly and has
  historically been numeric. Confirm the actual values against your onboarding
  schema. This is now flagged as unconfirmed in the handler comments and docs.

## Suggestions

- [ ] The FastAPI dependency `require_ethoca_auth` reads env per-request; when
  Basic Auth is unconfigured it now returns `True` (accept, rely on mTLS) rather
  than raising a `500` config error — this is intentional given Basic Auth is
  optional.
- [ ] The examples/*/README and setup.md could cross-link Ethoca's llms-full.txt
  (developer.mastercard.com/ethoca-alerts-for-merchants/documentation/llms-full.txt)
  as a machine-readable source for onboarding-time schema confirmation.
