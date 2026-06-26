# Stage 2.5 Integrity Verification Report

Manuscript: `Aidaily_ca_tti_manuscript_draft.md`

Date: 2026-06-26

Pipeline stage: Stage 2.5, pre-review integrity gate

Verdict: PASS WITH CORRECTIONS APPLIED

## Scope

This audit checked reference existence, bibliographic metadata, citation presence, claim-reference fit, and synthetic-result consistency for the current CA-TTI draft.

The audit does not establish real-world construct validity for CA-TTI. It only verifies that the current draft's cited sources, local experiment figures, and stated limitations are consistent enough to proceed to peer-review simulation.

## Reference Audit

| Reference | Status | Notes |
| --- | --- | --- |
| Ball (2021) | VERIFIED / CORRECTED | The report exists. The official JRC page and final PDF identify DOI `10.2760/5137`; the draft previously used another EU DOI variant, `10.2760/451453`. Updated to `10.2760/5137`. |
| Cinkusz et al. (2025) | VERIFIED | DOI, title, journal, volume, issue, and article number verified via MDPI/Crossref metadata. |
| Cleland-Huang et al. (2014) | VERIFIED / CORRECTED | DOI and proceedings metadata verified. Author name corrected from `Mader` to `Mäder`; proceedings venue clarified as ACM proceedings. |
| Shneiderman (2020) | VERIFIED | DOI, title, journal, volume, issue, and pages verified. |
| Stray et al. (2017) | VERIFIED | Springer page and Crossref metadata verify title, authors, pages, and DOI. |
| Stray et al. (2020) | VERIFIED | IEEE/Crossref metadata verify title, authors, journal, volume, issue, pages, and DOI. |
| Stray et al. (2016) | VERIFIED / CORRECTED | SINTEF and Crossref metadata verify title, authors, journal, volume, pages, and DOI. Author names corrected to `Sjøberg` and `Dybå`. |
| Umar et al. (2025) | VERIFIED / CORRECTED | Frontiers and Crossref metadata verify title, authors, volume, article id, and DOI. First author shortened to APA-style `Umar, M. A.`. |

## Claim-Reference Fit

| Draft claim area | Status | Notes |
| --- | --- | --- |
| Daily stand-up meetings support awareness/coordination but depend on context and quality | SUPPORTED | Stray et al. (2016, 2017, 2020) support the contextual and mixed-value framing. |
| Traceability is valuable but often ad hoc or after the fact | SUPPORTED | Cleland-Huang et al. (2014) directly supports this framing. |
| AI/ML can support Agile project-management roles and requirements extraction | SUPPORTED AFTER TIGHTENING | The draft sentence was narrowed so Cinkusz et al. supports agent simulation/project-management roles and Umar et al. supports automated requirements extraction. |
| Human-centered AI requires human control, safety, and trust | SUPPORTED | Shneiderman (2020) supports the human-control and reliable/safe/trustworthy framing. |
| Monitoring systems can create workplace surveillance risk | SUPPORTED | Ball (2021) supports psychosocial and policy risks of workplace surveillance/monitoring. |

## Data and Result Audit

Local source checked: `/Users/trovo/conductor/workspaces/1/san-diego/experiments/ca_tti/sample_output`

Files checked:

- `manifest.json`
- `summary.json`
- `result_summary.md`
- `observations.csv`
- `scored_observations.csv`

Verified values:

| Scenario | Failure trials | Raw warning trials | CA-TTI warning trials | Mean CA-TTI lead | Mean HAG |
| --- | ---: | ---: | ---: | ---: | ---: |
| artifact_drift | 8/8 | 0/8 | 8/8 | 3.0 | 0.21 |
| fluent_hallucination | 8/8 | 0/8 | 8/8 | 1.5 | 0.369 |
| clean_baseline | 0/8 | 0/8 | 0/8 | n/a | 0.065 |
| low_confidence_good_artifacts | 0/8 | 1/8 | 0/8 | n/a | 0.059 |
| noisy_interaction_stable_artifacts | 0/8 | 7/8 | 0/8 | n/a | 0.094 |

The draft table matches `summary.json` and `result_summary.md`. The sample output contains 400 observations plus one header row in each CSV.

## Corrections Applied

- Updated Material Passport verification status and version label.
- Replaced Ball DOI with the official JRC final-PDF DOI `10.2760/5137`.
- Corrected `Mader` to `Mäder`.
- Corrected `Sjoberg` and `Dyba` to `Sjøberg` and `Dybå` in the 2016 reference.
- Normalized the Umar first-author initials.
- Narrowed the AI/ML support claim so it matches the cited papers more closely.
- Added the 400-observation count to the synthetic result description.

## Residual Risks

- The manuscript remains a framework paper with synthetic stress testing, not a validated empirical study.
- HAG is conceptually broader than the current prototype implementation, which only captures a hallucination/evidence mismatch subtype.
- The literature base is still lean. Before journal submission, add more direct human-AI teaming, AI code agent, and team cognition literature.
- No full APA formatting pass has been performed yet.

## Gate Decision

The Stage 2.5 integrity gate is clear enough to proceed to Stage 3 peer-review simulation.
