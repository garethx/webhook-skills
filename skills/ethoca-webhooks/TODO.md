# TODO - Known Issues and Improvements

*Last updated: 2026-07-27*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Major

- [ ] **skills/ethoca-webhooks/references/verification.md**: The skill presents HTTP Basic Auth as a guaranteed part of Ethoca Push API delivery ('Every POST carries Authorization: Basic base64(username:password)') and builds the entire application-layer verification core around it. Ethoca's official documentation (api-basics, llms-full.txt) describes inbound push security as mTLS (MSSL/Entrust) + TLS only, with no documented Basic Auth on the POST and no signature header. Basic Auth on the endpoint is a plausible optional, merchant-configured layer, but asserting Ethoca sends it 'on every POST' as fact is not supported by the docs and overstates the security model.
  - Suggested fix: Reframe mTLS as the definitive, documented verification mechanism and present Basic Auth explicitly as an OPTIONAL merchant-configured second factor that applies only if it was agreed during onboarding. Soften definitive phrasing like 'Ethoca sends ... on every POST' to 'If you agree Basic Auth credentials during onboarding, Ethoca will send ...'. Keep the (correct) verifyEthocaAuth code as the optional check, and note that an endpoint relying solely on mTLS may receive no Authorization header. Apply the same reframing in SKILL.md (Verification core), references/overview.md (How Delivery Works step 2), and references/setup.md.

## Suggestions

- [ ] In verification.md, note that FastAPI's require_ethoca_auth returns 500 per-request when env vars are missing, whereas Express/Next.js validate at startup — consider a brief note that this is intentional (config error vs auth failure).
- [ ] Consider adding an explicit note that when an endpoint is secured by mTLS alone (no Basic Auth agreed), the handler should treat a missing Authorization header as acceptable rather than 401 — the current examples hard-require Basic Auth, which would reject a valid mTLS-only delivery.
- [ ] The examples/*/README and setup.md could cross-link Ethoca's llms-full.txt (developer.mastercard.com/ethoca-alerts-for-merchants/documentation/llms-full.txt) as a machine-readable source for onboarding-time schema confirmation.

