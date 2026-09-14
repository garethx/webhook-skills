# TODO - Known Issues and Improvements

*Last updated: 2026-09-14*

These items were identified during authoring and review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Minor

- [ ] **The digest algorithm and encoding are not confirmable from Formstack's current
  public documentation.** The skill implements HMAC-SHA256 rendered as lowercase hex, and
  `references/verification.md` says plainly where that comes from: it is what Hookdeck's own
  `FORMSTACK` source integration implements, not a fact quoted from Formstack. Formstack's
  live help article
  ([WebHook Submit Actions](https://help.formstack.com/hc/en-us/articles/44592535914387-WebHook-Submit-Actions))
  documents the `X-FS-Signature` header name and the "HMAC Key" field but never names the
  algorithm or the encoding. The developer page that did state it —
  `developers.formstack.com/v2.0/docs/webhook-setup`, still linked from the bottom of that
  help article — now returns **404**, and the current `developers.formstack.com` documents
  only the webhook CRUD API (its schema confirms `hmacSecret` and `customHmacHeader` exist,
  but not the digest format).
  - Revisit if Formstack republishes the developer webhook-setup page, or once a live
    delivery has been captured and its digest recomputed. Either would upgrade this from an
    interoperability fact to a documented one.
  - The examples already hedge for it: they tolerate a bare or `sha256=`-prefixed digest,
    and verification.md carries an "If hex never matches, try base64" troubleshooting step.

- [ ] **No live delivery has been verified against a real Formstack account.** Every fact in
  this skill is doc-derived or derived from Hookdeck's Formstack integration. The
  highest-value follow-up is to fire one real submission and recompute the digest, which
  would settle the hex-vs-base64 question above and confirm which metadata keys actually
  ship in the body.

- [ ] **The payload envelope beyond `FormID` and `UniqueID` is deliberately not
  enumerated.** Those two come from the API reference's own example webhook schema; every
  other key in a Formstack body is the form's own field label, so there is no fixed schema
  to document. The skill points at
  `GET /forms/{formId}/webhooks/openapi` as the honest per-form answer. Do not add a
  speculative envelope field list.

## Suggestions

- [ ] The FastAPI example emits a `StarletteDeprecationWarning` ("Using httpx with
  starlette.testclient is deprecated; install httpx2 instead") under the pinned versions.
  Harmless today, and repo-wide rather than specific to this skill.

- [ ] The Next.js example's `vitest.config.ts` triggers a Vite warning about ESM syntax in a
  CommonJS-loaded file. Adding `"type": "module"` to `nextjs/package.json` (or renaming the
  config to `.mts`) would silence it. Also a repo-wide pattern.
