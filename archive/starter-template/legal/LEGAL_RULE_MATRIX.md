# Legal Metrology Rule Matrix

Source: `9 The Legal Metrology (Package Commodities) Rules, 2011.pdf`

Every legal rule is represented with source, applicability, evidence, validator and result policy. The application must never invent a legal requirement.

| ID | Source | Requirement | Automation |
|---|---|---|---|
| R3 | Rule 3 | Chapter II applicability: >25 kg/25 L boundary, cement/fertilizer exception, industrial/institutional exclusion | Deterministic |
| R4 | Rule 4 | Required declarations before packages leave; manufacturer-premises MRP context | Context |
| R5 | Rule 5 | Second Schedule standard pack quantities; historical non-standard-size proviso is marked withdrawn | Deterministic |
| R6.1a | Rule 6(1)(a) | Manufacturer/packer/importer name and address | OCR |
| R6.1b | Rule 6(1)(b) | Common/generic commodity name; multi-product details | OCR |
| R6.1c | Rule 6(1)(c) | Net quantity in standard units or number | OCR |
| R6.1d | Rule 6(1)(d) | Month/year made/pre-packed/imported, subject to exceptions | OCR + context |
| R6.1e | Rule 6(1)(e) | Retail sale price | OCR |
| R6.1f | Rule 6(1)(f) | Dimensions where relevant | OCR + category |
| R6.1g | Rule 6(1)(g) | Other matters specified elsewhere | Rule resolution |
| R6.2 | Rule 6(2) | Consumer complaint name/address/telephone/email if available | OCR |
| R6.3 | Rule 6(3) | Required-declaration sticker restriction; lower-MRP exception | CV + review |
| R6.4 | Rule 6(4) | Stickers permitted for other declarations | Context |
| R6.5 | Rule 6(5) | Multi-component package declaration arrangement | CV + context |
| R7 | Rule 7 | Principal display panel and minimum numeral/letter sizes | CV; calibration for mm |
| R8 | Rule 8 | Principal display panel + clear area around quantity | CV |
| R9 | Rule 9 | Legibility, prominence, contrast, liquid visibility, outer wrapper, language | CV/OCR |
| R10 | Rule 10 | Complete address, small-package identification, India packer/importer for foreign-made goods | OCR + context |
| R11 | Rule 11 | Net quantity excludes wrapper; environmental variation / when-packed | OCR + physical test |
| R12 | Rule 12 | Correct quantity basis; Fourth Schedule exceptions; dimensions/number; misleading quantity words | Deterministic |
| R13 | Rule 13 | Unit conventions, SI units, N/U, prohibited dozen/score/gross | Deterministic |
| R14 | Rule 14 | Textiles: number + finished dimensions; differing pieces + price | OCR + category |
| R15 | Rule 15 | Dimensions/weight linked to price must be declared | OCR + category |
| R16 | Rule 16 | Sheets: usable sheet count + dimensions | OCR + category |
| R17 | Rule 17 | Container commodities: number + dimensions/capacity references | OCR + category |
| R18.1 | Rule 18(1) | Dealer/importer sale/display/storage only if compliant | Context |
| R18.2 | Rule 18(2) | Sale price cannot exceed retail sale price | Transaction context |
| R18.3 | Rule 18(3) | Tax-revision price process | Manual/context |
| R18.4 | Rule 18(4) | Exception for packages not required to show month/year | Deterministic |
| R18.5 | Rule 18(5) | No obliteration/smudging/alteration of retail sale price | CV + review |
| R18.6 | Rule 18(6) | Wrapper price cannot be altered after printing/use | Provenance/review |
| R18.7 | Rule 18(7) | Certain retailers must maintain specified weighing equipment | Manual |
| R19 | Rule 19 | Official inspection, sampling, tests and reporting | Manual |
| R20 | Rule 20 | Actions after inspection non-compliance, seizure/evidence | Manual |
| R21 | Rule 21 | Dealer-premises quantity testing conditions and MPE verification | Manual |
| R22 | Rule 22 | MPE per First Schedule and variation causes | Physical |
| R23 | Rule 23 | Deceptive-package determination and enforcement | AI flag + manual final |
| R24 | Rule 24 | Wholesale package declarations | OCR |
| R25 | Rule 25 | Export package sold in India only after required repack/relabel | Context + OCR |
| R26 | Rule 26 | Specified exemptions | Deterministic |
| R27 | Rule 27 | Registration of manufacturers/packers/importers | Admin |
| R28 | Rule 28 | Registered shorter address | Registry |
| R29 | Rule 29 | Registration register | Registry |
| R30 | Rule 30 | State-wise registered lists | Registry |
| R31 | Rule 31 | Ads mentioning retail price must include net quantity/number; same font size | OCR/CV |
| R32 | Rule 32 | Penalties stated in source PDF | Information only |
| R33 | Rule 33 | Government power to relax provisions | Manual/admin |
| R34 | Rule 34 | Repeal and savings | Legal metadata |
| S1 | First Schedule | Maximum permissible errors | Physical |
| S2 | Second Schedule | Standard pack quantities | Deterministic |
| S3 | Third Schedule | When-packed commodities | Deterministic |
| S4 | Fourth Schedule | Quantity-unit exceptions | Deterministic |
| S5 | Fifth Schedule | Sampling method and sample size | Manual |
| S6 | Sixth Schedule | Physical net quantity/volume/length/count measurement procedures | Manual |
| S7 | Seventh Schedule | Inspection data-sheet forms | Report template |

## Result policy
- PASS: requirement verified from adequate evidence.
- FAIL: applicable requirement is contradicted or missing.
- REVIEW: evidence is ambiguous/insufficient or needs official/legal context.
- NOT_APPLICABLE: applicability engine says rule does not apply.
- MANUAL_REQUIRED: source rule requires physical/administrative/official action.

## Critical limitation
A normal photo cannot reliably establish physical millimetres for Rule 7. Without calibration/reference scale, return REVIEW. Actual quantity, MPE, sampling and enforcement must not be fabricated from images.
