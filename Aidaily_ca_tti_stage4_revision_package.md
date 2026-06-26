# Stage 4 Revision Package

Manuscript revised: `Aidaily_ca_tti_manuscript_revised_stage4.md`

Prior draft: `Aidaily_ca_tti_manuscript_draft.md`

Review package: `Aidaily_ca_tti_stage3_review_package.md`

Date: 2026-06-26

Decision addressed: Major Revision

## Summary of Changes

- Reframed the paper consistently as a conceptual measurement framework with synthetic stress-test evidence.
- Expanded related work from 8 references to 15 references.
- Added a construct-boundary section distinguishing artifact, process, epistemic, and governance transparency.
- Expanded HAG into six subdimensions and separated conceptual HAG from implemented `hag_proxy`.
- Added reproducible synthetic-method details: generator fields, scenario purposes, formulae, thresholds, and baseline warning rule.
- Added an ablation table showing the effect of removing trend, HAG, and artifact-only warning logic.
- Added a "Use, Misuse, and Deployment Vignette" section.
- Updated limitations to cover construct validity, event-level data, threshold calibration, and selective literature coverage.

## Revision Tracking Table

| ID | Issue Description | Reviewer Source | Type | Section | Resolution Summary | Location of Change | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SC-1 | Clarify contribution type as framework plus synthetic stress test | Consensus-4 | Major | Abstract, Introduction, Conclusion | Added explicit contribution type in Material Passport, Abstract, Introduction, Results interpretation, and Conclusion. | Abstract; Sections 1, 7, 12 | RESOLVED |
| SC-2 | Define HAG more rigorously and distinguish proxy from construct | Consensus-4 | Major | HAG | Added HAG subdimension table and renamed implemented synthetic measure as `hag_proxy`. | Section 5 | RESOLVED |
| SC-3 | Report synthetic method reproducibly | Consensus-3 | Major | Methods, Results | Added row schema, scenario table, formulae, threshold rules, baseline warning rule, and ablation results. | Sections 6 and 7 | RESOLVED |
| SC-4 | Expand related work and positioning | Consensus-3 | Major | Related Work | Added human-AI teaming, shared mental models, socio-technical congruence, code review quality, Copilot, and agentic code-review references. | Section 2 and References | RESOLVED |
| SC-5 | Operationalize governance safeguards and misuse prevention | Corroborated | Major | Governance | Added Use/Misuse section, safeguards, safe deployment vignette, and anti-gaming paragraph. | Section 8 | RESOLVED |
| P2-1 | Add signal-to-data mapping | Review Roadmap | Minor | Construct model | Added transparency form table and HAG observable-indicator table. | Sections 3 and 5 | RESOLVED |
| P2-2 | Add deployment vignette | Review Roadmap | Minor | Governance | Added sprint-review scenario showing a safe response to rising HAG. | Section 8 | RESOLVED |
| P3-1 | Add signal-flow figure | Review Roadmap | Minor | Framework | Added text-based signal-flow diagram. | Section 4.3 | RESOLVED |
| P3-2 | Tighten terminology | Review Roadmap | Minor | Whole manuscript | Added explicit transparency taxonomy and bounded terms. | Sections 3 and 4 | RESOLVED |

## Commitment Ledger

```yaml
- concern_id: SC-1
  commitment_extracted:
    - commitment_text: "Reframe the manuscript consistently as a conceptual measurement framework plus synthetic stress test."
      commitment_type: restructure
      required_evidence_type: prose_edit
      fulfillment_status: fulfilled

- concern_id: SC-2
  commitment_extracted:
    - commitment_text: "Define HAG as a construct with subdimensions."
      commitment_type: add_clarification
      required_evidence_type: new_table
      fulfillment_status: fulfilled
    - commitment_text: "Distinguish conceptual HAG from the current hag_proxy."
      commitment_type: add_clarification
      required_evidence_type: methods_paragraph
      fulfillment_status: fulfilled

- concern_id: SC-3
  commitment_extracted:
    - commitment_text: "Add generator assumptions, thresholds, baseline warning logic, and sensitivity or ablation discussion."
      commitment_type: add_analysis
      required_evidence_type: new_table
      fulfillment_status: fulfilled

- concern_id: SC-4
  commitment_extracted:
    - commitment_text: "Expand related work enough to position CA-TTI against existing software engineering and human-AI teaming literature."
      commitment_type: add_citation
      required_evidence_type: new_citation
      fulfillment_status: fulfilled

- concern_id: SC-5
  commitment_extracted:
    - commitment_text: "Add Use and Misuse plus a safe deployment vignette."
      commitment_type: add_clarification
      required_evidence_type: new_section
      fulfillment_status: fulfilled
```

## Response to Reviewers

Dear Editor and Reviewers,

Thank you for the detailed and constructive feedback. We revised the manuscript to clarify its contribution, strengthen construct definition, report the synthetic stress test more reproducibly, expand the related work, and operationalize governance safeguards.

### Response to SC-1: Contribution type must be clarified

Response: We agree. The revised manuscript now states that CA-TTI is a conceptual measurement framework with synthetic stress-test evidence, not a validated field index.

Changes made: The framing was revised in the Material Passport, Abstract, Introduction, Results interpretation, Limitations, and Conclusion.

### Response to SC-2: HAG requires sharper construct definition

Response: We agree. We added a HAG subdimension table and explicitly distinguish conceptual HAG from the implemented `hag_proxy`.

Changes made: Section 5 now defines confirmation debt, review-depth gap, attribution ambiguity, explanation gap, correction gap, and trust/safety divergence.

### Response to SC-3: Synthetic methods need reproducible reporting

Response: We agree. We expanded the synthetic methods section and added formulae, thresholds, baseline rules, and an ablation table.

Changes made: Sections 6 and 7 now describe the row schema, scenario purposes, scoring formula, warning rule, raw baseline, and ablation leads.

### Response to SC-4: Literature base must expand

Response: We agree. We expanded the paper's positioning across Agile coordination, software traceability, socio-technical congruence, code review quality, human-AI teaming, shared mental models, AI pair programming, and agentic code review.

Changes made: Section 2 and the References list were expanded from 8 to 15 sources.

### Response to SC-5: Governance safeguards must become operational

Response: We agree. The revised draft now includes an explicit Use/Misuse section, deployment safeguards, and a vignette showing that warnings should trigger team inquiry rather than sanctions.

Changes made: Section 8 was added.

## Residual Limitations

- The manuscript still does not claim field validation.
- The ablation is a small secondary check on the same synthetic output, not an independent experiment.
- New references added in Stage 4 still require final Stage 4.5 integrity verification.

## Stage 4 Checkpoint

Stage 4 is complete.

Next pipeline stage: Stage 3' RE-REVIEW, focused on whether the revision actually addressed the Stage 3 review roadmap.
