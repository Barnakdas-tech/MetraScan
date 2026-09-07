# Legal Sources — MetraScan

This directory holds the machine-extracted legal source material and the rule matrix that the legal engine (Phase 4) will encode. No rule may be implemented in code without a corresponding source citation here.

## Source documents

| Document | Role | Status |
|---|---|---|
| The Legal Metrology (Package Commodities) Rules, 2011 (43 pp., text PDF) | Primary rule source | Verified structure; per-rule extraction in Phase 4 |
| The Legal Metrology Act, 2009 (19 pp., text PDF) | Parent statute | Reference |

## Verified source structure (Rules PDF)

- Notification: GSR 202(E), 7 March 2011; in force 1 April 2011
- Rules 1–2: title, commencement, definitions
- Rule 3: Chapter II applicability boundary (>25 kg/25 L excluded except cement/fertilizer bags ≤50 kg; industrial/institutional consumers excluded)
- Rules 4–17: Chapter II retail package provisions (incl. Rule 6 mandatory declarations, Rule 7 display panel + numeral heights)
- Rules 18–23: dealers, inspection, sampling, maximum permissible errors, deceptive packages
- Rule 24: wholesale package declarations (Chapter VI)
- Rules 25–34: export packages, exemptions, registration, penalty, repeal
- Schedules First–Seventh: MPE tables, standard pack sizes, commodity declaration modes, sampling, test methods, forms

## Versioning note (critical)

The base 2011 text contains inline amendment annotations, e.g.:

- "Provision will stand withdrawn wef 01.07.2012 vide GSR 748(E) dated 24.10.2011" (Rules 5 and 6 provisos)
- "Time extended vide GSR 734(E) dated 30.09.2011" (Rule 6(6))

Post-2011 amendment notifications must be sourced and encoded as dated RuleVersion rows before any rule is marked verified for the September 2026 application date. Until then, engine behavior is "per supplied source only".

## Directory plan

- `LEGAL_RULE_MATRIX.md` — the accountability matrix: SOURCE LAW / IMPLEMENTATION LOGIC / AI OBSERVATION / HUMAN REVIEW per ruleId (created Phase 4)
- `sources/` — extracted per-rule source text with page citations
- `applicability/` — prose specs of applicability predicates
- `validators/` — human-readable deterministic validator specs
- `schedules/` — schedule data (MPE tables, standard sizes, commodity modes) with provenance
