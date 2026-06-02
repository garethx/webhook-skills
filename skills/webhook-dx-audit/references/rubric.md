# Webhook DX Audit Rubric

Score every criterion 0, 1, or 2:

- **0 (Missing):** No evidence the capability exists, or it is absent where a developer would reasonably expect it.
- **1 (Partial):** Present but incomplete, undocumented, hard to find, or weaker than current practice.
- **2 (Present):** Clearly available, documented, and matching what a developer integrating in production would expect.

Use **Not assessed** only when your access genuinely cannot reach the evidence (for example, a dashboard-only feature you have no account for). Not assessed criteria are excluded from weighting, not scored 0. See `scoring.md`.

**Whose experience you are scoring:** categories 1 through 11 are the human developer's experience, judged from the surfaces a person uses (rendered HTML docs, dashboard, published API reference). Category 12 is the only place AI and agent readiness is scored. Do not reward a platform in categories 1 through 11 for having `.md`/`llms.txt` docs or agent skills; that belongs in 12.

The categories below are ordered roughly along the integration journey. Weights live in `scoring.md`; the heaviest categories are Event catalog & schema, Security & authentication, and Delivery semantics & reliability, because those are where developers lose the most time and trust.

## Categories

1. Discovery & signup
2. Onboarding & first event
3. Documentation quality
4. Event catalog & schema
5. Security & authentication
6. Delivery semantics & reliability
7. Setup surfaces (UI / API / CLI / IaC)
8. SDKs & verification libraries
9. Consumer self-serve & subscription management
10. Consumer-facing observability
11. Local dev, testing & local-to-production transition
12. Agent / AI readiness

---

## 1. Discovery & signup

Lightweight. How quickly a developer finds the webhook offering and gets to a state where they can configure one.

- **Findability of webhook docs.** Can you reach the webhook/event docs from the top-level docs or product nav in one or two clicks? 0: buried or search-only. 2: clearly linked section.
- **Signup friction to webhook config.** From a new account, how many steps to the screen where a webhook/destination is configured? 0: requires sales contact or opaque gating. 1: possible but slow or unclear. 2: self-serve and obvious.
- **Free/test access.** Can a developer try webhooks without a paid plan or production data? 0: no. 2: sandbox, test mode, or free tier reaches webhook config.

## 2. Onboarding & first event

Lightweight. Time and clarity from "I have an account" to "I received a verified event".

- **Guided path to first webhook.** Is there a quickstart or in-product guidance that walks to a first delivered event? 0: none. 1: docs only, no in-product help. 2: quickstart plus in-product cues.
- **Time to first event.** Could a competent developer plausibly receive a first event in under ~15 minutes from the public surface? 0: unclear or blocked. 2: yes, with an obvious path.
- **Test event / trigger.** Can the developer fire a test event from the dashboard or API without producing real domain activity? 0: must create real data. 1: limited or hidden. 2: explicit "send test event".

## 3. Documentation quality

The webhook section as a developer reads it, not the marketing page.

- **Verification walkthrough with code.** Is there copy-pasteable signature-verification code, ideally in more than one language/framework? 0: prose only or none. 1: one snippet, partial. 2: complete, multi-language.
- **Processing & handler guidance.** Does it cover responding fast, returning 2xx, processing async, and handling duplicates? 0: silent. 1: mentions some. 2: covers the handler lifecycle.
- **Best-practices coverage.** Out-of-order delivery, idempotency, retries-from-the-consumer-side, timeouts. 0: none. 1: partial. 2: explicit guidance on each.
- **Accuracy & freshness.** Do docs match observed behavior and current API? 0: stale/contradictory. 2: consistent with what you tested.

## 4. Event catalog & schema

How a developer learns what events exist and what each payload contains. Heavily weighted.

- **Event type catalog.** Is there a complete list of event types with descriptions? 0: none. 1: partial or scattered. 2: complete, single source.
- **Payload definitions.** Are payload fields defined (types, required, meaning), not just one example blob? 0: example only. 1: examples plus loose notes. 2: defined fields per event.
- **Machine-readable spec.** Are events/payloads in OpenAPI, AsyncAPI, or published JSON Schema for programmatic use? 0: none. 1: spec exists but omits webhook events. 2: events covered in a fetchable spec. (This is about formal schemas a developer uses for codegen and validation, not the `llms.txt`/agent-docs signal, which is scored in category 12.)
- **Sample payloads.** Are realistic sample payloads available per event type (in docs or fireable)? 0: none. 2: representative samples per type.
- **Versioning & evolution.** Is there a stated policy for schema changes (versioning, additive-only, deprecation notice)? 0: none. 1: mentioned, vague. 2: clear policy.
- **Payload shape guidance.** Thin (id + fetch) vs fat (full object) is explained, or a standard envelope (e.g. CloudEvents) is used. 0: unaddressed. 1: implicit. 2: explicit choice and rationale, or standard envelope.

## 5. Security & authentication

The capability most often weak and most consequential. Heavily weighted.

- **Signature scheme.** Is delivery signed (HMAC-SHA256 baseline, asymmetric a plus) with the scheme documented? 0: unsigned or undocumented. 1: signed but thinly documented. 2: documented, robust scheme.
- **Replay protection.** Is a timestamp included in the signed material with guidance on a tolerance window? 0: none. 1: timestamp present, no guidance. 2: signed timestamp plus replay guidance.
- **Secret rotation.** Can a customer rotate the signing secret, ideally with two active secrets during overlap? 0: no/unknown. 1: rotation possible, no overlap. 2: overlapping rotation supported and documented.
- **Destination auth options.** Beyond signatures: bearer/custom headers, OAuth2 client credentials, or mTLS for the receiving endpoint. 0: none. 1: one option. 2: multiple, documented.
- **Source IP / egress.** Are static egress IPs or an allowlist published so consumers can firewall the source? 0: none. 2: documented IPs/range.

## 6. Delivery semantics & reliability

What happens after "send", and whether the developer can reason about it. Heavily weighted.

- **Retry policy.** Is the retry behavior (backoff, max attempts, total window) documented? 0: silent. 1: mentioned, vague. 2: precise and clear.
- **Delivery guarantee stated.** Is at-least-once (or other) delivery explicitly stated, with dedup guidance tied to idempotency? 0: unstated. 1: implied. 2: explicit, with dedup guidance.
- **Manual replay / redelivery.** Can a failed or past event be redelivered via UI and/or API? 0: no. 1: one path. 2: UI and API.
- **Failure handling & auto-disable.** Is the behavior after exhausting retries defined (endpoint disable, dead-letter), with reactivation? 0: undefined. 1: partial. 2: defined with recovery path.
- **Failure alerting.** Are consumers notified of sustained failures or a disabled endpoint (email, Slack, callback)? 0: none. 1: limited. 2: configurable alerting. (Folds in "state transition / meta webhooks": treat meta-webhooks as one valid implementation of this, not a separate requirement.)
- **Ordering & rate controls.** Is ordering behavior documented, and can the consumer cap delivery rate to protect their endpoint? 0: neither. 1: one. 2: both addressed.

## 7. Setup surfaces (UI / API / CLI / IaC)

Whether a developer can configure webhooks the way they work, not just one way.

- **Dashboard configuration.** Can webhooks/destinations be created and managed in a UI? 0: no. 2: full UI management.
- **API configuration.** Are there documented API endpoints to create/update/delete webhook config? 0: none. 1: partial/undocumented. 2: complete and documented.
- **CLI support.** Is there a CLI that can manage or test webhook config? 0: none. 1: exists but limited. 2: covers config/testing.
- **Infrastructure as code.** Terraform provider or equivalent for declarative webhook config? 0: none. 1: community/partial. 2: maintained provider covering webhooks.

## 8. SDKs & verification libraries

The libraries a developer reaches for, especially for verification.

- **SDK availability.** Are there official SDKs in the languages the audience uses? 0: none. 1: one or two. 2: broad coverage.
- **Verification helper.** Does an SDK expose a first-class verify/constructEvent helper (not hand-rolled HMAC)? 0: none. 1: documented manual verification only. 2: SDK helper with examples.
- **Typed events / payloads.** Are event payloads typed (TypeScript types, generated models) for safe handling? 0: none. 1: partial. 2: typed across SDKs.

## 9. Consumer self-serve & subscription management

How much the integrating developer can manage without contacting the platform.

- **Self-serve endpoint management.** Can the consumer add/edit/remove their own endpoints? 0: support ticket required. 2: self-serve.
- **Subscription granularity.** Can they subscribe to specific event types/topics rather than all-or-nothing? 0: all-or-nothing. 1: coarse filtering. 2: per-type/topic.
- **Multiple endpoints.** Can a customer register more than one endpoint (e.g. per environment or service)? 0: single only. 2: multiple supported.

## 10. Consumer-facing observability

Whether the developer can see and debug their own deliveries, distinct from the platform's internal view.

- **Delivery logs.** Can the consumer see per-event delivery attempts (status code, timestamp)? 0: none. 1: limited/recent only. 2: searchable log.
- **Payload & response inspection.** Can they inspect the sent payload and their endpoint's response/body? 0: no. 2: full request/response visible.
- **Latency / attempt detail.** Are attempt counts, next-retry time, and latency visible? 0: none. 1: partial. 2: full attempt detail.

## 11. Local dev, testing & local-to-production transition

Receiving and debugging on localhost, and the path from dev to prod. The program calls this out explicitly.

- **Local receiving story.** Is there a documented way to receive events on localhost (tunnel, CLI, or recommended tool)? 0: none. 1: mentions third-party generically. 2: clear, supported path.
- **Inspect & replay in dev.** Can events be inspected and replayed during development? 0: no. 2: yes.
- **Test / sandbox parity.** Is there a test mode whose webhook behavior matches production closely enough to trust? 0: none. 1: exists but diverges. 2: faithful test mode.
- **Local-to-production transition.** Is the move from local/test to production documented (secrets, URLs, going live without surprises)? 0: unaddressed. 1: implicit. 2: documented transition.

## 12. Agent / AI readiness

The only category where AI/agent concerns are scored. Whether AI coding agents can discover, read, and correctly use the platform's webhooks. Score against the externally observable layers of Hookdeck's agent-ready model: Information, Guidance, and Action. The model's other two layers, Verification (CI on doc examples, drift detection, agent evals) and Measurement (server-side agent-traffic analytics), are internal practices you usually cannot see from outside, so mark them Not assessed unless the platform documents them publicly. Reference: https://hookdeck.com/blog/developer-platform-agent-ready

Two signals that also serve agents, the formal API spec (OpenAPI/AsyncAPI) and typed SDKs, are scored under categories 4 and 8 respectively to avoid double counting. Do not re-score them here.

Information layer:

- **Discoverable index (`llms.txt`).** Is there an `llms.txt` at a stable URL that maps the docs and points to `.md` page versions? 0: none. 1: present but thin, or points only to HTML. 2: present, points to `.md`, scoped sensibly.
- **Markdown doc versions.** Are docs available as `.md` at fetchable URLs, ideally served with `Content-Type: text/markdown` so agent tooling gets lossless passthrough? 0: HTML only. 1: `.md` exists but wrong/missing content-type or incomplete coverage. 2: `.md` at clean URLs with the right content-type.
- **Push-to-agent doc actions.** Do doc pages offer actions to hand content to an agent (Copy as Markdown, Open in Claude/ChatGPT/Cursor)? 0: none. 2: present.

Guidance layer:

- **Agent guidance & skills.** Is there task-oriented agent content (how-to guides, prompts, or a dedicated agent skill, e.g. in `hookdeck/webhook-skills`) that teaches workflows and links to reference rather than duplicating it? 0: none. 1: generic how-tos only. 2: a dedicated skill or prompt that orchestrates the integration.

Action layer:

- **CLI for agents.** If there is a CLI, does it cover core workflows with structured output (`--output json` or equivalent) and actionable error messages that tell an agent what to do next? 0: no CLI. 1: CLI without structured output. 2: structured output plus actionable errors. (Mark Not assessed if a CLI is out of scope for the platform type.)
- **MCP / scoped programmatic surface.** Is there an MCP server or a clean, scoped programmatic surface an agent can drive (small tool surface, idempotent operations)? 0: none. 1: raw API only, no agent affordance. 2: MCP or a deliberately agent-friendly surface.
