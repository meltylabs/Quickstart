# Stage 3' Verification Review Report: Aidaily Protocol Paper

## Decision

Minor Revision; proceed to Stage 4.5 Final Integrity after minor cleanup.

## Field and Reviewer Configuration

| Role | Configured Identity | Scope |
| --- | --- | --- |
| Field Analyst | Empirical software engineering / HCI protocol analyst | Confirm manuscript genre, revision target, and review checklist. |
| EIC Re-reviewer | Editor for a protocol paper in empirical software engineering and human-centered AI | Verify whether Stage 3 revision requirements were addressed. |
| Editorial Synthesizer | Academic-pipeline synthesis role | Convert verification findings into a pipeline decision. |

The manuscript is now best characterized as an empirical software engineering and human-centered AI field-study protocol, not a completed results paper.

## Revision Response Checklist

### Priority 1 — Required Revisions

| # | Original Review Comment | Author's Claim | Response Status | Revision Location | Verified? | Quality Assessment |
| --- | --- | --- | --- | --- | --- | --- |
| P1-1 | TTI is under-operationalized; add denominators, sampling windows, coder rules, reliability, adjudication, and examples. | Added TTI eligibility rules, component denominators, examples, stratified double coding, adjudication, and reliability progression criteria. | FULLY_ADDRESSED | Sections 3, 6.5, 9.1, 11, 13.1 | Yes | The revised TTI section now defines event eligibility, sprint windows, component denominators, coding examples, double coding, adjudication, and reliability thresholds. This resolves the reproducibility concern at protocol level. |
| P1-2 | Pilot and confirmatory aims are conflated. | Recast as Stage A feasibility pilot and optional Stage B field evaluation. | FULLY_ADDRESSED | Abstract, Sections 3, 4, 6.5, 13.1-13.2 | Yes | The Stage A/Stage B structure is clear and prevents overclaiming from a small pilot. |
| P1-3 | Intervention behavior is underspecified. | Added intervention reproducibility requirements, prompt taxonomy, confidence bands, escalation rules, writeback constraints, and participant response options. | FULLY_ADDRESSED | Sections 7.1-7.7, 11, 12.3 | Yes | The intervention is now sufficiently specified for a protocol paper. Exact model details remain future implementation fields, but the protocol requires them to be recorded before data collection. |
| P1-4 | AI extraction/linking accuracy is not evaluated. | Added manually coded technical gold sample and performance outcomes for extraction, linking, and conflict detection. | FULLY_ADDRESSED | Sections 2.2, 7.4, 9.2, 11, 13.1-13.2 | Yes | The added gold-sample procedure and technical metrics address the prior blind spot. |
| P1-5 | Ethical safety gates are missing. | Added stop/pause/review rules for psychological safety, workload, prompt burden, opt-out behavior, surveillance complaints, and sensitive-data incidents. | FULLY_ADDRESSED | Sections 3, 13.1, 15.1, 16 | Yes | The safety-gate section is concrete and correctly treats TTI gains as unacceptable if safety thresholds are breached. |
| P1-6 | Participant controls are vague. | Added pause, mark-sensitive, reject, edit, deletion request, appeal, and dashboard restrictions. | FULLY_ADDRESSED | Sections 7.7, 14, 15, 16 | Yes | The control model is now explicit enough for ethics review and implementation planning. |

### Priority 2 — Suggested Revisions

| # | Original Review Comment | Response Status | Notes |
| --- | --- | --- | --- |
| P2-7 | Sample-size section lacks actionable assumptions. | FULLY_ADDRESSED | Stage A progression criteria and Stage B power-analysis inputs are now specified. |
| P2-8 | Prompt burden threshold is undefined. | FULLY_ADDRESSED | The revised protocol sets raw NASA-TLX and median prompts-per-day thresholds. |
| P2-9 | Baseline workflow is underspecified. | FULLY_ADDRESSED | Baseline characterization now includes bots, summarizers, Jira automation, issue-linking practices, and dashboards. |
| P2-10 | Literature base is too narrow. | FULLY_ADDRESSED | Traceability, human-centered AI, automation misuse, and workplace monitoring sources were added. |
| P2-11 | Missing-data and partial-consent handling are incomplete. | FULLY_ADDRESSED | Section 13.3 adds rules for partial consent, missing logs, and sensitivity analysis. |

### Priority 3 — Nice to Fix

| # | Original Review Comment | Response Status |
| --- | --- | --- |
| P3-12 | Study artifacts are not listed as appendices. | PARTIALLY_ADDRESSED |
| P3-13 | Dissemination is generic. | PARTIALLY_ADDRESSED |
| P3-14 | Governance roles are unclear. | FULLY_ADDRESSED |

## New Issues Discovered During Re-review

| # | Type | Location | Description | Severity |
| --- | --- | --- | --- | --- |
| NEW-1 | Protocol artifact completeness | Sections 11, 18 | The protocol names instruments and rubrics, but does not yet provide appendix placeholders for the consent form, survey items, interview guide, TTI coding manual, prompt taxonomy, safety incident form, and data dictionary. | Minor |
| NEW-2 | Reporting/preregistration specificity | Section 17 | The dissemination section says findings will be reported as a protocol-compliant field evaluation, but does not name the preregistration repository, reporting checklist adaptation, or artifact availability plan. | Minor |
| NEW-3 | TTI construct validity | Section 9.1 | The TTI weights are still asserted rather than justified. This is acceptable for a protocol draft if treated as a priori weights, but the final version should state that weights are theory-informed and will not be tuned on outcome data. | Minor |

## Decision Rationale

The revised manuscript substantially resolves the Stage 3 major-revision concerns. The most important improvements are the Stage A/Stage B separation, the operational TTI coding rules, the intervention prompt and confidence taxonomy, the technical performance evaluation, and the safety-gate logic. These changes make the protocol auditable and suitable to move into final integrity verification.

The remaining issues are not major threats to the study design. They are finalization issues: add artifact appendix placeholders, tighten dissemination/preregistration language, and clarify that TTI weights are fixed a priori unless changed through a documented protocol amendment.

## Residual Minor Revision Actions

1. Add an appendix roadmap listing planned study artifacts: consent form, survey items, interview guide, TTI coding manual, prompt taxonomy, safety incident form, data dictionary, and analysis code plan.
2. Add one sentence to the TTI section stating that weights are fixed before data collection and any weight change requires a protocol amendment.
3. Expand dissemination by naming the preregistration destination or, if not yet chosen, stating that the registry and artifact repository must be selected before recruitment.

## Pipeline Decision

Stage 3' RE-REVIEW result: Minor Revision.

Per the academic-pipeline state machine, Accept or Minor Revision at Stage 3' proceeds to Stage 4.5 Final Integrity. The residual items can be handled as minor cleanup before or during final integrity preparation; they do not require a Stage 4' major re-revision loop.
