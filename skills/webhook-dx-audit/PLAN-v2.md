# Webhook DX Audit v2 plan

Roadmap for the second pass of the `webhook-dx-audit` skill. Read this before executing any of the phases. Each phase produces a discrete artifact with acceptance criteria.

## What we're building

v2 changes the audit's primary output format from Markdown to structured YAML (with a Markdown renderer view), codifies the accumulated rubric and methodology learnings from v1's HITL pilots, and prepares the skill to run as a cloud agent behind a public website that accepts URL submissions and renders the audit output as a structured page.

The Markdown audit form stays available as a generated view from the YAML, so humans who want a single-file artifact can still read one. YAML is the source of truth; Markdown is one of its renderers.

## Why this exists

Three drivers, in priority order:

1. **Cloud agent + public website.** The skill is moving to a cloud agent that accepts submitted URLs and renders the resulting audit on a website. Rendering structured output to a webpage is straightforward when the input is structured data; parsing a Markdown narrative into web components is error-prone. YAML lets the renderer consume the audit cleanly and lets the cloud agent emit a deterministic, validatable payload.
2. **Aggregation and trend detection.** Cross-customer pattern detection (the "5 of 7 audited platforms don't document the dedup header" use case) becomes a query rather than a manual scan when audits are structured.
3. **Diff and regression tracking.** Comparing two audits of the same platform across time, or two adjacent runs during HITL Pass 2, is meaningful when the underlying data is structured; Markdown diffs are noisy.

A secondary driver: v1 surfaced a steady stream of rubric and methodology tightenings during the Ordinal pilot that are in the repo as incremental commits. v2 is a natural moment to consolidate and validate them against a real audit end to end.

## Out of scope for v2

- Building the cloud agent infrastructure itself (separate workstream once the schema lands)
- Building the website (same)
- Multi-platform audit comparison features (the data shape supports it; the comparison tooling is a v3 deliverable)
- Customer-facing report rendering on the website (downstream skill territory, depends on v2 landing first)
- A second seeded audit alongside Ordinal (do this only if v2 surfaces ambiguity the Ordinal case alone cannot resolve)

## Constraints

### HITL preservation is mandatory

The Ordinal audit's HITL Pass 2 produced evidence the audit could not have reached unassisted. That evidence must be carried forward into the v2 audit format and not re-asked of the human. The full list of HITL-derived facts to preserve appears below in the dedicated section; cross-check that list against every phase artifact before declaring it done.

### Schema-first

Phase 0 produces the YAML schema before any audit content is migrated. Phases that change the rubric or methodology should round-trip through schema validation; rubric changes that the schema cannot represent are a schema gap, not a license to fork the audit format.

### Backwards-compatibility for the downstream skill

The downstream `outpost-customer-audit-report` skill (in `hookdeck/hookdeck-skills-internal`) consumes the audit as input. v2's YAML migration is a breaking change for that skill. Either: ship the downstream change in lockstep, or generate a Markdown view from the YAML during the transition so the downstream skill keeps working unchanged. Pick one before starting Phase 5.

## Target layout for v2

```
skills/webhook-dx-audit/
├── SKILL.md                                     # Phase 7 (final pass)
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
├── renderers/
│   └── yaml-to-markdown.md                      # Phase 2 (template + script note)
└── assets/
    ├── report-template.yaml                     # Phase 2 (replaces report-template.md as source of truth)
    └── report-template.md                       # Phase 2 (rendered view; kept until Phase 5 decision)
```

## Phases

### Phase 0: Schema design and validation tooling

Goal: produce `schema/audit.schema.yaml` (JSON Schema in YAML form) plus an example audit (`schema/audit.schema.example.yaml`) and a brief README.

Schema must cover:

- Header: platform name, prepared date, access level (L0 / L1 / L2), audience (designation + structured signals with tier, segment, evidence_quote, source_section), reviewer
- Pass narrative: which passes ran, what each closed
- Summary: grade (overall integer, band A through F), prose summary (multi-line string)
- Scorecard: per-category percentage, weight, notes; per-criterion score (0/1/2/N/A), evidence (multi-line string), source references (URLs or in-product captures), status (Not Supported / Not Applicable / Not Assessed with reasons), cross-references to recommendations
- Findings: category id, intro (multi-line), criteria entries, aggregation line (list of recommendation ids)
- Recommendations: id, title, body (multi-line; Markdown content fine), categories addressed (list of category ids), added_by_report flag (for new recs the refinement step adds), further_reading (list of links)
- HITL evidence captures: structured records of what HITL provided (delivery payload headers as a map, body as a string, in-product observations as evidence strings, signing mode declarations)
- Access limits: structured notes about what could not be assessed and why
- Sources: list of { url, label, section } records

Style: block YAML for all objects; flow style only for scalar arrays (tags, simple lists). Field names in snake_case. Markdown content in multi-line `|` blocks renders correctly when the consumer interprets the string as Markdown.

Validation tooling: a `npm`/`uvx`/`pipx` invocation that lints an audit against the schema. The actual choice of tool is a Phase 0 decision; whatever lands needs to run in CI and locally.

**Acceptance:** schema covers every field present in the current Ordinal audit Markdown without loss; example audit validates against the schema; lint command runs and reports errors with usable messages.

### Phase 1: Consolidate v1 rubric and methodology learnings

Goal: walk every reference file (`rubric.md`, `methodology.md`, `scoring.md`, `program-mapping.md`) and confirm that each accumulated v1 commit lands consistently.

Specific items to verify (each was a separate v1 commit but should now read as a coherent whole):

- Cat 3 rename from "Documentation quality" to "Implementation guidance" plus the tightened Processing & handler guidance criterion (ingest-verify-queue, timeout window, reference architectures)
- Cat 12 restructure: API access for agents (foundational) + CLI or MCP for the webhook surface (combined, requires webhook scope)
- Cat 2, 5, 7, 11 intro line cleanups
- Audience verification with cited signals (required from Pass 1 if homepage reachable)
- HITL payload capture requirement (full delivery headers + body)
- Summary list scoping rule (only items contributing to the webhook surface)
- Editorial qualifier rules (no company-stage commentary, no unanchored qualifiers)
- Cat 5 scoring example correction (6 criteria, not 5)
- HITL acronym expansion on first use
- Methodology steps 3 and 5 broadened to webhook AND event destinations
- Program-mapping new row for reliable-ingestion architectures

For each, read the current file and confirm the rule reads cleanly in isolation (a fresh reader gets the right framing without prior context). Tighten any sentence that depends on a chain of previous commits to make sense.

**Acceptance:** every reference file reads as a unified document; no commit-history dependencies in the prose; each rule has a clear anchor (the rubric criterion text, the methodology step, the program-mapping row) and downstream files do not contradict each other.

### Phase 2: Migrate the audit template to YAML

Goal: produce `assets/report-template.yaml` as the new source of truth; keep `assets/report-template.md` as a generated view for the duration of the migration window.

The template is no longer prose with bracketed placeholders; it is the YAML structure auditors fill in (with required vs optional fields visible via the schema).

Also produce `renderers/yaml-to-markdown.md`: a documented procedure (and ideally a small script) that takes an audit YAML file and emits the Markdown view. The Markdown output should be readable as a single-file artifact, equivalent in information content to v1 audits.

**Acceptance:** an audit YAML conforming to the schema can be rendered to Markdown via the renderer; the rendered Markdown is humanly readable end to end; round-tripping a v1 Markdown audit to YAML and back to Markdown loses no semantic information.

### Phase 3: Update SKILL.md and methodology references to the new flow

Goal: update the orchestration prose so the audit agent emits YAML as primary output, and HITL workflows reference structured fields.

Changes:
- SKILL.md "How an audit runs" section: the output of Pass 2 is YAML; Markdown is generated for human review only
- SKILL.md "Roles: who does what": HITL captures fill structured fields (delivery payload as a structured object, in-product observations as evidence strings keyed by criterion id); no free-form Pass 2 narrative paragraphs (those become structured records)
- methodology.md: references to "the Summary paragraph" become "the summary field"; references to "the scorecard table" become "the scorecard array"; etc.
- The methodology's tactics search-term list stays prose

**Acceptance:** SKILL.md and methodology read coherently against the new YAML primary; no references to "fill in the Markdown template" remain.

### Phase 4: Preserve and port Ordinal HITL evidence

Goal: capture every fact the Ordinal audit's HITL Pass 2 surfaced into a structured `customers/ordinal/hitl-evidence.yaml` file that the new audit pass can read at Pass 1 start (so Pass 2 does not re-ask).

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
- Signature value example for reference: `v1,0jZ7xcLn1bzurihFk/IncgwZTTGrV1eA8+lHDKgOSPo=` from the captured delivery
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
- llms.txt confirmed: `https://docs.tryordinal.com/llms.txt`, points to `.md`, scoped by section
- `.md` doc URLs return `Content-Type: text/markdown; charset=utf-8` (verified via HEAD)
- MCP coverage scope confirmed: posts, ideas, approvals, comments, analytics, media, auto-engagements, Slack boosts (no webhook management)
- Hosted MCP install flow: OAuth-based

**Format:** `customers/ordinal/hitl-evidence.yaml` should structure these as records the audit agent reads at start. The agent then skips the corresponding HITL asks.

**Acceptance:** every HITL-derived fact above appears as a structured record in the YAML file with clear field semantics; the v2 audit pass reads this file at Pass 1 start, does not re-issue the HITL checklist for any item already covered, and emits a Pass 2 that fully consumes the preserved evidence.

### Phase 5: Decide on downstream skill backwards-compatibility

Goal: choose one of two paths and document it.

Option A (lockstep): ship the downstream `outpost-customer-audit-report` skill's YAML-input migration as part of v2 execution. Pro: clean cut, no transitional renderer needed. Con: more concurrent work; bigger blast radius.

Option B (renderer bridge): keep generating a Markdown view of the YAML audit so the downstream skill continues to read Markdown; convert the downstream skill in a follow-up pass. Pro: lower risk; allows v2 to land standalone. Con: maintains two output paths.

Recommendation: B for the migration window, A as the end state. Pick before Phase 6.

### Phase 6: Re-run Ordinal under v2

Goal: produce a new Ordinal audit (`customers/ordinal/audit.yaml`) and (if Option B in Phase 5) the rendered Markdown view (`customers/ordinal/audit.md`), reflecting all v2 rules with HITL preservation from Phase 4 pre-loaded.

Expected differences from the v1 Ordinal audit (these are intentional, not bugs):

- Cat 3 Processing & handler guidance: score stays 0 but the evidence is now anchored to the new criterion (timeout, ingest-verify-queue, architectures)
- Cat 12 criteria reflect the restructure (API access for agents 2; CLI or MCP for the webhook surface 0); Cat 12 overall percentage may shift slightly depending on the new criterion count math
- Audience designation: mixed, with structured signals
- Signing scheme finding evidence: anchored to the captured delivery payload (Standard Webhooks mode, specific headers, signature value)
- Per-event unique ID finding: webhook-id named directly, not conditionally

Anything else that changes is either a v2 rule landing correctly or a regression to investigate. Do not silently accept score changes; each delta from v1 should be traceable to a specific v2 rule.

**Acceptance:** v2 Ordinal audit produces no surprises (every delta from v1 is explainable by a documented v2 rule); validates against the schema; renders to readable Markdown; HITL Pass 2 is empty or near-empty because Phase 4 preloaded the evidence.

### Phase 7: Update the downstream skill (deferred or concurrent per Phase 5 decision)

Goal: cascade the v2 changes into the `outpost-customer-audit-report` skill in the `hookdeck-skills-internal` repo and regenerate the Ordinal customer report from the new audit.

Specific downstream updates:

- methodology references to audit fields: align to YAML field names instead of Markdown section names
- references (`outpost-capabilities.md`, `hookdeck-products.md`): unchanged (these are knowledge bases, not audit data)
- template (`report-template.md` in the downstream skill): the customer-facing report stays Markdown (this is a deliverable, not data); the template structure does not change
- Cat 12 criteria references: align to new structure
- Cat 3 Processing & handler guidance references: align to new criterion language and the reliable-ingestion rule (this already lives in our skill's methodology from v1's last session)

**Acceptance:** the downstream skill consumes the v2 Ordinal audit YAML cleanly; the regenerated customer report differs from the v1 report only in ways traceable to v2 rule changes; nothing material was lost in the migration.

## Open questions for review (decide before execution)

1. **Schema tooling.** JSON Schema authored in YAML is the lightest touch; alternatives are TypeBox, Zod, or a custom validator. Schema-first design needs whatever picks up in CI.
2. **Multi-line Markdown inside YAML.** The `|` block scalar handles it but lints can be fussy about indentation. Pin a YAML library and lint config early.
3. **Renderer implementation.** A small TypeScript or Python script is enough; or a Jinja-style template. Avoid anything heavier than that.
4. **Backwards-compatibility window.** Phase 5 option B vs A. Recommendation: B for the migration, A as the end state; confirm.
5. **Cloud agent integration.** Out of scope for v2 the plan, but the schema should anticipate the cloud agent's input/output shapes (an `audit_id`, a `submitted_url`, a `submitted_at` timestamp) without forcing them into v2 today. Decide whether to reserve those fields in the schema now.
6. **Re-audit timing.** Does Phase 6 require fully fresh evidence collection (rerun the public-surface crawls), or can it consume the existing audit's source URL list as a starting point? Recommendation: take the existing sources as inputs (they were correct in v1); add or update only sources that v2 rule changes touch.

## After v2

- Tag the v2 commit on `webhook-skills`
- Start the cloud-agent workstream (separate plan)
- Schedule the customer audit revisit (Ordinal first; the v2 Ordinal audit is the canonical example)
- Drop a second customer audit through v2 to test reusability (the second customer is the v2 validation gate that the Ordinal case alone cannot provide)
- Revisit our downstream skill's methodology with a fresh read against v2 outputs

## Conventions

- Markdown source for this plan; developer-to-developer voice; no em-dashes
- Each phase has a goal, an artifact, and acceptance criteria
- Phases are sequential with one optional concurrency point (Phase 5 / Phase 7 timing)
- Schema-first: no audit content migration before Phase 0 lands
- HITL preservation cross-checked at every phase boundary
- Commit per phase, atomic; conventional commit prefixes
