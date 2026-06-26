# Protocol for Evaluating a Conversational AI Framework for Agile Team Transparency and Knowledge Traceability

## Material Passport

- Origin Skill: academic-research-suite / experiment-agent
- Origin Mode: protocol paper / human study protocol
- Origin Date: 2026-06-26
- Verification Status: STAGE_4_5_FINAL_INTEGRITY_PASS
- Version Label: aidaily_protocol_paper_v3_integrity_pass
- Source Draft: Aidaily_v0.3_revised.md

## Abstract

**Background:** Agile teams rely on daily coordination, issue tracking, and version control to maintain shared understanding. In distributed and hybrid teams, however, decisions, blockers, and action commitments often remain fragmented across meetings, chat, Jira, and Git. Conversational AI may help by extracting candidate updates from informal communication, linking them to project artifacts, and prompting team members to confirm or correct them.

**Objective:** This protocol describes a mixed-method field study to evaluate whether a conversational AI framework improves Agile team transparency, knowledge traceability, and perceived alignment without increasing cognitive burden or weakening psychological safety.

**Methods:** The study will use a two-stage mixed-method design. Stage A is a feasibility pilot that estimates measurement reliability, prompt burden, extraction/linking accuracy, and safety signals. Stage B is an optional powered field evaluation using a quasi-experimental, baseline-to-intervention design across Agile software teams. During baseline, teams continue normal workflows while communication, issue, and version-control metadata are measured. During intervention, teams use a conversational AI mediator that ingests stand-up transcripts, chat messages, Jira data, and Git metadata; extracts candidate decisions and action items; detects inconsistencies; and requests role-aware confirmation before writeback. The primary feasibility outcome is whether the Team Transparency Index (TTI) can be computed reliably. The primary effectiveness outcome, if Stage B proceeds, is change in TTI from baseline to intervention.

**Analysis:** Feasibility analysis will report reliability, prompt-burden rates, technical performance, missingness, and progression criteria. Effectiveness analysis will compare baseline and intervention periods using mixed-effects models or non-parametric alternatives when assumptions are not met. Qualitative interviews and observation notes will be analyzed thematically to explain adoption patterns, trust, interruption costs, and governance concerns.

**Ethics and Dissemination:** The study requires informed consent, role-based access controls, provenance-preserving audit trails, and safeguards against individual performance scoring. Results will be reported as a protocol-compliant field evaluation and will distinguish system performance from team-level organizational outcomes.

**Keywords:** Agile software development; protocol paper; conversational AI; mixed methods; field study; team transparency; knowledge traceability; psychological safety; human-AI collaboration

## 1. Introduction

Agile software development depends on shared context. Teams coordinate through daily stand-ups, chat threads, issue trackers, code reviews, and version-control activity. These artifacts are individually useful, but they do not automatically produce a durable and verified team memory. A decision may be made verbally, partly clarified in chat, reflected indirectly in a pull request, and never updated in the issue tracker. The result is a persistent gap between what the team knows informally and what the system of record says formally.

Prior research on daily stand-ups shows both the value and limits of recurring Agile communication. Stand-ups are widely used and can support team awareness, but their value varies by team size, role, and meeting quality (Stray et al., 2017). Grounded theory work also shows that stand-ups support coordination and monitoring while remaining sensitive to local practice (Stray et al., 2016). Later work argues that teams should adapt stand-up rules when the ritual no longer serves communication needs (Stray et al., 2020). These findings suggest that Agile transparency cannot be inferred from ceremony adoption alone.

Research on Agile scaling and methodology fit also supports a context-sensitive approach. Verwijs and Russo (2024) found that scaling frameworks themselves explain little practical difference in team effectiveness. Itzik and Roy (2023) argue that Agile fit depends on software project characteristics and should be assessed through a decision framework. For a transparency intervention, this means the target is not framework compliance but the quality of alignment among people, artifacts, and decisions.

AI-supported software project management provides relevant technical foundations. Automated requirements engineering research shows that machine learning can extract structured models from natural-language requirements in Agile contexts (Umar et al., 2025). LLM-based multi-agent project-management frameworks such as CogniSim show that AI agents can support Agile roles and project workflows in simulated environments (Cinkusz et al., 2025). Comparative work on Agile methods and technology-enhanced practices also suggests that AI-enabled tools may affect delivery and quality outcomes, while introducing risks of over-reliance on automation (Malla, 2025). The traceability literature is also directly relevant: software traceability is valuable but often performed ad hoc and after the fact, limiting its realized benefit (Cleland-Huang et al., 2014). Human-centered AI research further emphasizes that reliable and trustworthy systems should combine high automation with meaningful human control (Shneiderman, 2020). These strands motivate a field study that tests whether conversational AI can improve the human communication layer of real Agile teams without producing automation bias, intrusive monitoring, or reduced psychological safety (Parasuraman & Riley, 1997; Ball, 2021).

This protocol defines a study to evaluate a conversational AI mediator for Agile transparency. The protocol is informed by general protocol-reporting principles for transparent intervention studies, including the logic of SPIRIT-style completeness and AI-specific reporting attention to intervention behavior, human oversight, and error handling (Chan et al., 2013; Liu et al., 2020). The present study is not a clinical trial, so these guidelines are used as structural inspiration rather than as formal regulatory requirements.

## 2. Study Objectives

### 2.1 Primary Objective

To determine whether use of a conversational AI mediator improves team-level transparency, as measured by change in Team Transparency Index (TTI) from baseline to intervention.

### 2.2 Secondary Objectives

1. To estimate whether TTI can be coded with acceptable inter-rater reliability in real Agile work artifacts.
2. To estimate the technical performance of AI extraction, artifact linking, and conflict detection against a manually coded gold sample.
3. To determine whether the intervention reduces mean time to detect communication-to-record inconsistencies.
4. To determine whether the intervention improves documentation completeness for action items and decisions.
5. To assess whether the intervention changes perceived transparency, cognitive workload, trust in AI-generated updates, and psychological safety.
6. To characterize qualitative adoption patterns, including when teams accept, correct, ignore, or reject AI-generated prompts.
7. To identify governance risks associated with AI-mediated team memory, especially surveillance concerns and misuse of transparency metrics for individual evaluation.

## 3. Research Questions and Hypotheses

**RQ1:** Does the conversational AI mediator improve team transparency compared with baseline practice?

**H1a:** In the feasibility pilot, TTI components will reach acceptable coding reliability, defined as Cohen's kappa or Krippendorff's alpha >= 0.70 for categorical judgments and intraclass correlation >= 0.70 for continuous timing measures.

**H1b:** In the powered field evaluation, mean TTI will be higher during the intervention period than during the baseline period.

**RQ2:** Does the mediator improve detection of mismatches between team communication and project records?

**H2:** Mean time to detect communication-to-record inconsistencies will be lower during intervention than during baseline.

**RQ3:** Does the mediator improve documentation quality without increasing perceived burden?

**H3a:** Documentation completeness will increase during intervention.

**H3b:** Perceived workload will not increase by more than 10 points on a 0-100 raw NASA-TLX scale, and AI prompts will not exceed a median of two prompts per participant per workday.

**RQ4:** How do team members experience AI-mediated confirmation prompts?

**H4:** Team members will report higher trust in AI-generated updates when prompts include source links, confidence levels, and reversible writeback.

**RQ5:** What governance safeguards are necessary to preserve psychological safety?

This question is exploratory and will be answered through interviews, observations, and thematic analysis.

## 4. Study Design

The study will use a two-stage mixed-method design.

**Stage A: Feasibility pilot.** Stage A tests whether the protocol can be implemented safely and whether TTI can be measured reliably. It estimates coding reliability, AI technical performance, prompt burden, missingness, opt-out rates, and safety signals. Stage A is not powered to test effectiveness.

**Stage B: Field evaluation.** Stage B proceeds only if Stage A meets progression criteria. It uses a quasi-experimental repeated-measures design in which each participating team completes a baseline phase followed by an intervention phase. If organizational scheduling permits, teams will be staggered so that not all teams begin the intervention simultaneously. Staggering improves interpretability by separating intervention effects from calendar events such as release deadlines or organizational changes.

The recommended minimum duration is:

| Phase | Duration | Purpose |
| --- | --- | --- |
| Preparation | 2 weeks | Consent, tool configuration, privacy review, pilot data mapping |
| Stage A baseline | 1 sprint or 2 weeks | Test passive data capture and initial TTI coding |
| Stage A intervention | 1 sprint or 2 weeks | Test prompts, technical accuracy, safety gates, and burden |
| Stage A decision | 1 week | Apply progression criteria before Stage B |
| Stage B baseline | 2 sprints or 4 weeks | Measure normal workflow without AI writeback |
| Stage B intervention | 2 to 4 sprints or 4 to 8 weeks | Deploy AI mediator with confirmation prompts |
| Follow-up | 1 to 2 weeks | Interviews, debrief, data-quality checks |

The design is not blinded. Participants will know when the AI mediator is active. Outcome extraction from system logs should be automated where possible and reviewed using predefined rules to reduce subjective bias.

## 5. Setting

The study will be conducted in software development teams that use Agile practices and maintain digital project artifacts. The minimum tooling environment is:

1. An issue tracker such as Jira.
2. A Git-based version-control system.
3. A team communication channel such as Rocket.Chat, Slack, Microsoft Teams, or equivalent.
4. Recurring stand-up communication, either synchronous or asynchronous.

The initial pilot may use a single Scrum team of 6 to 10 members. A stronger field evaluation should include at least 6 teams to support team-level comparison and reduce the risk that findings reflect one team's habits. Baseline tooling must be documented for each team, including existing bots, meeting summarizers, Jira automation rules, issue-linking practices, and dashboard use.

## 6. Participants

### 6.1 Target Population

Participants are members of Agile software development teams, including developers, QA engineers, product owners, scrum masters, engineering managers, and other roles who participate in daily coordination or issue updates.

### 6.2 Inclusion Criteria

1. The participant is a member of a participating Agile team.
2. The participant uses the team's issue tracker, code review system, or communication channel as part of normal work.
3. The participant is at least 18 years old.
4. The participant provides informed consent for study data collection.

### 6.3 Exclusion Criteria

1. Participants who do not consent to data collection.
2. Contractors or external stakeholders whose communication cannot be captured under the organization's data policy.
3. Team members whose role creates a direct power conflict that cannot be mitigated in consent or interview procedures.

### 6.4 Sampling Strategy

Team recruitment will use purposive sampling. The study should prioritize teams with active project work, regular stand-up practices, and enough tool usage to support traceability measurement. Within recruited teams, all eligible members should be invited to participate to reduce selection bias.

### 6.5 Target Sample Size

For Stage A, the target is 1 to 3 teams and approximately 8 to 30 participants. Stage A will be judged by feasibility rather than statistical significance. Progression to Stage B requires: (a) TTI coding reliability >= 0.70, (b) median prompt burden <= 2 prompts per participant per workday, (c) no unresolved ethics or safety gate breach, (d) AI extraction/linking precision >= 0.70 on the manually coded pilot sample, and (e) no more than 20% missingness in the primary data streams.

For Stage B, the target should be at least 6 teams if feasible. A final power analysis will be completed after Stage A using the observed TTI variance, estimated intraclass correlation, team count, sprint count, and expected missingness. If the available team count is too small for confirmatory inference, Stage B will be reported as an expanded feasibility and estimation study rather than an effectiveness trial.

## 7. Intervention

### 7.1 Conversational AI Mediator

The intervention is a conversational AI framework embedded in the team's communication and project-management environment. It performs four functions:

1. **Ingestion:** Collects meeting transcripts, chat messages, Jira updates, and Git metadata.
2. **Extraction and linking:** Identifies candidate action items, decisions, blockers, status claims, and links to project artifacts.
3. **Conflict detection:** Flags mismatches between communication and project records.
4. **Role-aware confirmation:** Prompts relevant team members to confirm, reject, or edit candidate knowledge artifacts before writeback.

The study will record the exact model family, version, system prompts, retrieval configuration, source connectors, and confidence-scoring rules used during the intervention. Any model or prompt change during data collection will be logged as a protocol deviation and sensitivity-analysis flag.

### 7.2 Prompt Taxonomy

The mediator may generate five prompt types:

| Prompt Type | Trigger | Required Recipient |
| --- | --- | --- |
| Action-item confirmation | Candidate who/what/when commitment extracted from communication | Named assignee |
| Decision confirmation | Scope, priority, acceptance criterion, or architecture decision detected | Product owner plus affected implementer |
| Blocker clarification | Blocker stated without owner, dependency, or next step | Blocked assignee and blocker owner when identifiable |
| Conflict resolution | Communication claim conflicts with Jira/Git status | Assignee plus relevant role based on artifact type |
| Documentation completion | Confirmed item lacks required metadata | Assignee or scrum master/team lead |

Prompt content must include the extracted claim, source link, linked artifact, confidence level, suggested action, and available responses: accept, edit, reject, defer, or mark sensitive.

### 7.3 Confidence and Escalation Rules

The mediator will use predefined confidence bands. High-confidence, low-impact items may be batched. Medium-confidence items require explicit confirmation. Low-confidence items are logged for technical evaluation but do not trigger participant prompts unless sampled for manual review. High-impact items always require confirmation regardless of confidence.

| Confidence Band | Operational Rule |
| --- | --- |
| High | Confidence >= 0.80 and no conflict detected; batch unless high-impact. |
| Medium | 0.50 <= confidence < 0.80; request confirmation before writeback. |
| Low | Confidence < 0.50; do not prompt by default; include in manual evaluation sample. |
| High-impact override | Scope, priority, ownership, due date, acceptance criteria, security/privacy, or release decision; require role-aware confirmation. |

### 7.4 Technical Performance Evaluation

A stratified random sample of communication events and AI-generated candidates will be manually coded by two independent coders. The gold sample will include accepted prompts, edited prompts, rejected prompts, ignored prompts, and low-confidence non-prompted candidates. Technical outcomes will include precision, recall where denominators can be estimated, F1 score, false-positive categories, false-negative categories, and disagreement resolution notes for extraction, artifact linking, and conflict detection.

### 7.5 Human Oversight

The AI does not independently decide project scope, task status, ownership, or acceptance criteria. For low-risk summaries, one assignee confirmation may be sufficient. For high-impact updates, confirmation may be required from multiple roles, such as developer, QA, and product owner.

### 7.6 Writeback Policy

Confirmed updates may be written to Jira comments, issue metadata, pull request descriptions, decision records, or a team knowledge store. Writeback must preserve provenance. Every AI-created record should include source links, timestamp, confirming roles, and reversal instructions.

The mediator may write comments or draft suggestions automatically after confirmation, but it may not silently change issue status, assignee, due date, sprint scope, acceptance criteria, or release labels. Those fields require explicit role-aware confirmation and a reversible audit trail.

### 7.7 Prompt Governance and Participant Controls

Prompt frequency will be capped to reduce interruption burden. The default cap is two prompts per participant per workday, excluding urgent high-impact conflicts. Participants may pause prompts for a defined period, mark a source as sensitive, reject a prompt without justification, edit the proposed record, request deletion from the study dataset when allowed by policy, or appeal a writeback to the data steward. The system should batch low-risk suggestions and prioritize prompts involving conflict, missing ownership, missing due date, unresolved blocker, or high-impact decision.

## 8. Comparator

The comparator is each team's baseline workflow without AI-mediated extraction, confirmation, or writeback. Teams continue to use their existing communication channels, issue trackers, stand-ups, and version-control practices.

## 9. Outcomes

### 9.1 Primary Outcome

The primary outcome is change in Team Transparency Index (TTI) from baseline to intervention.

```text
TTI = 0.25*COV + 0.25*CON + 0.20*CSN + 0.15*TML + 0.15*CMP
```

These weights are theory-informed a priori weights and will be fixed before data collection. Any change to the weights, component definitions, or component inclusion rules will require a documented protocol amendment and will not be tuned on outcome data.

| Component | Operational Definition |
| --- | --- |
| COV | Proportion of eligible communication-mentioned tasks or decisions linked to a Jira issue, Git artifact, or decision record within the sprint window. Denominator excludes social talk, duplicate mentions, and explicitly out-of-scope personal content. |
| CON | Proportion of sampled status, ownership, blocker, and decision claims that match structured project records or are explicitly reconciled. |
| CSN | Proportion of high-impact decisions that meet the predefined role-confirmation threshold before writeback. |
| TML | Normalized inverse delay between event occurrence and documented update, capped at the sprint boundary. |
| CMP | Proportion of eligible action items with who, what, and when fields. "When" may be a due date, sprint, next meeting, or explicit "no date yet" confirmation. |

TTI will be coded at sprint level for each team. The sampling window is the sprint plus a 48-hour post-sprint reconciliation period for records that are updated immediately after review or retrospective discussion. Eligible communication events are stand-up statements, chat messages, issue comments, pull request comments, and meeting transcript segments that contain a task, blocker, status claim, ownership claim, decision, due-date claim, or acceptance-criteria claim. Events are excluded when they are duplicate reminders, social conversation, private personnel content, or communication from non-consenting participants that cannot be de-identified under the approved protocol.

The denominator for each component is constructed independently. For example, a statement such as "Ana will add rate-limit handling before release candidate 2" contributes to COV if it can be linked to an issue or pull request, to CON if the claim matches project records or is explicitly reconciled, to TML based on the time until the linked record is updated, and to CMP if the responsible person, work item, and timing are present. A scope decision such as "we are deferring SSO to the next sprint" contributes to CSN if it meets the predefined product-owner and affected-implementer confirmation rule.

Two coders will independently code a 20% stratified sample of events during Stage A, covering each data source, role, prompt type, and confidence band. Disagreements will be adjudicated by a third reviewer. The study will report component-level reliability and will freeze the coding manual before Stage B only if the reliability progression criterion is met.

### 9.2 Secondary Outcomes

| Outcome | Measurement |
| --- | --- |
| Mean time to detect inconsistency | Time from first conflicting signal to system or human identification. |
| Documentation completeness | Share of action items and decisions with complete metadata. |
| Prompt burden | Number of AI prompts per participant per workday and participant-rated interruption cost. |
| Trust in AI updates | Survey items assessing perceived accuracy, explainability, and control. |
| Workload | NASA-TLX or raw NASA-TLX adapted for subjective workload measurement (Hart, 2006). |
| Psychological safety | Team psychological safety survey based on Edmondson's construct (Edmondson, 1999). |
| Adoption behavior | Acceptance, edit, rejection, and ignore rates for AI suggestions. |
| Technical extraction accuracy | Precision, recall where estimable, and F1 for action/decision/blocker extraction. |
| Technical linking accuracy | Accuracy and false-link rate for Jira/Git/decision-record links. |
| Conflict-detection accuracy | Precision and false-negative categories against manually coded conflict samples. |
| Governance concerns | Interview-coded concerns about privacy, surveillance, accountability, and misuse. |

## 10. Variables

| Role | Variable | Measurement | Scale |
| --- | --- | --- | --- |
| Intervention | AI mediator active | Baseline = 0, intervention = 1 | Nominal |
| Primary DV | TTI | Weighted composite of five normalized components | Interval |
| Secondary DV | Inconsistency detection time | Hours from conflict creation to detection | Ratio |
| Secondary DV | Documentation completeness | Complete items / total action items | Ratio |
| Secondary DV | Prompt burden | Prompts per user per day; survey burden rating | Ratio / ordinal |
| Secondary DV | Workload | NASA-TLX or raw NASA-TLX score | Interval |
| Secondary DV | Psychological safety | Mean survey score | Interval |
| Control | Team size | Number of active team members | Ratio |
| Control | Sprint phase | Planning, execution, release, retrospective | Nominal |
| Control | Workload intensity | Issue count, pull request count, release deadline indicator | Ratio / nominal |
| Confound | Management pressure | Interview and survey indicators | Qualitative / ordinal |
| Confound | Tool maturity | Baseline completeness and issue hygiene | Interval |

## 11. Instruments and Data Sources

| Instrument or Source | Purpose | Notes |
| --- | --- | --- |
| Jira or issue tracker export | Issue status, assignee, transitions, comments, timestamps | Metadata and project records only unless consent allows content review. |
| Git hosting metadata | Commits, pull requests, reviews, branch references | Used for traceability linking and event timing. |
| Chat and stand-up transcripts | Candidate decisions, blockers, status claims, action items | Sensitive content redaction required. |
| AI prompt log | Prompt type, recipient role, source evidence, confidence band, response, confirmation outcome, override reason | Used for adoption, burden, and safety-gate analysis. |
| TTI extraction rubric | Standardized coding of COV, CON, CSN, TML, CMP | Frozen after Stage A if reliability criteria are met. |
| Technical gold sample | Manually coded sample of candidate action items, decisions, blockers, links, and conflicts | Used to estimate extraction, linking, and conflict-detection performance. |
| Perceived transparency survey | Participant perception of alignment and visibility | Administer baseline and intervention. |
| Trust in AI update survey | Explainability, source confidence, reversibility, perceived accuracy | Administer after intervention. |
| NASA-TLX or raw NASA-TLX | Subjective workload | Use consistently across phases. |
| Psychological safety survey | Team climate for interpersonal risk taking | Use validated or adapted items with permission where required. |
| Semi-structured interviews | Qualitative adoption and governance data | Conduct after intervention. |

## 12. Data Collection Procedure

### 12.1 Preparation

The research team will obtain organizational approval, ethics approval where required, and informed consent. Tool integrations will be configured with least-privilege access. A data mapping exercise will identify which fields are needed for outcome measurement and which fields must be excluded or redacted.

### 12.2 Baseline Phase

During baseline, the AI mediator will not prompt participants or write back to project systems. Data will be collected passively from agreed sources to compute baseline TTI and secondary measures. Participants will complete baseline surveys on perceived transparency, workload, and psychological safety.

### 12.3 Intervention Phase

During intervention, the AI mediator will generate candidate knowledge items and role-aware prompts. Participants may accept, edit, reject, or ignore prompts. Confirmed items may be written back according to the writeback policy. System logs will record prompt type, source evidence, confirmation route, and outcome.

### 12.4 Follow-up

Participants will complete post-intervention surveys. A purposive subset of participants across roles will be invited for interviews. Interviews will focus on usefulness, trust, interruptions, missed cases, false positives, correction behavior, and privacy concerns.

## 13. Analysis Plan

### 13.1 Stage A Feasibility Analysis

Stage A will be analyzed as a feasibility pilot. The primary outputs will be recruitment and retention rates, consent coverage by data source, missingness by variable, prompt burden, safety-gate events, TTI coding reliability, and technical performance against the manually coded gold sample. Progression to Stage B requires meeting the criteria in Section 6. If criteria are not met, the study will be reported as a feasibility study and the intervention or protocol will be revised before any confirmatory evaluation.

### 13.2 Quantitative Effectiveness Analysis

If Stage B proceeds, the primary analysis will compare TTI between baseline and intervention. If multiple teams are included, mixed-effects models should be used with phase as a fixed effect and team as a random effect. If the sample is too small or assumptions are not met, the analysis will report descriptive statistics, paired comparisons, effect sizes, and confidence intervals.

Secondary outcomes will be analyzed as follows:

| Outcome | Primary Test | Fallback |
| --- | --- | --- |
| TTI | Linear mixed-effects model | Wilcoxon signed-rank or descriptive effect size |
| Detection time | Survival or time-to-event model | Mann-Whitney U or paired non-parametric comparison |
| Documentation completeness | Logistic or beta regression | Proportion difference with confidence interval |
| Prompt burden | Poisson or negative binomial model | Descriptive rate comparison |
| Survey scales | Paired t-test or mixed model | Wilcoxon signed-rank |
| Adoption behavior | Acceptance/edit/rejection rates | Descriptive and role-stratified analysis |
| Technical performance | Precision, recall, F1, false-positive and false-negative review | Descriptive error taxonomy |

Multiple comparisons will be treated as exploratory unless the study is powered confirmatorily. Survey scale reliability will be assessed with internal consistency when sample size permits.

### 13.3 Missing Data and Partial Consent

Missing data will be reported by variable, phase, team, role, and source system. Partial consent will be handled by excluding non-consenting participants' identifiable content from qualitative analysis and by using only aggregate or de-identified metadata where permitted by the approved consent protocol. If consent gaps prevent reliable team-level TTI computation, that team-period will be excluded from primary effectiveness analysis and retained only for feasibility reporting. Sensitivity analyses will compare complete-case results with analyses using available de-identified metadata where ethically and statistically appropriate.

### 13.4 Qualitative Analysis

Interview transcripts and observation notes will be analyzed using thematic analysis. The initial coding frame will include trust, usefulness, interruption cost, correction behavior, false positives, missed updates, role conflict, surveillance concern, and psychological safety. Two coders should independently code a subset of material and reconcile disagreements before coding the full dataset.

### 13.5 Mixed-Method Integration

Quantitative and qualitative findings will be integrated through joint displays. For example, teams with increased TTI but high prompt burden will be examined qualitatively to determine whether the transparency gain was acceptable. Teams with low AI adoption will be examined for trust, workflow fit, and governance barriers.

## 14. Data Management

Data will be minimized to the fields required for the study. Raw chat or transcript content should be redacted or summarized when possible. Identifiers will be pseudonymized before analysis. A linkage file, if required, will be stored separately with restricted access. Data storage will use encrypted institutional or organizational storage. Retention period should be defined before data collection and communicated in the consent form.

The TTI should be reported at team level. Individual-level prompt response data may be needed for analysis, but it must not be used for performance evaluation. Any publication should aggregate or anonymize examples to prevent re-identification.

Data access will be separated by role. The principal investigator may access the full approved research dataset; the data steward may access linkage and redaction files; the technical integration owner may access system logs needed for debugging but not interview material; and team representatives may review only aggregated disclosure summaries. Managers will receive team-level summaries only after aggregation and disclosure review.

## 15. Ethics and Governance

This study involves workplace communication and therefore creates privacy and power-differential risks. The following safeguards are required:

1. Participation must be voluntary and based on informed consent.
2. Team members must know which channels and artifacts are included.
3. Managers must not receive individual-level transparency or prompt-response scores.
4. AI-generated updates must be visible, source-linked, and reversible.
5. Sensitive personal content must be excluded or redacted.
6. Participants must be able to challenge or correct AI-generated records.
7. Interview participation must be separated from management evaluation.
8. Participants must be able to pause prompts, mark content sensitive, reject or edit suggested updates, request deletion of erroneous AI-generated records, and appeal contested records through a named governance route.
9. Manager-facing dashboards must exclude individual prompt-response behavior, individual transparency scores, and any ranking or comparison of named participants.

Psychological safety is both an outcome and an ethical constraint. Edmondson (1999) defines psychological safety as a shared belief that the team is safe for interpersonal risk taking. A transparency tool that makes people afraid to surface blockers would fail even if it improves documentation metrics.

### 15.1 Safety Gates and Stopping Rules

The intervention will be paused for governance review if any of the following occur:

1. Mean psychological safety drops by 0.5 or more on a five-point scale from baseline.
2. Mean raw NASA-TLX workload increases by more than 10 points from baseline.
3. Median prompt burden exceeds two prompts per participant per workday for two consecutive weeks.
4. More than 20% of participants use pause, opt-out, or mark-sensitive controls during a sprint.
5. Any participant reports perceived retaliation, coercion, or manager misuse linked to AI-mediated records.
6. Sensitive data are captured outside the approved source scope and are not remediated within the incident response window.

TTI improvement will be considered acceptable only if these safety thresholds remain within bounds. A team that improves TTI while breaching safety thresholds will be reported as a governance failure rather than an effectiveness success.

## 16. Risk Management

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Excessive prompts interrupt work | Medium | Medium | Prompt caps, batching, priority rules, pause controls, safety-gate review. |
| False positives reduce trust | Medium | Medium | Source links, confidence labels, easy rejection/editing. |
| Surveillance perception | Medium | High | Consent, team-level reporting, no individual scoring, governance review. |
| Sensitive data captured | Medium | High | Channel scoping, redaction, access controls, data minimization. |
| Tool integration failure | Medium | Medium | Pilot mapping, fallback export, manual coding sample. |
| Management misuse | Low to medium | High | Written policy forbidding individual performance use. |
| AI writeback error | Medium | Medium | Human confirmation, reversible updates, audit trail, deletion request and appeal route. |

## 17. Dissemination Plan

Findings will be disseminated as a protocol paper, a field evaluation paper after data collection, and a practitioner-oriented report for participating teams. The field evaluation report will separate confirmed findings from exploratory observations and will disclose limitations related to sample size, team context, and tool configuration.

Before recruitment, the study team will select a preregistration destination and artifact repository, such as OSF or an institutional repository, and will specify which protocol materials, de-identified analysis code, instrument templates, and non-sensitive aggregate outputs can be shared. The final field evaluation report will include a reporting checklist adapted from protocol-reporting and AI-intervention reporting guidance.

## 18. Protocol Status

This is a revised protocol draft prepared for preregistration and ethics review. It should not be treated as preregistered, ethics-approved, or implementation-ready until the following items are completed:

1. Participating organization and teams.
2. Exact tool integrations and data fields.
3. Consent language.
4. Survey instruments and permissions.
5. Prompt governance thresholds.
6. Statistical analysis plan details based on expected team count and sprint duration.

## 19. Appendix Roadmap

The final preregistration package should include the following study artifacts:

1. Consent form and participant information sheet.
2. Data source map and data dictionary.
3. TTI coding manual and adjudication guide.
4. Prompt taxonomy and prompt examples.
5. Survey items for perceived transparency, trust in AI updates, workload, and psychological safety.
6. Semi-structured interview guide.
7. Technical gold-sample coding guide.
8. Safety incident form and escalation workflow.
9. Statistical analysis plan and analysis code plan.

## 20. Stage 4 Revision Response Matrix

| Concern ID | Reviewer Source | Action Taken | Manuscript Location | Status |
| --- | --- | --- | --- | --- |
| P1-1 | R1 / EIC | Added TTI eligibility rules, component denominators, examples, stratified double coding, adjudication, and reliability progression criteria. | Sections 3, 6.5, 9.1, 11, 13.1 | Resolved |
| P1-2 | R1 | Recast the study as a two-stage program with Stage A feasibility and optional Stage B effectiveness evaluation. | Abstract, Sections 3, 4, 6.5, 13.1-13.2 | Resolved |
| P1-3 | EIC / R3 | Added intervention reproducibility requirements, prompt taxonomy, confidence bands, escalation rules, writeback constraints, and participant response options. | Sections 7.1-7.7, 11, 12.3 | Resolved |
| P1-4 | Devil's Advocate / R1 | Added manually coded technical gold sample and technical performance outcomes for extraction, linking, and conflict detection. | Sections 2.2, 7.4, 9.2, 11, 13.1-13.2 | Resolved |
| P1-5 | R3 / Devil's Advocate | Added safety gates and stopping rules for psychological safety, workload, prompt burden, opt-out behavior, surveillance complaints, and sensitive-data incidents. | Sections 3, 13.1, 15.1, 16 | Resolved |
| P1-6 | R3 | Added pause, sensitive marking, reject, edit, delete request, and appeal controls; restricted manager dashboards. | Sections 7.7, 14, 15, 16 | Resolved |
| P2-7 | R1 | Added Stage A progression criteria and made powered inference conditional on observed variance, ICC, team count, sprint count, and missingness. | Sections 4, 6.5, 13.1-13.2 | Resolved |
| P2-8 | R1 | Defined the burden threshold as no more than a 10-point raw NASA-TLX increase and median prompt burden of at most two prompts per participant per workday. | Sections 3, 6.5, 7.7, 15.1 | Resolved |
| P2-9 | R2 | Required baseline characterization of bots, summarizers, Jira automation, issue-linking practices, and dashboards. | Sections 5, 8 | Resolved |
| P2-10 | R2 | Added traceability, human-centered AI, automation misuse, and workplace monitoring literature. | Sections 1 and References | Resolved |
| P2-11 | R1 | Added missing-data and partial-consent rules for incomplete logs, survey nonresponse, and consent gaps within teams. | Sections 13.3, 14 | Resolved |

## References

Ball, K. (2021). *Electronic monitoring and surveillance in the workplace: Literature review and policy recommendations*. Publications Office of the European Union. https://doi.org/10.2760/451453

Chan, A.-W., Tetzlaff, J. M., Altman, D. G., Laupacis, A., Gotzsche, P. C., Krleza-Jeric, K., Hrobjartsson, A., Mann, H., Dickersin, K., Berlin, J. A., Dore, C. J., Parulekar, W. R., Summerskill, W. S. M., Groves, T., Schulz, K. F., Sox, H. C., Rockhold, F. W., Rennie, D., & Moher, D. (2013). SPIRIT 2013 statement: Defining standard protocol items for clinical trials. *Annals of Internal Medicine, 158*(3), 200-207. https://doi.org/10.7326/0003-4819-158-3-201302050-00583

Cinkusz, K., Chudziak, J. A., & Niewiadomska-Szynkiewicz, E. (2025). Cognitive agents powered by large language models for agile software project management. *Electronics, 14*(1), Article 87. https://doi.org/10.3390/electronics14010087

Cleland-Huang, J., Gotel, O. C. Z., Huffman Hayes, J., Mäder, P., & Zisman, A. (2014). Software traceability: Trends and future directions. *Future of Software Engineering Proceedings*, 55-69. https://doi.org/10.1145/2593882.2593891

Edmondson, A. (1999). Psychological safety and learning behavior in work teams. *Administrative Science Quarterly, 44*(2), 350-383. https://doi.org/10.2307/2666999

Hart, S. G. (2006). NASA-Task Load Index (NASA-TLX); 20 years later. *Proceedings of the Human Factors and Ergonomics Society Annual Meeting, 50*(9), 904-908. https://doi.org/10.1177/154193120605000909

Itzik, D., & Roy, G. (2023). Does agile methodology fit all characteristics of software projects? Review and analysis. *Empirical Software Engineering, 28*, Article 105. https://doi.org/10.1007/s10664-023-10334-7

Liu, X., Cruz Rivera, S., Moher, D., Calvert, M. J., Denniston, A. K., & SPIRIT-AI and CONSORT-AI Working Group. (2020). Reporting guidelines for clinical trial reports for interventions involving artificial intelligence: The CONSORT-AI extension. *Nature Medicine, 26*, 1364-1374. https://doi.org/10.1038/s41591-020-1034-x

Malla, P. (2025). Analyzing the impact of agile methodologies on software quality and delivery speed: A comparative study. *World Journal of Advanced Research and Reviews, 25*(1), 1207-1216. https://doi.org/10.30574/wjarr.2025.25.1.0184

Parasuraman, R., & Riley, V. (1997). Humans and automation: Use, misuse, disuse, abuse. *Human Factors, 39*(2), 230-253. https://doi.org/10.1518/001872097778543886

Shneiderman, B. (2020). Human-centered artificial intelligence: Reliable, safe & trustworthy. *International Journal of Human-Computer Interaction, 36*(6), 495-504. https://doi.org/10.1080/10447318.2020.1741118

Stray, V., Moe, N. B., & Bergersen, G. R. (2017). Are daily stand-up meetings valuable? A survey of developers in software teams. In H. Baumeister, H. Lichter, & M. Riebisch (Eds.), *Agile Processes in Software Engineering and Extreme Programming* (pp. 274-281). Springer. https://doi.org/10.1007/978-3-319-57633-6_20

Stray, V., Moe, N. B., & Sjoberg, D. I. K. (2020). Daily stand-up meetings: Start breaking the rules. *IEEE Software, 37*(3), 70-77. https://doi.org/10.1109/MS.2018.2875988

Stray, V., Sjoberg, D. I. K., & Dyba, T. (2016). The daily stand-up meeting: A grounded theory study. *Journal of Systems and Software, 114*, 101-124. https://doi.org/10.1016/j.jss.2016.01.004

Umar, M. A. M. A., Lano, K., & Abubakar, A. K. (2025). Automated requirements engineering framework for agile model-driven development. *Frontiers in Computer Science, 7*, Article 1537100. https://doi.org/10.3389/fcomp.2025.1537100

Verwijs, C., & Russo, D. (2024). Do Agile scaling approaches make a difference? An empirical comparison of team effectiveness across popular scaling approaches. *Empirical Software Engineering, 29*, Article 75. https://doi.org/10.1007/s10664-024-10481-5
