# TODO - Known Issues and Improvements

*Last updated: 2026-07-27*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Assumptions

- [ ] **`x-gd-signature` is intentionally NOT verified.** A Green Dot delivery
  may carry an `x-gd-signature` header, but Green Dot's public docs
  (developer.greendot.com/embedded-finance/docs/webhooks-overview) do not
  document its algorithm, encoding, or the canonical payload it is computed over,
  and sample payloads show no signature header. Rather than ship a guessed
  HMAC-SHA256 implementation — which would let a user wire in a key and wrongly
  trust an unverified payload — this skill authenticates deliveries with the
  documented inbound-auth model only: the OAuth 2.0 client_credentials Bearer
  token (scope `post:webhook`), with the Certificate (mTLS) variant as an
  alternative. The `x-GD-RequestId` echo and the `responseDetails` acknowledgement
  are implemented as documented.
  - If your program requires payload-level verification, obtain the exact
    signature specification (algorithm, encoding, canonical payload) and the
    signing key from your Green Dot representative, then implement the check over
    the raw request body, after the token check, in each handler
    (`examples/express/src/index.js`, `examples/nextjs/app/webhooks/greendot/route.ts`,
    `examples/fastapi/main.py`) where the "x-gd-signature is not verified" note is.

## Suggestions

- [ ] The examples validate an HS256 Bearer token with a shared secret so they are
  self-contained and testable. In production, validate the OAuth token against
  your authorization server (JWKS / RS256 or token introspection) as described in
  `references/verification.md`.
