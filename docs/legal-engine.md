# Legal Applicability Engine (Phase 5)

## What it does — and does not do

The engine answers exactly one question: **which provisions must be checked for this inspection?** It never decides compliance, and it never invents requirements. Every decision carries a source-cited explanation.

## Location

`packages/legal-engine` — a pure TypeScript workspace package with zero runtime dependencies. It is imported by the API and by tests; it has no knowledge of Express, React, Prisma, or the AI service.

## Modules

| Module | Responsibility |
|---|---|
| `effectiveDateResolver` | Resolves the rule version in force at the inspection date; excludes future-effective and expired versions; resolves overlapping amendments to the newest effective one |
| `packageApplicability` | Rule 3 boundaries (>25 kg/L; industrial/institutional consumers) and Rule 24 wholesale scope |
| `productApplicability` | Rule 6 sub-clause deferrals: food (PFA 1954), cosmetics (D&C Rules 1945), Seeds Act, bidis/incense, PSU LPG, alcoholic beverages (State Excise) |
| `exemptionEngine` | Rule 26 wholesale exemptions: ≤10 g/ml, fast food (restaurant/hotel), DPCO 1995 formulations, agricultural produce >50 kg |

## Rule versioning

Rules carry `ruleId / version / effectiveFrom / effectiveTo / scope / conditions / exceptions / source / status`. Example: R6.1d version 2 (`effectiveFrom 2012-07-01`) reflects the withdrawal of the rubber-stamp proviso by GSR 748(E) — a 2026 inspection therefore resolves to the post-withdrawal version, never the 2011 base proviso.

## Output contract

```json
{
  "applicableRules": [{ "ruleId": "R6.1c", "status": "APPLICABLE", "reason": "...", "source": "Rules, 2011, Rule 6(1)(c), p.5" }],
  "nonApplicableRules": [...],
  "reviewRequiredRules": [...]
}
```

**UNKNOWN never means false.** Missing classification evidence (quantity, package type, consumer type) yields REVIEW with a reason, never a silent NOT_APPLICABLE.

## API

`GET /api/v1/inspections/:id/applicability` — runs the engine on the inspection's actual evidence (package type, product category, extracted net quantity).

## Compliance validators (Phase 6)

The compliance layer consumes extracted declarations + visual evidence + the applicability result and emits PASS / FAIL / REVIEW / NOT_APPLICABLE / MANUAL_REQUIRED per rule. It is deterministic code — no LLM decides any status.

### The "not detected is not proven absent" rule

When a declaration is missing, the engine first asks whether absence can even be established:
- OCR never ran or found nothing -> REVIEW ("not detected is not proven absent")
- Image quality insufficient -> REVIEW ("cannot reliably establish absence")
- OCR ran on sufficient-quality images and found nothing -> FAIL is appropriate (proven absent with stated confidence)

### Verdict aggregation

Any FAIL -> NON_COMPLIANT. Unresolved REVIEW or MANUAL_REQUIRED (with no FAIL) -> REVIEW_REQUIRED. Only when every applicable mandatory check PASSes -> COMPLIANT.

### API

POST /api/v1/inspections/:id/compliance — runs the engine, persists ValidationResults + Violations, and updates the inspection's overall result. GET /:id/compliance returns the stored results.

## Human review (Phase 7)

Every compliance result is clickable: the detail view shows WHAT was detected (requirement), WHERE (source image with
highlighted evidence boxes), WHICH rule, WHY the status was assigned, HOW confident, and the supporting evidence text.

Evidence boxes use non-color cues — icon (check/cross/question) + label + border style (solid/dashed/dotted) —
for POSITIVE / NEGATIVE / REVIEW evidence respectively.

POST /api/v1/inspections/:id/review supports ACCEPT, REJECT, EDIT_DECLARATION, CHANGE_RESULT, COMMENT, and
MARK_MANUAL. Every action is audited (user, timestamp, inspection, action, oldValue, newValue, comment) and stored
as a Review row. The AI status is NEVER overwritten — human decisions live in separate humanStatus/humanComment
fields beside it. GET /:id/review returns the full review + audit history.
