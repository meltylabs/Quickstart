# Transparency Drift in Human-AI Software Teams: A Confidence-Aware Team Transparency Index

## Abstract

**Background:** Software teams increasingly coordinate work through human communication, project-management artifacts, code repositories, code reviews, and AI-generated updates. Coding agents and AI assistants can generate pull requests, issue comments, documentation, summaries, and decision records. These artifacts can make a project appear more complete and traceable even when human review, shared understanding, and accountability are weakening.

**Objective:** This paper introduces CA-TTI, a confidence-aware Team Transparency Index for conceptualizing and flagging possible transparency drift in human-AI software teams. Transparency drift is defined as a growing divergence between visible project artifacts and the human team's shared understanding, review depth, and ability to explain or control the work being produced.

**Methods:** We revise an earlier Team Transparency Index based on coverage, consistency, consensus, timeliness, and completeness. CA-TTI preserves these artifact-oriented components but changes the output from a single score into a multi-signal framework: artifact score, confidence, trend state, and Human-Agent Alignment Gap (HAG). HAG is treated as a family of alignment indicators, not as a single validated latent variable. We evaluate initial measurement behavior using a synthetic stress test across five controlled scenarios.

**Results:** In the synthetic prototype, the raw TTI rule did not flag the designed warning cases in artifact drift and fluent hallucination scenarios. The CA-TTI prototype warning rules flagged all such trials, with mean warning lead times of 3.0 steps for artifact drift and 1.5 steps for fluent hallucination. In a noisy-interaction scenario without designed artifact failure, raw TTI warned in 7 of 8 trials, while CA-TTI produced no warnings. Ablation checks on the same synthetic observations indicated that removing trend logic substantially reduced warning lead time in the two designed warning scenarios.

**Conclusion:** CA-TTI is proposed as an early-warning measurement framework, not as a validated productivity metric or validated field index. Its central claim is that transparency in human-AI software teams should be interpreted as a multi-signal condition. Artifact completeness can improve while shared human understanding declines. Future work should implement event-level datasets, test inter-rater reliability, run sensitivity analyses, compare external baselines, and validate the framework in real teams.

**Keywords:** human-AI software teams; team transparency; AI agents; software traceability; Agile software development; shared mental models; measurement framework; transparency drift

## 1. Introduction

Software teams do not coordinate only through formal records. They rely on stand-up meetings, chat threads, issue trackers, pull requests, code reviews, release notes, documentation, and informal memory. These sources create a distributed picture of work. A decision may begin in a meeting, be clarified in chat, appear indirectly in a pull request, and never be reflected in the issue tracker. This fragmentation creates a persistent gap between what the team informally knows and what the project system formally records.

Earlier versions of the Team Transparency Index (TTI) were designed to measure whether communication, project artifacts, and confirmed team knowledge were aligned. The original use case was an AI mediator for Agile teams: a conversational system would ingest stand-ups, chat, issue data, and Git metadata; extract candidate decisions and action items; detect mismatches; and request role-aware confirmation before writing back to the project record. In that framing, TTI was mainly an outcome measure for evaluating whether the mediator improved transparency.

The rise of coding agents changes the measurement problem. AI systems no longer only summarize or remind. They can generate code, open pull requests, update issues, draft documentation, propose decisions, and produce fluent explanations. Evidence from AI pair-programming and agentic code-review research suggests that AI systems are becoming part of everyday software workflows, although their contributions, adoption patterns, and review needs differ from human work (Peng et al., 2023; Zhong et al., 2026). This can improve visible traceability, but it can also create a new kind of transparency failure. The artifact layer may become more complete while the team loses human understanding, review depth, accountability, or trust.

This paper calls that proposed failure mode **transparency drift**: a gradual divergence between visible project artifacts and the shared understanding of the human team. Transparency drift matters because artifact fluency can look like coordination. A project may show more comments, cleaner issue records, faster summaries, and more complete decision logs while team members are less able to explain why decisions were made, who endorsed them, whether AI-generated changes were deeply reviewed, or how errors should be corrected.

The central contribution of this paper is CA-TTI, a confidence-aware measurement framework for human-AI software teams. The framework is not a validated field index yet. It is a conceptual and methodological proposal supported by synthetic stress-test evidence. The key shift is:

```text
CA-TTI = artifact score + confidence + trend state + Human-Agent Alignment Gap
```

CA-TTI is not intended to replace human judgment or rank individuals. It is an early-warning framework for team-level inquiry. Its purpose is to show when an apparently orderly system may be drifting away from shared human understanding.

## 2. Related Work and Positioning

CA-TTI sits between four research streams: Agile coordination, software traceability, human-AI teaming, and governance of workplace monitoring.

Agile software development depends on frequent communication and shared context. Daily stand-up meetings can support awareness, coordination, and monitoring, but prior work also shows that their value depends on team context and meeting quality (Stray et al., 2016, 2017, 2020). Agile transparency therefore cannot be inferred from the presence of ceremonies alone.

Traceability research raises a parallel issue. Software traceability is valuable, but it is often created ad hoc and after the fact, which limits its practical benefit (Cleland-Huang et al., 2014). Socio-technical congruence research similarly links coordination needs to actual coordination patterns in software teams (Cataldo et al., 2008). These literatures show that software transparency is not only a documentation problem. It is a relationship between work dependencies, communication, records, and shared understanding.

Code review adds a further signal. Code review is not merely a gate for defect detection. It also supports knowledge transfer, maintainability, and shared standards; developers judge review quality through factors such as feedback usefulness, clarity, and reviewer expertise (Kononenko et al., 2016). When AI agents participate in code review, the question is not only whether feedback is syntactically correct, but whether humans still understand, contest, and integrate that feedback in meaningful ways.

Human-AI teaming research provides the theoretical bridge. Human-AI teams require more than a tool-user relationship; they require coordination around shared goals, roles, communication, trust, and team cognition (Berretta et al., 2023). Shared mental models are especially relevant because a team can coordinate effectively only when members maintain compatible expectations about tasks, roles, and system behavior (Andrews et al., 2023). Empirical work on human-agent teams also suggests that communication, explicitly shared goals, trust, and perceived team cognition shape performance and collaboration (Schelble et al., 2022).

AI-supported project work adds another layer. Recent work on requirements engineering, cognitive agents, and Agile project-management support suggests that AI and machine-learning systems can extract structured requirements information and simulate or support Agile project-management roles (Cinkusz et al., 2025; Umar et al., 2025). Human-centered AI research warns that useful automation must preserve human control, safety, and trust (Shneiderman, 2020). Workplace surveillance research adds a governance concern: measurement systems can become instruments of monitoring and pressure if they expose individual behavior without appropriate safeguards (Ball, 2021).

These strands suggest a measurement problem rather than only a tool-building problem. The question is not simply whether AI can produce more complete project artifacts. The harder question is whether a team remains genuinely transparent when AI participates in producing those artifacts.

## 3. Construct Boundary: What CA-TTI Measures

This paper uses transparency in a team-level, socio-technical sense. It does not equate transparency with explainability of an AI model or with the number of project artifacts. Four forms of transparency are relevant:

| Transparency form | Question | Example signal |
| --- | --- | --- |
| Artifact transparency | Are project records linked, current, and complete? | Issue, pull request, commit, and decision-record links |
| Process transparency | Is it clear how work moved from discussion to decision to implementation? | Trace from meeting or chat decision to implementation artifact |
| Epistemic transparency | Can affected humans explain and challenge the work? | Human review depth, confirmation, correction, and shared explanation |
| Governance transparency | Are provenance, access, consent, and accountability clear? | AI provenance labels, appeal paths, access rules |

CA-TTI is designed for the intersection of these forms. The original artifact-oriented TTI mostly measured artifact transparency. CA-TTI keeps that core but adds confidence, trend, and HAG so that artifact improvement is not mistaken for full team transparency.

The intended use is a team-level diagnostic and audit protocol. It can feed a dashboard, but the dashboard is not the primary contribution. The primary contribution is an interpretation rule: CA-TTI warnings should trigger team inquiry, not sanctions or individual performance assessment. A team uses the index to ask: "Do our artifacts still reflect what we jointly understand, review, and control?"

## 4. From Artifact Transparency to Confidence-Aware Transparency

### 4.1 Original Artifact-Oriented TTI: Artifact Transparency

The original TTI used five components:

```text
TTI = 0.25*COV + 0.25*CON + 0.20*CSN + 0.15*TML + 0.15*CMP
```

| Component | Meaning |
| --- | --- |
| COV | Coverage: eligible communication-mentioned tasks or decisions linked to an issue, pull request, Git artifact, or decision record. |
| CON | Consistency: status, ownership, blocker, and decision claims match structured records or are explicitly reconciled. |
| CSN | Consensus: high-impact decisions meet predefined role-confirmation thresholds before writeback. |
| TML | Timeliness: documented updates occur soon enough after the relevant event. |
| CMP | Completeness: action items and decisions include required metadata such as who, what, and when. |

This score is useful because it makes artifact transparency operational. However, it remains vulnerable to two problems. First, the score can become overconfident under sparse or uneven data. If only one source is available, a clean-looking score may reflect missing evidence rather than real alignment. Second, the score can reward documentation hygiene even when human alignment is weakening. AI agents may improve links, summaries, and completeness while reducing review depth or obscuring responsibility.

### 4.2 CA-TTI: Multi-Signal Transparency

CA-TTI keeps the five artifact components but changes the output format. Instead of returning a single score, it returns four signals:

```text
artifact_score
confidence
trend_state
human_agent_alignment_gap
```

The artifact score answers whether visible project records are linked, consistent, confirmed, timely, and complete. Confidence answers how much evidence supports that score. Trend state answers whether the system is improving, stable, deteriorating, noisy, or insufficiently observed. The Human-Agent Alignment Gap answers whether AI-generated artifacts remain aligned with human understanding, review, endorsement, and control.

This separation matters because the same artifact score can have different meanings. A high artifact score with high confidence and low HAG is a strong signal. A high artifact score with low confidence is fragile. A high artifact score with rising HAG is the core risk case: artifacts look clean while shared understanding deteriorates.

### 4.3 Signal Flow

```text
team events
  -> communication, issues, pull requests, reviews, decisions, AI actions
  -> artifact score / confidence / trend / HAG
  -> warning state
  -> team inquiry and governance response
```

CA-TTI therefore should not be read as a scalar ranking. It is a bundle of diagnostic signals. The warning state is useful only if the team investigates the underlying components.

## 5. Human-Agent Alignment Gap

The Human-Agent Alignment Gap (HAG) is the distance between what agents produce or record and what the human team has actually reviewed, endorsed, understood, or accepted.

HAG is not an anti-AI measure. It does not treat agent participation as harmful by default. It asks whether AI contribution is growing faster than the team's capacity for review, confirmation, and shared understanding.

HAG should be treated as a family of subdimensions:

| HAG subdimension | Definition | Observable indicator | Current prototype coverage |
| --- | --- | --- | --- |
| Confirmation debt | AI-created or AI-modified claims lack explicit human confirmation. | Unconfirmed decision records, auto-updated tickets, unendorsed summaries | Partial |
| Review-depth gap | AI-generated work receives shallower review than comparable human work. | Review rounds, comment depth, test discussion, reviewer expertise | Not yet implemented |
| Attribution ambiguity | The team cannot tell whether a claim came from a human, an agent, or a mixed process. | Missing provenance label, unclear author chain | Not yet implemented |
| Explanation gap | Affected humans cannot explain why a decision or change was made. | Post-hoc explanation checks, reviewer challenge outcomes | Not yet implemented |
| Correction gap | AI-generated artifacts require more correction, revert, or clarification. | Reverts, follow-up corrections, rejected suggestions | Partial |
| Trust and safety divergence | Artifacts improve while trust, psychological safety, or willingness to challenge declines. | Team survey or retrospective signal | Not yet implemented |

The current synthetic prototype does not implement full HAG. It implements a narrower `hag_proxy`, a hallucination-alignment proxy derived from unsupported claims, confidence-artifact mismatch, and missing evidence. This is a useful first stress-test component, but it should not be interpreted as a complete operationalization of human-agent alignment.

## 6. Synthetic Stress-Test Design

The present draft uses a synthetic stress test to inspect whether CA-TTI behaves sensibly under controlled, author-designed warning conditions. This is not a field validation study. It is a measurement-behavior test.

The prototype compared a raw TTI-like score against a CA-TTI score. The generator produced 8 trials and 10 steps for each of five scenarios, yielding 400 trajectory-level observations. Each row included:

```text
scenario
trial_id
step
raw_tti
artifact_score
confidence
unsupported_claim_rate
evidence_coverage
actual_quality
failure_label
```

The scenarios were:

| Scenario | Purpose |
| --- | --- |
| Clean baseline | Raw TTI and artifact-centered signals should agree. |
| Artifact drift | Designed case where artifact quality deteriorates before interaction quality visibly fails. |
| Fluent hallucination | Output remains fluent and confident while artifact quality and evidence coverage collapse. |
| Low-confidence good artifacts | Useful artifacts exist but system confidence is muted. |
| Noisy interaction with stable artifacts | Interaction-level noise should not be treated as artifact failure. |

The prototype scorer computed trend from a four-step artifact-history window. A negative artifact slope reduced the trend score; fewer than four observations defaulted to a neutral trend score. The prototype `hag_proxy` combined unsupported-claim rate, confidence-artifact mismatch, and evidence-coverage gap:

```text
hag_proxy =
  0.52 * unsupported_claim_rate
+ 0.30 * max(0, confidence - artifact_score)
+ 0.18 * max(0, 1 - evidence_coverage)
```

Confidence was calibrated downward when `hag_proxy` rose:

```text
calibrated_confidence = confidence * (1 - 0.65 * hag_proxy)
```

The prototype CA-TTI score was:

```text
ca_tti_score =
  0.45 * artifact_score
+ 0.20 * calibrated_confidence
+ 0.20 * trend_score
+ 0.15 * (1 - hag_proxy)
```

Warnings were generated when:

```text
ca_tti_score < 0.58
or hag_proxy >= 0.42
or trend_score <= 0.42
```

For transparency, the raw baseline used the same numeric warning threshold for the raw TTI-like score:

```text
raw_tti < 0.58
```

These weights and thresholds were chosen as prototype stress-test settings, not as validated field cutoffs. A deployed system would require calibration by domain, team workflow, and evidence availability. The present results should therefore be read as behavior of one specified prototype configuration, not as evidence that the selected weights or cutoffs are optimal.

## 7. Synthetic Results

The results are summarized below.

| Scenario | Designed Warning Trials | Raw Warn Trials | CA-TTI Warn Trials | Mean CA-TTI Lead |
| --- | ---: | ---: | ---: | ---: |
| Artifact drift | 8/8 | 0/8 | 8/8 | 3.0 steps |
| Fluent hallucination | 8/8 | 0/8 | 8/8 | 1.5 steps |
| Clean baseline | 0/8 | 0/8 | 0/8 | n/a |
| Low-confidence good artifacts | 0/8 | 1/8 | 0/8 | n/a |
| Noisy interaction with stable artifacts | 0/8 | 7/8 | 0/8 | n/a |

In the two designed warning scenarios, raw TTI did not warn, while CA-TTI warned in every trial under the prototype rules. In the noisy but stable scenario, raw TTI produced warnings in most trials, while CA-TTI produced none. In the low-confidence good-artifact scenario, CA-TTI did not treat low confidence alone as failure when artifacts and evidence remained strong.

An ablation check using the same scored observations suggests that trend logic contributed substantially to early warning in this prototype. Removing HAG did not change warning counts in this small synthetic test, but removing trend reduced lead time below the designed warning point in both warning scenarios. The check is preliminary because it was not pre-registered and uses the same synthetic data.

| Designed warning scenario | Full CA-TTI lead | No HAG lead | No trend lead | Artifact-only lead |
| --- | ---: | ---: | ---: | ---: |
| Artifact drift | 3.0 | 3.0 | -0.25 | 1.0 |
| Fluent hallucination | 1.5 | 1.5 | -0.88 | 0.25 |

These results support only a bounded claim: separating artifact score, confidence calibration, trend, and alignment-gap signals can make author-designed synthetic warning modes visible under one prototype configuration. They do not establish construct validity, external validity, comparative superiority, or real-world predictive accuracy.

## 8. Use, Misuse, and Deployment Vignette

CA-TTI should be used as a team-level diagnostic and early-warning framework. It should not be used to score individual developers, rank teams, or evaluate personal performance. Such use would distort behavior and create surveillance risk.

The governance rule is:

```text
A team should not be considered more transparent if artifact transparency improves while psychological safety, trust, or human-agent alignment declines.
```

Practical deployment requires safeguards:

1. Report CA-TTI at the team level, not the individual level.
2. Separate artifact score from confidence, trend, and HAG.
3. Preserve provenance for AI-created or AI-modified records.
4. Require explicit human confirmation for high-impact decisions.
5. Treat psychological safety and workload as hard governance constraints.
6. Allow participants to challenge, correct, or reverse AI-mediated records.
7. Avoid manager-facing dashboards that expose individual prompt behavior.
8. Retain raw event data only as long as needed for team-level audit.
9. Treat warnings as inquiry triggers, not sanctions.

A safe deployment vignette illustrates the intended use. During a sprint review, a team sees that artifact score has risen from 0.71 to 0.84 because more pull requests, issue links, and decision records are present. Confidence is moderate, but HAG is rising because several agent-generated summaries were accepted without review and developers cannot explain the rationale behind two decisions. The correct response is not to identify a low-performing developer. The correct response is a team inquiry: review which AI-generated records require confirmation, add provenance labels, ask affected developers to explain or revise the decision records, and adjust review policy for future agent-generated changes.

This use case also shows how gaming should be handled. A team could try to increase confirmations without improving understanding. CA-TTI therefore should not reward confirmation count alone. Confirmation must be linked to review depth, provenance, correction rights, and the ability of affected humans to challenge the record.

## 9. Discussion

The shift from an artifact-oriented index to CA-TTI changes the paper's contribution. The original contribution was a protocol for evaluating a conversational AI mediator. The revised contribution is a measurement framework for human-AI software teams.

This change makes the paper more durable. Tool designs will change quickly as AI agents evolve. A measurement problem will remain: how can teams know whether AI participation is improving shared transparency or merely improving the appearance of traceability?

CA-TTI addresses that problem by refusing to compress transparency into one score. A high artifact score with low confidence should not be interpreted like a high artifact score with rich evidence. A high artifact score with rising HAG should not be interpreted as success. A temporary noisy transition should not be treated like confirmed transparency decline. These distinctions are the main value of the framework.

The framework also clarifies how future validation should proceed. A field study should not only ask whether CA-TTI increases during an intervention. It should ask whether CA-TTI predicts cases where teams report lower alignment, lower trust, lower psychological safety, or weaker shared mental models despite improved artifact completeness.

## 10. Limitations

This paper has six major limitations.

First, the synthetic data are not real Agile data. They test measurement behavior under designed scenarios but cannot establish construct validity.

Second, the current prototype is trajectory-level rather than event-level. A fuller version should generate or collect event-level data with fields such as event type, source, actor type, linked artifact, confirmation status, delay, metadata completeness, review depth, autonomy level, correction events, trust signal, psychological safety signal, and missingness flag.

Third, HAG is only partially operationalized in the current prototype. The implemented `hag_proxy` focuses on unsupported claims and confidence-evidence mismatch. The broader construct should include review depth, confirmation debt, attribution ambiguity, correction/revert rate, explanation gap, trust decline, and psychological safety decline.

Fourth, the thresholds used in this prototype are not validated field cutoffs. They are stress-test settings. Real deployment would require calibration, sensitivity analysis, and stakeholder review.

Fifth, the prototype has not yet been compared against independent external baselines. The raw TTI comparison is useful for showing how the revised design differs from the earlier artifact-oriented score, but it is not sufficient for a strong comparative claim.

Sixth, the literature base is stronger than in the initial draft but still selective. A full journal submission should include a broader review of AI coding agents, team cognition measurement, software repository mining, and responsible workplace AI governance.

## 11. Future Work

Future work should proceed in three stages.

First, improve the synthetic generator so it produces event-level software-team records rather than only trajectories. This would make the metric easier to explain and closer to the eventual field setting.

Second, conduct coder-based plausibility review. Human reviewers should inspect generated scenarios and judge whether the synthetic events plausibly represent healthy teams, documentation-only improvement, human-agent drift, noisy transition, and true transparency decline. Inter-rater reliability should be reported.

Third, run a small field feasibility study. The goal should not be causal proof. The goal should be to test whether CA-TTI can be computed reliably, whether HAG can be coded consistently, and whether team members find the outputs meaningful rather than intrusive. This study should include independent baselines and sensitivity analysis for the proposed weights and warning thresholds.

## 12. Conclusion

Human-AI software teams need a way to detect transparency drift before it becomes visible as project failure. Raw artifact scores are not enough because AI agents can improve the visible record while weakening shared human understanding. CA-TTI responds by separating artifact transparency, confidence, trend, and Human-Agent Alignment Gap.

The first synthetic stress test supports the plausibility of this framing. Under the prototype warning rules, CA-TTI flagged designed artifact drift and fluent hallucination scenarios that raw TTI did not flag, while avoiding warnings in noisy but stable conditions. Ablation checks suggest that trend logic is important for early warning in the current prototype. These findings are preliminary, but they show why a single transparency score may be insufficient for human-AI software teams.

CA-TTI should therefore be understood as an early-warning measurement framework. Its purpose is not to declare that a team is productive or well-managed. Its purpose is to ask whether the team still understands, reviews, confirms, and controls the work that humans and agents are producing together.

## Declarations

### Data Availability

The synthetic stress-test outputs used in this manuscript are available in the accompanying project experiment output directory. The current manuscript reports only synthetic measurement-behavior results and does not include human-subject data.

### Funding

No external funding is declared for this manuscript draft.

### Conflicts of Interest

The author declares no conflicts of interest for this manuscript draft.

### AI Disclosure

This paper was prepared with the assistance of AI-powered academic writing tools. The AI pipeline included research framing, structure planning, draft writing, reviewer simulation, revision planning, citation verification, integrity checking, and formatting support. All content, arguments, and conclusions were directed and reviewed by the author. The author takes full responsibility for the accuracy and integrity of this work.

## References

Andrews, R. W., Lilly, J. M., Srivastava, D., & Feigh, K. M. (2023). The role of shared mental models in human-AI teams: A theoretical review. *Theoretical Issues in Ergonomics Science, 24*(2), 129-175. https://doi.org/10.1080/1463922X.2022.2061080

Ball, K. (2021). *Electronic monitoring and surveillance in the workplace: Literature review and policy recommendations*. Publications Office of the European Union. https://doi.org/10.2760/5137

Berretta, S., Tausch, A., Ontrup, G., Gilles, B., Peifer, C., & Kluge, A. (2023). Defining human-AI teaming the human-centered way: A scoping review and network analysis. *Frontiers in Artificial Intelligence, 6*, Article 1250725. https://doi.org/10.3389/frai.2023.1250725

Cataldo, M., Herbsleb, J. D., & Carley, K. M. (2008). Socio-technical congruence. In *Proceedings of the Second ACM-IEEE International Symposium on Empirical Software Engineering and Measurement* (pp. 2-11). ACM. https://doi.org/10.1145/1414004.1414008

Cinkusz, K., Chudziak, J. A., & Niewiadomska-Szynkiewicz, E. (2025). Cognitive agents powered by large language models for agile software project management. *Electronics, 14*(1), Article 87. https://doi.org/10.3390/electronics14010087

Cleland-Huang, J., Gotel, O. C. Z., Huffman Hayes, J., Mäder, P., & Zisman, A. (2014). Software traceability: Trends and future directions. In *Future of Software Engineering Proceedings* (pp. 55-69). ACM. https://doi.org/10.1145/2593882.2593891

Kononenko, O., Baysal, O., & Godfrey, M. W. (2016). Code review quality. In *Proceedings of the 38th International Conference on Software Engineering* (pp. 1028-1038). ACM. https://doi.org/10.1145/2884781.2884840

Peng, S., Kalliamvakou, E., Cihon, P., & Demirer, M. (2023). *The impact of AI on developer productivity: Evidence from GitHub Copilot*. arXiv. https://arxiv.org/abs/2302.06590

Schelble, B. G., Flathmann, C., McNeese, N. J., Freeman, G., & Mallick, R. (2022). Let's think together! Assessing shared mental models, performance, and trust in human-agent teams. *Proceedings of the ACM on Human-Computer Interaction, 6*(GROUP), Article 13, 1-29. https://doi.org/10.1145/3492832

Shneiderman, B. (2020). Human-centered artificial intelligence: Reliable, safe & trustworthy. *International Journal of Human-Computer Interaction, 36*(6), 495-504. https://doi.org/10.1080/10447318.2020.1741118

Stray, V., Moe, N. B., & Bergersen, G. R. (2017). Are daily stand-up meetings valuable? A survey of developers in software teams. In H. Baumeister, H. Lichter, & M. Riebisch (Eds.), *Agile Processes in Software Engineering and Extreme Programming* (pp. 274-281). Springer. https://doi.org/10.1007/978-3-319-57633-6_20

Stray, V., Moe, N. B., & Sjoberg, D. I. K. (2020). Daily stand-up meetings: Start breaking the rules. *IEEE Software, 37*(3), 70-77. https://doi.org/10.1109/MS.2018.2875988

Stray, V., Sjøberg, D. I. K., & Dybå, T. (2016). The daily stand-up meeting: A grounded theory study. *Journal of Systems and Software, 114*, 101-124. https://doi.org/10.1016/j.jss.2016.01.004

Umar, M. A., Lano, K., & Abubakar, A. K. (2025). Automated requirements engineering framework for agile model-driven development. *Frontiers in Computer Science, 7*, Article 1537100. https://doi.org/10.3389/fcomp.2025.1537100

Zhong, S., Noei, S., Zou, Y., & Adams, B. (2026). *Human-AI synergy in agentic code review*. arXiv. https://arxiv.org/abs/2603.15911
