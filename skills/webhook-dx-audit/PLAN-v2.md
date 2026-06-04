# Webhook DX Audit v2 plan

Roadmap for the second pass of the `webhook-dx-audit` skill. Read this before executing any of the phases. Each phase produces a discrete artifact with acceptance criteria.

## What we're building

v2 changes the audit's output format from Markdown to structured YAML and consolidates the rubric and methodology learnings accumulated during v1's Ordinal HITL pilot.

The skill emits YAML and only YAML. The `assets/report-template.md` template and the `customers/<name>/audit.md` artifact go away upstream; their replacements are `assets/report-template.yaml` and `customers/<name>/audit.yaml`. Whoever consumes the YAML downstream (the `outpost-customer-audit-report` skill, the cloud agent's website renderer, a future CLI viewer) handles their own presentation.

This is a breaking change for the downstream `outpost-customer-audit-report` skill in `hookdeck/hookdeck-skills-internal`. v2 ships with the downstream cascade in lockstep; no transitional period.

## Why this exists

Three drivers, in priority order:

1. **Cloud agent + public website.** The skill is moving to a cloud agent that accepts URL submissions and renders the audit as a structured page. Rendering structured input is straightforward; parsing a Markdown narrative into web components is error-prone. YAML lets the renderer consume the audit deterministically.
2. **Aggregation and trend detection.** Cross-platform pattern detection becomes a query rather than a manual scan. The "5 of 7 audited platforms do not document the dedup header" use case becomes feasible.
3. **Diff and regression tracking.** Comparing two audits of the same platform across time, or two adjacent passes during HITL, is meaningful when the data is structured. Markdown diffs are noisy at this scale.

A secondary driver: v1 surfaced a steady stream of rubric and methodology tightenings during the Ordinal pilot that are in the repo as incremental commits. v2 is a natural moment to consolidate them and validate against a real audit end to end.

## Out of scope for v2

- Building the cloud agent infrastructure (separate workstream after v2 lands)
- Building the public website (same)
- Multi-platform audit comparison features (the data shape supports it; the tooling is a v3 deliverable)
- A second seeded customer audit alongside Ordinal (do this only if v2 surfaces ambiguity the Ordinal case alone cannot resolve)
- A standalone CLI viewer for humans who want to read YAML audits as a rendered document (someone will want this; out of scope for v2 the skill)

## Constraints

### HITL preservation is mandatory

The Ordinal audit's HITL Pass 2 produced evidence the audit could not have reached unassisted. That evidence must be carried forward into the v2 audit format and not re-asked of the human. The full list of HITL-derived facts to preserve appears in Phase 4 below; cross-check that list against every phase artifact before declaring it done.

### Schema-first

Phase 0 produces the YAML schema before any audit content is migrated. Phases that change the rubric or methodology must be representable in the schema; rubric changes that the schema cannot represent are a schema gap, not a license to fork the audit format.

### Lockstep downstream cascade

The downstream `outpost-customer-audit-report` skill consumes the audit as input. v2's YAML migration is a breaking change for that skill. Phase 6 ships the downstream changes in the same pass as the upstream cutover; there is no transitional renderer or compatibility shim.

## Target layout for v2

```
skills/webhook-dx-audit/
├── SKILL.md                                     # Phase 3 (updated)
├── PLAN-v2.md                                   # this file; archive after v2
├── schema/
│   ├── audit.schema.yaml                        # Phase 0
│   ├── audit.schema.example.yaml                # Phase 0
│   └── README.md                                # Phase 0 (schema docs)
├── references/
│   ├── rubric.md                                # Phase 1 (consolidation)
│   ├── methodology.md                           # Phase 1
│   ├── scoring.md                               # Phase 1
│   └── program-mapping.md                       # Phase 1
└── assets/
    └── report-template.yaml                     # Phase 2 (replaces report-template.md)
```

The Markdown template, the Markdown renderer, and the Markdown audit artifact are all dropped. The v1 Ordinal `customers/ordinal/audit.md` is archived (not deleted) under `customers/ordinal/archive/audit-v1.md` in the downstream repo so the v1 snapshot stays in source control for reference.

## Phases

### Phase 0: Schema design and validation tooling

Goal: produce `schema/audit.schema.yaml` (JSON Schema authored in YAML) plus an example audit (`schema/audit.schema.example.yaml`) and a brief schema README.

Schema must cover:

- Header: platform name, prepared date, access level (L0 / L1 / L2), audience (designation + structured signals with tier, segment, evidence_quote, source_section), reviewer
- Pass narrative: which passes ran, what each closed
- Summary: grade (overall integer, band A through F), summary text (multi-line string)
- Scorecard: per-category percentage, weight, notes; per-criterion score (0/1/2/N/A), evidence (multi-line string), source references (URLs or in-product capture references), status (Not Supported / Not Applicable / Not Assessed with reasons), cross-references to recommendations
- Findings: category id, intro (multi-line), criteria entries, aggregation line (list of recommendation ids)
- Recommendations: id, title, body (multi-line; Markdown content fine inside the string), categories addressed (list of category ids), added_by_report flag, further_reading (list of links)
- HITL evidence captures: structured records of what HITL provided (delivery payload headers as a map, body as a string, in-product observations as evidence strings, signing mode declarations)
- Access limits: structured notes about what could not be assessed and why
- Sources: list of { url, label, section } records

Style: block YAML for all objects; flow style only for scalar arrays. Field names in snake_case. Multi-line strings use the `|` block scalar.

Validation tooling: a `npm` / `uvx` / `pipx` invocation that lints an audit against the schema. The tooling choice is part of Phase 0; whatever lands needs to run in CI and locally.

**Acceptance:** schema covers every field present in the v1 Ordinal audit Markdown without loss; example audit validates against the schema; lint command runs and reports errors with usable messages.

### Phase 1: Consolidate v1 rubric and methodology learnings

Goal: walk every reference file (`rubric.md`, `methodology.md`, `scoring.md`, `program-mapping.md`) and confirm each accumulated v1 commit lands consistently.

Specific items to verify (each was a separate v1 commit; commit references inline so the rationale is one `git show` away):

- Cat 3 rename from "Documentation quality" to "Implementation guidance" (`933b724`) plus the Cat 3 intro scoped to webhooks (`37761ff`) plus the tightened Processing & handler guidance criterion with ingest-verify-queue, timeout window, and reference architectures (`9d85bd4`, phrasing `86e5be1`)
- Cat 12 restructure: API access for agents (foundational) + CLI or MCP for the webhook surface, combined and requiring webhook scope (`99dffeb`)
- Cat 2, 5, 7, 11 intro line cleanups (`937b3dc`)
- Audience verification with cited signals, required from Pass 1 when the homepage is reachable (`bdbb76b`)
- HITL payload capture requirement, full delivery headers + body (`b034703`)
- Summary list scoping rule, only items contributing to the webhook surface (`aaec2bb`)
- Cat 5 scoring example correction, 6 criteria not 5 (`08b4fa9`)
- HITL acronym expansion on first use (`04d9459`)
- Methodology steps 3 and 5 broadened to webhook AND event destinations (`08b4fa9`)
- Program-mapping new row for reliable-ingestion architectures (`9d85bd4`)
- Editorial qualifier rules (no company-stage commentary, no unanchored qualifiers). These were landed downstream in `hookdeck/hookdeck-skills-internal` (`skills/outpost-customer-audit-report/references/methodology.md` Section 3); upstream has the broader "Stay factual; no editorial" rule in `methodology.md` Tactics. Confirm both are consistent; consider lifting the more specific downstream rules upstream if they apply to audit-side prose too.

For each, read the current file and confirm the rule reads cleanly in isolation (a fresh reader gets the right framing without prior context). Tighten any sentence that depends on a chain of previous commits to make sense.

Where rubric or methodology guidance talks about prose patterns (for example, methodology step references to the "Summary paragraph" or "scorecard table"), translate to the new YAML field names so the documentation matches the new format.

**Acceptance:** every reference file reads as a unified document with no commit-history dependencies; every rubric rule has a clear anchor; references match the YAML field names from the schema.

### Phase 2: Migrate the audit template to YAML

Goal: produce `assets/report-template.yaml` as the new template. Delete `assets/report-template.md`.

The template is the YAML structure auditors fill in. Required vs optional fields are visible via the schema. The template is no longer prose with bracketed placeholders; it is structured data with inline comments explaining what each field captures, why it matters, and what kinds of values are valid.

**Acceptance:** an audit YAML conforming to the schema can be produced from the template; the template's inline comments give an auditor enough context to fill in each field correctly; lint passes.

### Phase 3: Update SKILL.md and methodology to YAML-only flow

Goal: update the orchestration prose so the audit agent emits YAML, full stop.

Changes:

- SKILL.md "How an audit runs" section: the output of each pass is the YAML audit file; references to writing the Markdown report disappear
- SKILL.md "Roles: who does what": HITL captures fill structured fields (delivery payload as a structured object, in-product observations as evidence strings keyed by criterion id); no free-form Pass 2 narrative paragraphs
- methodology.md: references to "the Summary paragraph" become "the summary field"; references to "the scorecard table" become "the scorecard array"; etc.
- The "Use this for ..." trigger phrases in the frontmatter description add "produces a structured YAML audit file" so callers understand the output shape

**Acceptance:** SKILL.md and methodology read coherently against the YAML-only flow; no references to "fill in the Markdown template" remain; the description in SKILL.md frontmatter clearly states YAML output.

### Phase 4: Preserve and port Ordinal HITL evidence

Goal: capture every fact Ordinal's HITL Pass 2 surfaced into a structured `customers/ordinal/hitl-evidence.yaml` file in the downstream repo. The v2 audit pass (Phase 5) reads this file at Pass 1 start and skips the corresponding HITL asks.

The HITL evidence to capture (full list; cross-check every item lands in the YAML):

**Active usage observations:**
- Access level reached: L2 (active usage)
- Number of webhooks fired and observed: 2
- Webhooks reached an external destination: yes
- In-product delivery view present: no (confirmed during Pass 2)
- In-product test trigger present: no (confirmed)
- Dashboard CRUD verified end to end: yes (create, edit, disable, delete)
- Webhook configuration nav path: Integrations then Webhooks (confirmed)
- Sign-in flow: Google SSO (confirmed)

**Signing and delivery shape (from the actual delivery payload):**
- Signing mode: Standard Webhooks
- Headers present on every delivery (with confirmed values from the captured payload): `content-length`, `content-type`, `user-agent` (Outpost/1.0.4), `webhook-id` (per-event unique ID), `webhook-signature` (base64 `v1,<sig>`), `webhook-timestamp` (Unix seconds), `webhook-topic` (event taxonomy), `x-api-key` (set by the operator via the `headers` field on webhook creation), `x-hookdeck-original-ip` (source IP from Outpost forward proxy)
- Custom-headers feature confirmed in active use: yes (the `headers` field on webhook creation works; example value captured)
- Signature value example for reference: `v1,0jZ7xcLn1bzurihFk/IncgwZTTGrV1eA8+lHDKgOSPo=`
- Timestamp example: `1780423503`
- Event topic example: `post.content.edited`

**Audience verification (from tryordinal.com):**
- Designation: mixed
- Primary segment: marketing teams and content operators; evidence: hero copy "Build a content engine that drives revenue"; main nav prioritizes Scheduling and Posting, Auto-Engagement, Analytics
- Secondary segment: agencies; evidence: "Ordinal for Agencies" nav section
- Tertiary segment: developers; evidence: "MCP and API support" appears mid-page under "Plan Content" as supplementary; no dedicated Developers section or top-level API docs link
- Webhook integrators specifically: developer/technical tier inside the audience (agency engineers, in-house developers at customer teams)

**Audience-driven scoring decisions to preserve:**
- Cat 11 workflow simulation: scored 0 (not N/A) under mixed designation; reason: webhook integrators are developers, so the criterion applies
- Cat 11 local-to-production transition: same; scored 0 under mixed

**Cat 12 scoring decisions to preserve:**
- API access for agents: 2 (documented public HTTP CRUD API at `/api-reference/webhooks/`)
- CLI or MCP for the webhook surface: 0 (no CLI; hosted MCP at `app.tryordinal.com/mcp` does not cover webhook management)
- Push-to-agent doc actions confirmed via browser

**Other Pass 2 findings:**
- OpenAPI spec URL and version confirmed: `/api/openapi.json`, version `3.1.0`, no `webhooks` block
- `llms.txt` confirmed: `https://docs.tryordinal.com/llms.txt`, points to `.md`, scoped by section
- `.md` doc URLs return `Content-Type: text/markdown; charset=utf-8` (verified via HEAD)
- MCP coverage scope confirmed: posts, ideas, approvals, comments, analytics, media, auto-engagements, Slack boosts (no webhook management)
- Hosted MCP install flow: OAuth-based

The `customers/ordinal/hitl-evidence.yaml` file should structure these as records the audit agent reads at start. The agent then skips the corresponding HITL asks.

Also during this phase: archive the v1 Ordinal audit Markdown to `customers/ordinal/archive/audit-v1.md` so the v1 snapshot stays in source control for reference. Same for the v1 Ordinal report: `customers/ordinal/archive/report-v1.md`.

**Acceptance:** every HITL-derived fact above appears as a structured record in the YAML file with clear field semantics; the v2 audit pass (Phase 5) reads this file at Pass 1 start, does not re-issue the HITL checklist for any item already covered, and emits a Pass 2 that fully consumes the preserved evidence; v1 audit and report archived to `customers/ordinal/archive/`.

### Phase 5: Re-run Ordinal under v2

Goal: produce `customers/ordinal/audit.yaml` reflecting all v2 rules with HITL preservation from Phase 4 pre-loaded.

Expected differences from the v1 Ordinal audit (these are intentional, not bugs):

- Cat 3 Processing & handler guidance: score stays 0 but the evidence is now anchored to the new criterion (timeout, ingest-verify-queue, architectures)
- Cat 12 criteria reflect the restructure (API access for agents 2; CLI or MCP for the webhook surface 0); Cat 12 overall percentage may shift slightly depending on the new criterion count math
- Audience designation: mixed, with structured signals
- Signing scheme finding evidence: anchored to the captured delivery payload (Standard Webhooks mode, specific headers, signature value)
- Per-event unique ID finding: webhook-id named directly, not conditionally

Anything else that changes is either a v2 rule landing correctly or a regression to investigate. Do not silently accept score changes; each delta from v1 should be traceable to a specific v2 rule.

**Acceptance:** v2 Ordinal audit YAML produces no surprises (every delta from v1 is explainable by a documented v2 rule); validates against the schema; HITL Pass 2 is empty or near-empty because Phase 4 preloaded the evidence.

### Phase 6: Cascade to the downstream skill

Goal: update the `outpost-customer-audit-report` skill in `hookdeck/hookdeck-skills-internal` to consume YAML audit input, then regenerate the Ordinal customer report.

Specific downstream updates:

- SKILL.md: input is a YAML audit file conforming to the upstream schema, not a Markdown audit
- methodology.md: every reference to audit prose sections (the "Summary paragraph", the "scorecard table") gets translated to YAML field names; the agent reads structured input instead of slicing Markdown
- references (`outpost-capabilities.md`, `hookdeck-products.md`): unchanged (these are knowledge bases that the agent consults, not audit data)
- template (`assets/report-template.md`): the customer-facing report stays Markdown (this is the customer deliverable, not data the website renders); the template structure does not change unless v2 rule changes require it
- Cat 12 criteria references throughout: align to the new structure
- Cat 3 Processing & handler guidance references: align to the new criterion language and the reliable-ingestion rule (this already lives in our skill's methodology from v1's last session)

Then regenerate `customers/ordinal/report.md` from the v2 Ordinal audit YAML. The customer report stays Markdown; the audit becomes YAML.

**Acceptance:** the downstream skill consumes the v2 Ordinal audit YAML cleanly; the regenerated customer report differs from the v1 report only in ways traceable to v2 rule changes; nothing material was lost in the migration; HITL evidence preserved end to end shows up in the report wherever it was load-bearing in v1.

## Schema sketch (illustrative, not authoritative)

Shape for a fresh agent to start from in Phase 0. Treat as a starting point; refine through Phase 0 validation and revisit as the schema doc lands.

```yaml
audit:
  platform: Ordinal
  prepared: 2026-06-04
  access:
    level: L2
    notes: active usage with two webhooks fired and delivered
  audience:
    designation: mixed   # developer-platform | no-code-saas | mixed
    signals:
      - tier: primary
        segment: marketing teams and content operators
        evidence_quote: "Build a content engine that drives revenue"
        source_section: hero copy on https://www.tryordinal.com/
      - tier: secondary
        segment: agencies
        evidence_quote: "Ordinal for Agencies"
        source_section: main nav
      - tier: tertiary
        segment: developers
        evidence_quote: "MCP and API support"
        source_section: mid-page Plan Content section
  reviewer:
    skill: webhook-dx-audit
    skill_version: "0.2.0"
    human_reviewers:
      - name: Phil Leggetter
        passes: [pass-2]
  passes:
    pass_1:
      mode: unattended
      completed: 2026-06-02
    pass_2:
      mode: hitl
      completed: 2026-06-02
      closed_criteria: [in-product-discoverability, dashboard-config, delivery-logs, ...]

  grade:
    overall_pct: 30
    band: D
    coverage:
      criteria_total: 48
      scored: 47
      not_applicable: 1
      not_assessed: 0

  summary: |
    Your webhook surface ships the configuration shell of a webhook system:
    full CRUD via the dashboard and the REST API, an event catalog with 21
    typed events under a consistent envelope, and per-event payload pages.
    The production-readiness layer is almost entirely missing from the
    public surface...

  scorecard:
    - id: implementation-guidance
      name: Implementation guidance
      score_pct: 0
      weight: 9
      note: >
        No verification walkthrough (signing undocumented); no handler
        guidance (no timeout window, no ingest-verify-queue pattern, no
        architecture references); no idempotency guidance; no
        best-practices coverage.
    # ... per-category entries

  findings:
    - category_id: implementation-guidance
      intro: |
        Your webhook docs cover the catalog and per-event payloads well
        (see Event catalog & schema). They say nothing about verification,
        the handler lifecycle, idempotency, or best practices...
      criteria:
        - id: idempotency-guidance
          name: Idempotency guidance
          score: 0
          status: not_supported
          evidence: |
            Your webhook docs don't identify a deduplication ID (the
            unique value an integrator stores to recognize repeat
            deliveries, often called a "dedupe ID") or explain the
            idempotent handler pattern...
          cross_refs:
            recommendations: [2]
            categories: []
        # ... per-criterion entries
      recommendations_addressing: [1, 2, 11]

  recommendations:
    - number: 1
      added_by_report: false
      title: Document the existing webhook signature for integrators
      body: |
        This is the single highest-impact gap. Without documented signature
        verification, integrators have no way to verify that an inbound
        POST is genuine...
      categories: [security-authentication, implementation-guidance, sdks-verification-libraries]
      further_reading:
        - title: Hookdeck on SHA256 webhook signature verification
          url: https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification

  access_limits: []   # structured records when something could not be assessed

  sources:
    - url: https://www.tryordinal.com/
      label: Homepage and product framing
      section: original_review
```

Companion file shape for HITL preservation (`customers/<name>/hitl-evidence.yaml`):

```yaml
hitl_evidence:
  platform: Ordinal
  collected_during: pass-2
  collected_on: 2026-06-02

  active_usage:
    access_level: L2
    webhooks_fired: 2
    external_destination_reached: true
    in_product_delivery_view: false
    in_product_test_trigger: false
    dashboard_crud_verified: true
    nav_path_to_webhook_config: "Integrations then Webhooks"
    sign_in_flow: "Google SSO"

  delivery_payload_capture:
    signing_mode: standard_webhooks
    headers:
      content-type: application/json
      user-agent: "Outpost/1.0.4"
      webhook-id: "post-content-edited:504dea9d-..."
      webhook-signature: "v1,0jZ7xcLn1bzurihFk/IncgwZTTGrV1eA8+lHDKgOSPo="
      webhook-timestamp: "1780423503"
      webhook-topic: "post.content.edited"
      x-api-key: "password-flarby"   # custom header set via `headers` field on webhook creation
      x-hookdeck-original-ip: "152.55.180.108"
    custom_headers_feature_in_use: true

  audience_verification:
    homepage_url: https://www.tryordinal.com/
    designation: mixed
    signals:
      # same shape as the main audit's audience.signals

  scoring_decisions:
    - category: local-dev-and-local-to-prod
      criterion: workflow-scenario-simulation
      score: 0   # not N/A under mixed audience
      reason: webhook integrators are developers, so the criterion applies
    - category: local-dev-and-local-to-prod
      criterion: local-to-production-transition
      score: 0
      reason: same as above
```

The shape is illustrative. Field names, nesting, and structure get finalized in Phase 0 against the schema linter.

## Open questions for review (decide before execution)

1. **Schema tooling.** JSON Schema authored in YAML is the lightest touch; alternatives are TypeBox, Zod, or a custom validator. Whatever lands needs to run in CI and locally. **Recommendation:** JSON Schema in YAML (Draft 2020-12) plus `ajv` (Node) or `jsonschema` (Python) for CI. Avoid TS-only validators since the cloud agent runtime may not be TS.
2. **Multi-line Markdown inside YAML.** The `|` block scalar handles it but lints can be fussy about indentation. Pin a YAML library and a lint config early. **Recommendation:** `js-yaml` or PyYAML; lint with `yamllint` defaults plus a project-specific rule allowing the `|` block scalar at arbitrary indentation depths.
3. **Cloud agent integration.** Out of scope for v2 the plan, but the schema should anticipate the cloud agent's input and output shapes (an `audit_id`, a `submitted_url`, a `submitted_at` timestamp) without forcing them into v2 today. **Recommendation:** reserve `audit_id`, `submitted_url`, `submitted_at`, `submitter_id` as optional top-level fields in the schema now; the cloud agent populates them later. Marking them optional means standalone runs do not need to fill them.
4. **Re-audit timing.** Does Phase 5 require fully fresh evidence collection (rerun the public-surface crawls), or can it consume the v1 audit's source URL list as a starting point? **Recommendation:** take the existing sources as inputs (they were correct in v1); add or update only sources that v2 rule changes touch.
5. **Archive location.** The plan archives v1 Ordinal artifacts to `customers/ordinal/archive/`. Confirm this is the right shape; alternative is a `_v1` suffix on the original filenames in the same directory. **Recommendation:** `customers/ordinal/archive/audit-v1.md` and `customers/ordinal/archive/report-v1.md`. The subdirectory keeps the customer's current directory clean (just the v2 YAML audit and Markdown report) and signals to anyone browsing that the v1 artifacts are historical.

## Resolved decisions

1. **Upstream audit output format.** YAML only. No Markdown audit, no renderer, no dual-output mode.
2. **Customer report format.** Markdown stays. The cloud agent does not render customer reports; the customer report is the customer-facing artifact, sent or shared as a file. The downstream `outpost-customer-audit-report` skill continues to emit Markdown.
3. **Downstream cascade timing.** Lockstep with upstream v2 cutover. No transitional renderer or backwards-compatibility shim.

## After v2

- Tag the v2 commit on `webhook-skills`
- Start the cloud-agent workstream (separate plan)
- Drop a second customer audit through v2 to test reusability (the second customer is the v2 validation gate that the Ordinal case alone cannot provide)
- Revisit our downstream skill's methodology with a fresh read against v2 outputs
- Consider a standalone CLI viewer (Markdown renderer + scorecard summary) for humans who want a single-file view of a YAML audit

## Conventions

- Markdown source for this plan; developer-to-developer voice; no em-dashes
- Each phase has a goal, an artifact, and acceptance criteria
- Phases are sequential
- Schema-first: no audit content migration before Phase 0 lands
- HITL preservation cross-checked at every phase boundary
- Commit per phase, atomic; conventional commit prefixes
