# Scoring & Grading

Turn per-criterion 0/1/2 scores into category scores, an overall percentage, and a grade band.

## Category weights

Weights sum to 100. They are heavier where developers lose the most time and trust (schema, security, delivery), and lighter on the lightweight onboarding categories, matching the program's emphasis on the outbound-event surface.

| # | Category | Weight |
|---|----------|--------|
| 1 | Discovery & signup | 4 |
| 2 | Onboarding & first event | 6 |
| 3 | Documentation quality | 9 |
| 4 | Event catalog & schema | 13 |
| 5 | Security & authentication | 15 |
| 6 | Delivery semantics & reliability | 15 |
| 7 | Setup surfaces (UI / API / CLI / IaC) | 9 |
| 8 | SDKs & verification libraries | 8 |
| 9 | Consumer self-serve & subscription management | 6 |
| 10 | Consumer-facing observability | 6 |
| 11 | Local dev, testing & local-to-production transition | 5 |
| 12 | Agent / AI readiness | 4 |
| | **Total** | **100** |

## Computing a category score

For each category, using only criteria you actually scored (exclude Not assessed):

```
category_pct = (sum of criterion scores) / (2 * number of scored criteria) * 100
```

Example: Security has 5 criteria; you score 2, 1, 1, 0, 2 (all assessed). Sum = 6, max = 10, so 60%.

If every criterion in a category is Not assessed, drop the whole category and renormalize: divide each remaining category's weight by the sum of remaining weights so they total 100 again. Note any dropped category in the report's Access limits.

## Computing the overall score

```
overall_pct = sum(category_pct * weight) / sum(weights used)
```

Round to a whole number. Report it with the grade band.

## Grade bands

| Overall | Grade | Reading |
|---------|-------|---------|
| 85-100 | A | Production-grade. A developer can integrate confidently with little friction. |
| 70-84 | B | Strong. Solid foundation, a few meaningful gaps. |
| 50-69 | C | Adequate. Workable, but notable gaps cost integrators time or trust. |
| 30-49 | D | Weak. Significant gaps; integration is painful or risky. |
| 0-29 | F | Poor. Core webhook DX is missing or undocumented. |

The band is a headline, not the point. The recommendations are what the customer acts on. Two platforms can share a band with very different gap profiles, so always pair the grade with the category scorecard and the prioritized list.

## Prioritizing recommendations

Rank recommendations by **impact x ease**, not by category order:

- **Impact:** how much it removes friction or risk for the integrating developer. A missing or weak signing scheme, no consumer-facing delivery logs, or no retry documentation are high impact.
- **Ease:** how cheaply the platform (or Hookdeck, via a matching offering) can close it. Publishing egress IPs or an `llms.txt` is cheap; shipping a Terraform provider is not.

Lead the recommendation list with high-impact, low-effort items. For each, link the matching Hookdeck offering from `program-mapping.md` where one fits, framed as an option.
