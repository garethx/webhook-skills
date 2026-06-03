# Evidence-Gathering Methodology

The point of this review is grounding. Every score traces to something you saw. This file is the playbook for finding that evidence on a public surface, with notes on what to capture for each rubric category.

Capture as you go: keep a running list of `finding -> source link or screenshot path -> rubric criterion`. You will need a source for every score, and the recommendations later lean on these links.

## Read what a human reads

This is a human developer's audit. For categories 1 through 11, gather evidence from the surfaces a person actually uses: the rendered HTML doc pages a developer browses, the dashboard, the API reference as published. Pull the same URLs a human visits (for example `/docs/webhooks`), not the platform's machine exports (`/docs/webhooks.md`, `llms.txt`, `llms-full.txt`). If a doc page is client-rendered and a plain fetch returns an empty shell, escalate to a browser so you see what the human sees, rather than falling back to a `.md` version.

**Evidence vs scoring.** Fetching a `.md` page to confirm a quote or extract a code sample faster is fine for evidence collection. The rule is that you *score* the experience the rendered HTML page presents to a human, not what a separate `.md` export contains. If the `.md` and the HTML diverge (e.g. the `.md` is more complete or has different examples), that is an evidence gap, not a free pass to score the better of the two.

The machine-oriented formats are not your reading shortcut here; their presence is itself an AI-readiness signal, scored only in category 12. The one exception is a formal API/event spec (OpenAPI, AsyncAPI, JSON Schema): fetch it for the category 4 event-schema criterion, because developers use it for codegen and validation. That is human DX, not the same as substituting a doc export for the human docs.

## Order of work

Work cheapest-and-broadest first, then drill in.

0. **Identify destination types AND platform audience up front.** Two declarations drive which criteria apply:
   - **Destination types** offered: HTTP webhooks, SQS, Pub/Sub, RabbitMQ, EventBridge, Kafka, Azure Event Grid, any others. The platform may call this "webhooks", "event destinations", or "event subscriptions" - the same audit applies. Search the docs for those terms plus: "endpoint", "outbound events", "outbound webhooks", "stream", "egress", "partner event source", "partner topic", "EventBridge", "Pub/Sub", "SQS", "Kafka", "Event Grid", "RabbitMQ". Different platforms label the same thing differently; cast a wide net. Use https://eventdestinations.org as the benchmark for what the offering should include. Feeds the destination-type-breadth criterion in category 6 and Table 1 of the N/A logic in `rubric.md`.
   - **Platform audience**: `developer-platform` (integrators are software engineers writing production code), `no-code-saas` (integrators are power users wiring up automations through a UI), or `mixed` (the platform serves multiple audiences with the webhook surface specifically targeting a tier within them). Fetch the platform's homepage and verify the designation against concrete signals: hero headline and "for whom" copy; main nav structure (developer-focused entries like "Docs"/"API Reference" vs ops-focused like "Scheduling"/"Analytics"); customer testimonials and logos (engineers vs marketers vs agencies); pricing tier names; prominence of API documentation (top nav vs buried mid-page); onboarding CTA framing ("Start free trial" vs "Get API key"). Cite at least three signals in the audit's `Audience:` header line, quoting the relevant marketing copy. Prefer `mixed` over picking one when the platform clearly serves more than one audience; the mixed designation surfaces the audience-tension that often shows up in webhook DX (e.g., a primarily no-code product with webhooks for the smaller developer tier). Pass-1-only audits may default to `developer-platform` if the homepage cannot be fetched, but Pass 2 must revisit with verification. Feeds Table 2 of the N/A logic.

1. **Map the docs as a human would.** Use the docs site's own navigation and search to find the webhook/events section, the way a developer lands on it. Read the rendered HTML pages, not `.md` exports. Separately, note whether an `llms.txt`/`llms-full.txt` exists, but record that only as evidence for category 12, do not read from it in place of the human docs. (Categories 1, 3; existence noted for 12.)

2. **Pull machine-readable specs.** Look for one of: an OpenAPI **3.1** spec with a `webhooks` block keyed by event type, an AsyncAPI document, or per-event JSON Schemas. These are the three ways per-event payload contracts get declared formally. A spec that contains a single generic `event` schema with a polymorphic `data` field gives you a typed envelope but not per-event-type handler stubs, so it scores 1, not 2. An OpenAPI 3.0 spec cannot declare webhooks formally (the `webhooks` key is 3.1); check whether the platform has supplemented it with per-event JSON Schemas or AsyncAPI. (Category 4.)

3. **Read the webhook and event-destination docs properly.** Verification code, handler guidance (including the platform's response timeout window, the ingest-verify-queue pattern for production traffic, and any reference architectures the platform recommends to integrators for async processing), retries, idempotency, ordering, event catalog, payload definitions, versioning policy, destination-type breadth, per-destination native auth. Note language coverage of code samples. (Categories 3, 4, 5, 6.)

4. **Walk signup and onboarding.** If you have an account, go from signup to the webhook-config screen and count the steps; try to fire a test event and receive it. If public-only, reconstruct the path from docs and screenshots and say so. (Categories 1, 2.)

5. **Inspect setup surfaces.** Dashboard config screens; API endpoints for webhook and destination CRUD; CLI presence and scope; Terraform/IaC provider and whether it covers webhooks and destinations. (Category 7.)

6. **Check SDKs.** Find the official SDK list. Open the repos and look for a verification/constructEvent helper and typed event payloads. The presence of a real `verifyWebhook`-style function is the difference between 1 and 2. (Category 8.)

7. **Assess consumer self-serve and observability.** Can the integrating developer manage their own endpoints, filter by event type, register multiple endpoints, and see their own delivery logs with payloads and responses? This is distinct from the platform's internal view. If account-gated and you have no access, mark Not Assessed rather than guessing (these are human-in-the-loop (HITL) gaps, not logical exclusions). (Categories 9, 10.)

8. **Local dev and transition to prod.** Documented localhost-receiving path, inspect/replay in dev, test-mode fidelity, workflow/scenario simulation, and a documented local-to-production transition. For workflow simulation, search the docs/CLI for "scenario", "fixture", "lifecycle", "workflow", "trigger sequence" — Paddle calls them named "scenarios" (`subscription_creation`, `subscription_renewal`); Stripe has implicit prerequisite chaining plus CLI fixtures for scripted multi-step flows; Shopify's `webhook trigger` is single-event only. (Category 11.)

9. **Agent readiness.** Score the externally observable layers of the agent-ready model (https://hookdeck.com/blog/developer-platform-agent-ready). Information: check for `llms.txt` at a stable URL and whether it points to `.md` page versions; fetch a `.md` doc URL and check the response `Content-Type` (`text/markdown` is the strong signal); look for push-to-agent actions on doc pages (Copy as Markdown, Open in Claude/ChatGPT/Cursor). "Scoped sensibly" for `llms.txt` means structured by topic or product with relative URLs to `.md` page versions, not a single flat dump of every page on the site. Guidance: look for agent skills (search `github.com/hookdeck/webhook-skills` and the platform's own org), prompts, or task-oriented how-tos. Action: check that the webhook configuration API is publicly documented for agent use (the foundational layer), then look for a CLI or MCP that covers the webhook surface specifically (either suffices, but it must cover webhook management to count; a platform-wide MCP that excludes webhook tools does not). Treat Verification and Measurement as internal and Not Assessed unless publicly documented (they should be assessable; the gap is access, not applicability). (Category 12. Do not re-score OpenAPI or typed SDKs here; those are categories 4 and 8.)

## Tactics

- **Use the docs search and sitemap.** Search the docs for "signature", "verify", "retry", "idempoten", "rotate", "egress IP", "test event", "replay", "version", "timeout", "respond", "async", "queue", "EventBridge", "Pub/Sub", "Event Gateway", "ingest" to jump straight to evidence.
- **Read the SDK source, not just the README.** READMEs overclaim; the function signatures do not.
- **Prefer primary sources.** A changelog entry or API reference field beats a blog post.
- **Note what you could not reach.** A short "Access limits" note in the report (no test account, region-gated dashboard, etc.) keeps the grade honest and tells the reader why something is Not Assessed.
- **Pick the right label.** Use Not Supported (= 0) when the capability should exist but doesn't (e.g. a developer platform with no signing scheme); use Not Applicable when a logical rule rules the criterion out (e.g. Cat 5 destination-native auth on a webhook-only platform; Cat 12 CLI-for-agents when no CLI exists); use Not Assessed only when access is gated and HITL would resolve it. The arithmetic differs (see `scoring.md`), so the label matters.
- **Stay factual; no editorial.** Per-category prose describes what was observed and links the evidence. It does not characterize the finding as "surprising", "impressive", "disappointing", "painful", or similar. Reactions and qualitative synthesis belong in the summary at the top of the report and in the prioritized recommendations - not in the per-criterion or per-category text. The grade letter and the recommendations carry the qualitative weight; the body of the audit is observation.

## Hookdeck tooling you can use during the review

These help you produce evidence quickly, and several are the same tools you may later recommend (see `program-mapping.md`):

- **Hookdeck Console** (`https://console.hookdeck.com`): create a throwaway test URL to point a webhook at, and inspect the request body, headers, and response. Good for verifying that "send test event" actually delivers and for capturing a real payload.
- **Hookdeck CLI** (`hookdeck listen <port> <source>` or `npx hookdeck-cli listen ...`, no account required): receive events on localhost and replay them. Useful to test the platform's local-dev claims firsthand.
- **Provider sample payloads** in Console (e.g. `https://console.hookdeck.com/?provider=<name>`): check whether the platform already has a provider listing and sample payloads.

## What "good" looks like (reference points)

When deciding between 1 and 2, calibrate against platforms whose outbound DX integrators directly experience and benchmark against. The primary anchor is **Stripe**: signing with timestamp tolerance, `constructEvent` SDK helper, thin events with retrieve, clear retry docs, dashboard delivery logs, test mode, CLI fixtures and triggers, agent-driven provisioning via https://projects.dev. Other useful sender anchors for specific features: SendGrid (ECDSA asymmetric signing), GitHub (clear event taxonomy and signature scheme), Twilio (per-attempt status callbacks). The Event Destinations initiative at https://eventdestinations.org sets the broader floor for what an offering should include.

You are not requiring a small platform to match Stripe; you are scoring how close the developer experience comes to those expectations, and naming what would close the gap.

Do not use webhook delivery products (Hookdeck Outpost, Svix, etc.) as calibration anchors. These ship outbound delivery for platforms but are typically embedded behind the platform's own branding and docs - the integrator experiences the *platform*, not the delivery service underneath. They belong in `program-mapping.md` as gap-closing options, not as benchmarks. (Additionally, this skill lives in `hookdeck/webhook-skills`, so naming Hookdeck specifically as a benchmark would be a conflict of interest regardless of merit.)

Agent-readiness calibration for Cat 12 has moved beyond docs-and-MCP. Stripe Projects (https://projects.dev) is a concrete example of agent-driven account provisioning: agents can autonomously sign up, generate credentials, and configure resources via CLI. Platforms shipping this kind of capability raise the bar on what L1 access looks like and on Cat 12 Action-layer scoring.

If the audit subject is itself one of the reference platforms (e.g. you are auditing Stripe), do not calibrate Stripe against Stripe. Calibrate against the broader Event Destinations bar at https://eventdestinations.org plus the gaps a real integrator would still hit, so the score reflects what the platform is rather than what it defines as "good".
