# Webhook DX Review: [Platform name]

**Reviewed:** [date] · **Access:** [L0: public only / L1: account access / L2: active usage] · **Audience:** [developer-platform / no-code-saas / mixed] · **Reviewer:** [name]
**Context:** [standalone review / existing Outpost customer / specific commercial context — optional, omit if not relevant]

The Access level declares the deepest level reached during this audit (see `references/rubric.md` "Access level requirements"). How it was obtained (human signup, agent-driven signup, shared session) does not matter — only what evidence the audit could reach. The Audience declaration conditions which criteria apply via Table 2 of the N/A logic.

## Summary

[3 to 5 sentences. What the platform's webhook DX is like for an integrating developer, the headline grade, and the one or two things that matter most. Developer-to-developer, no marketing language.]

**Overall: [Public-scope NN]/100 ([A-F]) - [one-line reading]**
**Provisional minimum: [NN]/100 ([A-F])** - the floor if HITL is not run. HITL Pass 2 can only raise the score from here.

For Pass-1-only audits with HITL planned, lead with the Provisional minimum as the conservative bound. For standalone or automated audits with no HITL planned, lead with the Public-scope grade. Both numbers always appear in the scorecard; only the headline framing differs.

## Scorecard

| Category | Public-scope | Provisional min | Weight | Notes |
|---|---|---|---|---|
| Discovery & signup | [n]% | [n]% | 4 | [one line] |
| Onboarding & first event | [n]% | [n]% | 6 | |
| Documentation quality | [n]% | [n]% | 9 | |
| Event catalog & schema | [n]% | [n]% | 13 | |
| Security & authentication | [n]% | [n]% | 15 | |
| Delivery semantics & reliability | [n]% | [n]% | 15 | |
| Setup surfaces (UI/API/CLI/IaC) | [n]% | [n]% | 9 | |
| SDKs & verification libraries | [n]% | [n]% | 8 | |
| Consumer self-serve & subscriptions | [n]% | [n]% | 6 | |
| Consumer-facing observability | [n]% | [n]% | 6 | |
| Local dev & local-to-prod | [n]% | [n]% | 5 | |
| Agent / AI readiness | [n]% | [n]% | 4 | |
| **Overall** | **[NN]%** | **[NN]%** | **100** | **[grade]** |

**HITL headroom: [NN] points** ([Public-scope] - [Provisional minimum]). The number of points HITL Pass 2 could lift the Provisional minimum by, given current access. A small headroom means HITL won't materially change the grade; a large headroom means HITL is load-bearing.

*Both columns are weight-adjusted means of the category percentages, not simple averages of the rows. Public-scope drops both Not Applicable and Not Assessed criteria; Provisional minimum drops Not Applicable but treats Not Assessed as 0 in the numerator with full weight in the denominator. If a category is fully Not Applicable, drop it and renormalize remaining weights from `100 - dropped_weight` back to 100 in both columns. If a category is fully Not Assessed, drop it from Public-scope only. See `scoring.md` for worked examples.*

*Coverage: [X] of [Y] criteria scored publicly; [Z] Not Assessed (HITL would fill); [W] Not Applicable (logical exclusion).*

## Findings by category

For each category, a short paragraph of what you found, then the criterion scores with evidence. Keep evidence concrete: link the doc page, name the API field, or reference the screenshot. Always list every criterion. Use the right label per `rubric.md`:

- **0 / Not Supported** when the capability should exist but doesn't.
- **N/A** when a logical rule excludes the criterion (Cat 5 destination-native auth on a webhook-only platform; Cat 12 CLI-for-agents when no CLI exists).
- **Not Assessed** when access is gated and HITL would fill it (dashboard logs without an account, etc.).

### [N]. [Category name] - Public-scope [n]% / Provisional [n]%

[What an integrating developer experiences here, grounded in what you saw.]

- **[Criterion]:** [0/1/2 or N/A or Not Assessed] - [evidence with link or path]
- **[Criterion]:** [...]

[Repeat for all 12 categories. Drop a category fully only with a reason, and note it under Access limits.]

## Prioritized recommendations

Ranked by impact x ease, highest-leverage first. Each item: the gap, why it matters to integrators, and the concrete change. Where a Hookdeck offering fits, name it as an option (see program-mapping). No obligation framing. For existing Hookdeck customers, distinguish what the platform should change from what the customer's existing Hookdeck offering already provides or could surface.

1. **[Recommendation]** - [gap and why it matters].
   - *Concrete change (platform side):* [what the platform should do].
   - *Hookdeck offering:* [matching offering from program-mapping.md, framed as already available or already in path for existing customers].
2. **[Recommendation]** - [...]
3. [...]

## Access limits

[What you could not assess and why: no test account, region-gated dashboard, account-only delivery logs, etc. This keeps the grade honest. Omit if none.]

## Sources

[List the key doc pages, spec URLs, SDK repos, and dashboards relied on, as links.]
