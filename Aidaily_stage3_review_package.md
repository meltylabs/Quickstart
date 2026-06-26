# Stage 3 Peer Review Package: Aidaily Protocol Paper

## Reviewer Configuration

| Role | Configured Identity | Review Focus |
| --- | --- | --- |
| Editor-in-Chief | Editor for an empirical software engineering / human-centered AI venue | Journal fit, contribution, protocol completeness |
| Reviewer 1 | Mixed-methods and field-experiment methodologist | Design, outcomes, sampling, analysis, reproducibility |
| Reviewer 2 | Agile software engineering and project-management scholar | Literature coverage, domain contribution, Agile/AI framing |
| Reviewer 3 | Human-computer interaction and AI governance reviewer | Practical feasibility, human-AI interaction, ethics, stakeholder impact |
| Devil's Advocate | Adversarial protocol reviewer | Strongest counterarguments, logic gaps, overclaiming |

## EIC Review Report

### Overall Recommendation

Major Revision

### Confidence Score

4/5

### Summary Assessment

The manuscript is timely and has a plausible home in empirical software engineering, human-centered AI, or software project management venues. Its strongest feature is the clear positioning of conversational AI as a mediator for team memory rather than as an autonomous decision-maker. The protocol structure is also substantially improved compared with a conceptual-only paper: it includes objectives, hypotheses, participants, intervention, comparator, outcomes, analysis, ethics, and risks.

The paper is not yet ready as a protocol submission because its intervention and measurement procedures remain underspecified. A reader cannot yet reproduce the AI intervention, compute TTI consistently, audit prompt governance, or judge whether the proposed study is powered for the intended claims. The manuscript states that it is "preregistration-ready" at lines 300-309, but several preregistration-critical fields are still placeholders or policy-level statements.

### Strengths

1. **Clear protocol framing:** The paper no longer claims completed results and consistently frames the study prospectively.
2. **Appropriate primary outcome:** TTI is aligned with the intervention's stated purpose and decomposed into meaningful components.
3. **Ethical awareness:** The paper correctly treats psychological safety and surveillance risk as central rather than peripheral.

### Weaknesses

1. **Protocol-readiness overstatement:** Lines 300-309 say the protocol is preregistration-ready while listing unresolved design elements. Reframe as "protocol draft" or complete those fields.
2. **Intervention not specified enough:** Lines 129-150 describe functions but not the model, prompt flow, confidence thresholds, human escalation rules, writeback examples, or error handling.
3. **Target venue fit needs sharpening:** The paper should name the intended genre more precisely: protocol paper for empirical software engineering, field study protocol, or HCI intervention protocol.

## Methodology Review Report

### Overall Recommendation

Major Revision

### Confidence Score

5/5

### Summary Assessment

The proposed mixed-method, baseline-to-intervention design is appropriate for an early field evaluation, but the protocol lacks the operational precision expected before data collection. The largest methodological risk is that TTI is treated as a primary outcome before its measurement reliability and validity are established. The study can still work, but it should explicitly separate feasibility/pilot aims from confirmatory effectiveness aims. The sample-size section correctly notes clustered outcomes and unknown effect sizes, but it does not define a minimum analyzable unit, power assumptions, or progression criteria. The analysis plan is reasonable at a high level but not yet executable.

### Strengths

1. **Design matches the setting:** A quasi-experimental baseline/intervention field design is realistic for workplace software teams.
2. **Mixed-method integration is appropriate:** Joint displays and qualitative explanation are well matched to adoption and governance questions.
3. **Confounds are acknowledged:** Team size, sprint phase, workload intensity, management pressure, and tool maturity are identified.

### Major Weaknesses

1. **TTI needs a coding manual:** Lines 160-172 define components, but not denominator construction, sampling windows, coder rules, adjudication, or inter-rater reliability.
2. **Pilot vs confirmatory aims are conflated:** Lines 125-127 say pilot data should estimate effect size, but hypotheses are written as if confirmatory testing is planned.
3. **Power/sample-size plan is incomplete:** The protocol should specify cluster assumptions, expected number of teams, minimum sprint observations, and feasibility thresholds.
4. **Burden threshold is undefined:** H3b at line 66 mentions a "predefined minimal-burden threshold" but no threshold appears later.
5. **Missing-data plan is too general:** Lines 254 and 266 mention missing data and minimization, but there is no rule for missing survey responses, incomplete logs, or opt-out participants within teams.

### Questions for Authors

1. Is the first study a feasibility pilot or a powered effectiveness evaluation?
2. What exact rule makes an action item "complete" for CMP?
3. What is the prompt-burden non-inferiority or acceptability threshold?
4. How will teams with partial consent be handled?

## Domain Review Report

### Overall Recommendation

Minor-to-Major Revision

### Confidence Score

4/5

### Summary Assessment

The manuscript sits well within current Agile software engineering concerns: distributed coordination, traceability, meeting usefulness, and AI-supported project management. The literature is accurate but thin for a protocol paper. It cites daily stand-up work, Agile scaling, Agile fit, automated requirements engineering, cognitive agents, and AI reporting guidelines. However, it needs stronger grounding in empirical software engineering measurement, traceability, coordination breakdowns, and human-centered AI evaluation. The contribution is plausible: a field protocol for AI-mediated team memory. To make that contribution convincing, the authors should explain how this differs from existing bot-based project-management automation, meeting summarization, and issue-linking tools.

### Strengths

1. **Accurate Agile framing:** The paper avoids claiming that Agile ceremonies alone create transparency.
2. **Good distinction between support and decision-making:** Lines 140-146 preserve human authority over project records.
3. **Relevant AI reporting anchor:** The use of CONSORT-AI/SPIRIT-style ideas is appropriate as inspiration, with the non-clinical caveat stated at line 36.

### Weaknesses

1. **Missing traceability literature:** The paper should cite software traceability and issue-linking work, not only Agile communication and AI project-management papers.
2. **Limited human-centered AI literature:** The protocol would benefit from references on explainability, automation bias, human oversight, and workplace AI governance.
3. **Competitor/baseline ambiguity:** The comparator is "normal workflow" at lines 152-154, but some teams may already use bots, meeting summarizers, or Jira automation. Baseline tooling must be characterized.

## Perspective Review Report

### Overall Recommendation

Major Revision

### Confidence Score

4/5

### Summary Assessment

From an HCI and governance perspective, the protocol asks the right questions but under-specifies the human-AI interaction. The intervention is not just a measurement tool; it changes communication norms in a workplace. That creates risks around consent, opt-out, manager access, social pressure to accept prompts, and chilling effects on surfacing blockers. The manuscript recognizes these risks, but the safeguards remain broad. A strong protocol should include concrete interface states, participant controls, escalation paths, and stopping rules for harm signals.

### Strengths

1. **Governance is central:** The paper explicitly rejects individual performance scoring.
2. **Reversibility is included:** Source-linked and reversible writeback is a strong design principle.
3. **Qualitative follow-up is appropriate:** Interviews are necessary to understand trust and chilling effects.

### Weaknesses

1. **No participant control model:** The protocol should specify opt-out, pause, delete, redact, and appeal mechanisms.
2. **No harm-monitoring stop rule:** If psychological safety drops or surveillance concerns spike, the protocol should define what happens.
3. **No prompt UX specification:** Prompt types, frequency caps, timeout behavior, and edit/reject flows should be described enough to evaluate burden.
4. **Managerial power asymmetry needs sharper treatment:** Lines 272-280 mention safeguards, but the protocol should separate manager dashboards from team-member views.

## Devil's Advocate Stress-Test Report

### Strongest Counter-Argument

The strongest objection is that the protocol may measure documentation hygiene rather than transparency. A team could improve TTI by creating more linked, complete, and timely records while still becoming less candid in stand-ups or chats because the AI system makes communication feel monitored. In that case, the intervention would optimize the visible artifact layer while degrading the social substrate that Agile communication depends on. The paper partially anticipates this through psychological safety and governance measures, but it does not yet define a decision rule for when improved TTI is outweighed by increased burden, reduced candor, or surveillance concern. Without that rule, the primary outcome could reward a harmful intervention.

### Issues

1. **MAJOR: Primary outcome may conflict with ethical outcome.** TTI can rise while psychological safety falls. The protocol needs a composite interpretation rule or safety gate.
2. **MAJOR: AI accuracy is not directly evaluated.** The study records accepted/edit/rejected suggestions, but it does not define gold-standard evaluation for extraction, linking, or conflict detection.
3. **MAJOR: Confirmation can become compliance theater.** Role-aware confirmation may not equal genuine consensus if managers or senior staff are visible in the workflow.
4. **MINOR: The protocol assumes Jira/Git/chat are sufficient operational traces.** Important work may occur in design tools, docs, calls, or private messages.

### Missing Stakeholder Perspectives

- Team members who are lower-status or newer to the team.
- Managers who might want individual-level analytics.
- Legal/privacy stakeholders responsible for workplace monitoring.
- Product owners whose scope decisions may be challenged by AI-generated traceability.

## Editorial Synthesis

### Reviewer Summary Matrix

| Reviewer | Recommendation | Confidence | Main Concern |
| --- | --- | --- | --- |
| EIC | Major Revision | 4 | Protocol-readiness and intervention specification |
| R1 Methodology | Major Revision | 5 | TTI operationalization, pilot/confirmatory ambiguity, power plan |
| R2 Domain | Minor-to-Major Revision | 4 | Thin traceability/HCAI literature and baseline characterization |
| R3 Perspective | Major Revision | 4 | Human-AI interaction and governance safeguards |
| Devil's Advocate | Major issues | n/a | TTI may improve while candor and psychological safety decline |

### Editorial Decision

Major Revision

The manuscript is promising and substantially improved, but not ready for acceptance as a protocol paper. The required changes are feasible and do not require abandoning the study. The central revision task is to make the protocol executable: define the intervention, measurement rules, safety gates, sample/power logic, and human-AI governance model in enough detail that another research team could implement or audit the study.

## Revision Roadmap

### P1: Must Fix

| # | Issue | Section | Required Action |
| --- | --- | --- | --- |
| 1 | TTI is under-operationalized. | Outcomes / Analysis | Add a TTI coding manual: denominators, sampling windows, coder training, inter-rater reliability, adjudication, examples. |
| 2 | Pilot and confirmatory aims are conflated. | Objectives / Design / Sample Size | State whether this is a feasibility pilot, confirmatory study, or two-phase program. Align hypotheses and analyses accordingly. |
| 3 | Intervention behavior is underspecified. | Intervention | Add model/system description, prompt taxonomy, confidence thresholds, escalation rules, writeback examples, failure modes, and error handling. |
| 4 | AI extraction/linking accuracy is not evaluated. | Outcomes / Analysis | Add technical performance outcomes: precision/recall or agreement against a manually coded gold sample for extraction, linking, and conflict detection. |
| 5 | Ethical safety gates are missing. | Ethics / Risk Management | Define stop/pause/review rules for psychological safety decline, high prompt burden, opt-out concerns, or surveillance complaints. |
| 6 | Participant control mechanisms are vague. | Ethics / Intervention | Specify opt-out, pause, redact, edit, reject, delete, and appeal mechanisms. |

### P2: Should Fix

| # | Issue | Section | Suggested Action |
| --- | --- | --- | --- |
| 7 | Sample-size section lacks actionable assumptions. | Participants | Add pilot progression criteria and, for confirmatory study, ICC/effect-size assumptions or a simulation-based power plan. |
| 8 | Prompt burden threshold is undefined. | Hypotheses / Outcomes | Define the non-inferiority or acceptability threshold for workload/prompt burden. |
| 9 | Baseline workflow is underspecified. | Comparator | Characterize existing automation, meeting summarizers, bots, and issue-linking practices. |
| 10 | Literature base is too narrow. | Introduction | Add software traceability, human-centered AI, automation bias, workplace monitoring, and team cognition references. |
| 11 | Missing-data and partial-consent handling are incomplete. | Data Management / Analysis | Add rules for incomplete logs, survey nonresponse, and teams where not everyone consents. |

### P3: Consider

| # | Issue | Section | Optional Improvement |
| --- | --- | --- | --- |
| 12 | Study artifacts are not listed. | Appendix | Add planned appendices: consent form, survey items, interview guide, TTI rubric, prompt taxonomy. |
| 13 | Dissemination is generic. | Dissemination | Specify reporting checklist and preregistration repository. |
| 14 | Governance roles are unclear. | Ethics | Add data steward, technical owner, team representative, and escalation owner. |

## Required Author Response

The revision should include a response table with one row per P1/P2 issue:

| Concern ID | Reviewer Source | Action Taken | Manuscript Location | Status |
| --- | --- | --- | --- | --- |
| P1-1 | R1 / EIC | | | |
| P1-2 | R1 | | | |
| P1-3 | EIC / R3 | | | |
| P1-4 | DA / R1 | | | |
| P1-5 | R3 / DA | | | |
| P1-6 | R3 | | | |

## Pipeline Decision

Stage 3 REVIEW result: Major Revision. Proceed to Stage 4 REVISE if the user confirms.
