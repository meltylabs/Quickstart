# Stage 4.5 Final Integrity Verification Report

Manuscript: `Aidaily_ca_tti_manuscript_revised_stage4.md`

Date: 2026-06-26

Pipeline stage: Stage 4.5, final integrity gate

Verdict: PASS WITH CORRECTIONS APPLIED

## Scope

This final integrity pass verified:

- reference existence and bibliographic metadata for all 15 references;
- in-text citation coverage against the reference list;
- citation-context fit for the major claims in the manuscript;
- synthetic-result consistency against the local experiment outputs;
- internal consistency of the revised manuscript's contribution and limitations.

The pass does not establish field validity for CA-TTI. It verifies that the manuscript's factual scaffolding is accurate enough to proceed to finalization.

## Corrections Applied to Manuscript

| Item | Issue | Correction |
| --- | --- | --- |
| Berretta et al. (2023) | Reference listed an extra author, `Wrede, B.`, not present in Frontiers/Crossref metadata. | Removed `Wrede, B.` from the reference. |
| Cataldo et al. (2008) | Venue was incorrectly listed as the 2008 ACM CSCW conference. | Corrected venue to *Proceedings of the Second ACM-IEEE International Symposium on Empirical Software Engineering and Measurement*. |
| Schelble et al. (2022) | Reference omitted page range. | Added `1-29`. |
| Zhong et al. (2026) | Reference listed incorrect authors. | Corrected to `Zhong, S., Noei, S., Zou, Y., & Adams, B.` based on arXiv metadata. |
| Material Passport | Status still marked final integrity pending. | Updated to `STAGE 4.5 FINAL INTEGRITY PASSED / CORRECTIONS APPLIED`. |

## Reference Verification

| Reference | Status | Verification source | Notes |
| --- | --- | --- | --- |
| Andrews et al. (2023) | VERIFIED | Crossref / DOI `10.1080/1463922X.2022.2061080` | Authors, title, journal, volume, issue, pages, and DOI match. |
| Ball (2021) | VERIFIED | DOI resolver / EU Publications Office DOI `10.2760/5137` | DOI resolves to EU Publications Office manifestation. |
| Berretta et al. (2023) | VERIFIED / CORRECTED | Frontiers / Crossref DOI `10.3389/frai.2023.1250725` | Correct author list has six authors; corrected manuscript. |
| Cataldo et al. (2008) | VERIFIED / CORRECTED | Crossref DOI `10.1145/1414004.1414008` | Venue corrected to ESEM 2008. |
| Cinkusz et al. (2025) | VERIFIED | MDPI / Crossref DOI `10.3390/electronics14010087` | Official MDPI page lists *Electronics* 2025, 14(1), 87, published 28 Dec 2024. Kept journal-year citation as 2025. |
| Cleland-Huang et al. (2014) | VERIFIED | Crossref DOI `10.1145/2593882.2593891` | Authors, title, proceedings, pages, and DOI match. |
| Kononenko et al. (2016) | VERIFIED | Crossref DOI `10.1145/2884781.2884840` | Authors, title, ICSE proceedings, pages, and DOI match. |
| Peng et al. (2023) | VERIFIED | arXiv `2302.06590` | Preprint status retained; authors and title match. |
| Schelble et al. (2022) | VERIFIED / CORRECTED | Crossref DOI `10.1145/3492832` | Added pages `1-29`; article identity verified. |
| Shneiderman (2020) | VERIFIED | Crossref DOI `10.1080/10447318.2020.1741118` | Metadata matches. |
| Stray et al. (2017) | VERIFIED | Crossref DOI `10.1007/978-3-319-57633-6_20` | Book chapter existence, authors, title, and pages verified. |
| Stray et al. (2020) | VERIFIED | Crossref DOI `10.1109/MS.2018.2875988` | Metadata matches IEEE/Crossref record. |
| Stray et al. (2016) | VERIFIED | Crossref DOI `10.1016/j.jss.2016.01.004` | Metadata matches; diacritics retained for `Sjøberg` and `Dybå`. |
| Umar et al. (2025) | VERIFIED | Crossref DOI `10.3389/fcomp.2025.1537100` | Authors, title, journal, volume, article id, and DOI match. |
| Zhong et al. (2026) | VERIFIED / CORRECTED | arXiv `2603.15911` | Author list corrected. Preprint status retained. |

## Ghost Citation Check

Result: PASS.

- No dangling in-text citations were found.
- No orphan references remain after manual review of multi-citation groups.
- Multi-citation groups verified:
  - `Peng et al., 2023; Zhong et al., 2026`
  - `Stray et al., 2016, 2017, 2020`
  - `Cinkusz et al., 2025; Umar et al., 2025`

## Claim-Reference Fit

| Manuscript claim | Cited source(s) | Verdict | Notes |
| --- | --- | --- | --- |
| AI pair-programming and agentic code-review work show AI entering software workflows, with review/adoption differences from human work. | Peng et al. (2023); Zhong et al. (2026) | SUPPORTED WITH PREPRINT CAVEAT | Both are arXiv preprints; manuscript uses them as emerging evidence rather than settled consensus. |
| Daily stand-ups support awareness/coordination but depend on context and quality. | Stray et al. (2016, 2017, 2020) | SUPPORTED | Claim is appropriately bounded. |
| Traceability is valuable but can be ad hoc and incomplete. | Cleland-Huang et al. (2014) | SUPPORTED | Claim fits source. |
| Socio-technical congruence links coordination needs and coordination patterns. | Cataldo et al. (2008) | SUPPORTED | Claim fits source after venue correction. |
| Code review supports knowledge transfer, maintainability, and shared standards beyond defect detection. | Kononenko et al. (2016) | SUPPORTED | Claim is aligned with code-review quality framing. |
| Human-AI teaming involves shared goals, roles, communication, trust, and team cognition. | Berretta et al. (2023); Andrews et al. (2023); Schelble et al. (2022) | SUPPORTED | The manuscript does not overstate these sources. |
| AI/ML systems can extract structured requirements information and simulate/support Agile project-management roles. | Cinkusz et al. (2025); Umar et al. (2025) | SUPPORTED | Claim remains correctly split across the two sources. |
| Human-centered AI requires preservation of control, safety, and trust. | Shneiderman (2020) | SUPPORTED | Claim fits source. |
| Workplace monitoring can create governance and surveillance risks. | Ball (2021) | SUPPORTED | Claim fits source. |

## Data Verification

Local data source checked:

`/Users/trovo/conductor/workspaces/1/san-diego/experiments/ca_tti/sample_output`

Files checked:

- `manifest.json`
- `summary.json`
- `result_summary.md`
- `observations.csv`
- `scored_observations.csv`

### Synthetic Results

Verified values match the manuscript:

| Scenario | Failure trials | Raw warning trials | CA-TTI warning trials | Mean CA-TTI lead |
| --- | ---: | ---: | ---: | ---: |
| artifact_drift | 8/8 | 0/8 | 8/8 | 3.0 |
| fluent_hallucination | 8/8 | 0/8 | 8/8 | 1.5 |
| clean_baseline | 0/8 | 0/8 | 0/8 | n/a |
| low_confidence_good_artifacts | 0/8 | 1/8 | 0/8 | n/a |
| noisy_interaction_stable_artifacts | 0/8 | 7/8 | 0/8 | n/a |

### Ablation Results

Verified values match the manuscript:

| Failure scenario | Full CA-TTI lead | No HAG lead | No trend lead | Artifact-only lead |
| --- | ---: | ---: | ---: | ---: |
| artifact_drift | 3.0 | 3.0 | -0.25 | 1.0 |
| fluent_hallucination | 1.5 | 1.5 | -0.88 | 0.25 |

## Internal Consistency

| Check | Verdict | Notes |
| --- | --- | --- |
| Contribution category consistency | PASS | Manuscript consistently frames CA-TTI as a conceptual framework with synthetic stress-test evidence. |
| Construct/proxy distinction | PASS | Full HAG and `hag_proxy` are separated. |
| Claims bounded to evidence | PASS | The manuscript repeatedly states that field validity is not established. |
| Governance interpretation | PASS | Warnings are framed as inquiry triggers, not sanctions. |
| Data/table consistency | PASS | Tables match local output files. |

## Residual Non-Blocking Notes

- Peng et al. (2023) and Zhong et al. (2026) are arXiv preprints. They are acceptable as emerging-context references, but a final journal submission should add peer-reviewed coding-agent literature when available.
- Cinkusz et al. is cited as 2025 because the official MDPI citation line is *Electronics* 2025, 14(1), 87, although the page publication date is 28 December 2024.
- Final formatting should normalize APA capitalization and proceedings style, but no remaining issue blocks finalization.

## Gate Decision

The Stage 4.5 final integrity gate passes after corrections. The manuscript can proceed to Stage 5 finalization.
