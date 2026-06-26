# Transparency Drift in Human-AI Software Teams: A Confidence-Aware Team Transparency Index

## Material Passport

- Origin Skill: academic-pipeline
- Pipeline Entry Point: Stage 2 WRITE
- Origin Date: 2026-06-26
- Verification Status: STAGE 2.5 PRE-REVIEW AUDITED / CORRECTIONS APPLIED / FIELD VALIDITY PENDING
- Document Label: CA-TTI draft manuscript
- Source Materials: `Aidaily_final_manuscript.md`, `.context/ca_tti_synthetic_validation_plan.md`, `.context/ca_tti_synthetic_output_review.md`, and San Diego synthetic experiment output.

## Abstract

**Background:** Software teams increasingly coordinate work through a mixture of human communication, project-management artifacts, code repositories, and AI-generated updates. AI agents can produce pull requests, summaries, issue comments, decision records, and status updates that make the visible artifact layer appear more complete. However, artifact completeness does not necessarily mean that a team has preserved shared understanding, human review, trust, or psychological safety. A team may look more transparent while becoming less aligned.

**Objective:** This paper introduces CA-TTI, a confidence-aware Team Transparency Index for detecting transparency drift in human-AI software teams. Rather than treating transparency as a single score, CA-TTI separates artifact transparency, confidence, temporal trend, and the Human-Agent Alignment Gap (HAG).

**Methods:** We extend an earlier Team Transparency Index based on coverage, consistency, consensus, timeliness, and completeness. CA-TTI preserves these five artifact-oriented components but adds confidence calibration, trend-sensitive warning logic, and HAG as a separate signal for cases where AI-generated artifacts outpace human confirmation, review, or shared understanding. We evaluate the measurement behavior using synthetic stress tests that compare a raw TTI-like score against CA-TTI across scenarios including clean baseline behavior, artifact drift, fluent hallucination, low-confidence but good artifacts, and noisy interaction with stable artifacts.

**Results:** In the synthetic prototype, raw TTI missed all warning cases in artifact drift and fluent hallucination scenarios. CA-TTI warned in all such trials, with mean warning lead times of 3.0 steps for artifact drift and 1.5 steps for fluent hallucination. In a noisy-interaction scenario without true artifact failure, raw TTI produced warnings in 7 of 8 trials, while CA-TTI produced no warnings. These results do not establish real-world validity, but they show that separating score, confidence, trend, and human-agent alignment can expose failure modes that a single score can miss.

**Conclusion:** CA-TTI is proposed as an early-warning measurement framework, not as a universal productivity score. Its central claim is that transparency in human-AI software teams must be interpreted as a multi-signal condition: visible artifacts may improve while shared human understanding declines. Future work should implement event-level datasets, test inter-rater reliability, and validate the index in real software teams.

**Keywords:** human-AI software teams; team transparency; AI agents; software traceability; Agile software development; measurement model; synthetic validation; transparency drift

## 1. Introduction

Software teams do not coordinate only through formal records. They rely on stand-up meetings, chat threads, issue trackers, pull requests, code reviews, release notes, and informal memory. These sources create a distributed picture of work. A decision may begin in a meeting, be clarified in chat, appear indirectly in a pull request, and never be reflected in the issue tracker. This fragmentation creates a persistent gap between what the team informally knows and what the project system formally records.

Earlier versions of the Team Transparency Index (TTI) were designed to measure whether communication, project artifacts, and confirmed team knowledge were aligned. The original use case was an AI mediator for Agile teams: a conversational system would ingest stand-ups, chat, issue data, and Git metadata; extract candidate decisions and action items; detect mismatches; and request role-aware confirmation before writing back to the project record. In that framing, TTI was mainly an outcome measure for evaluating whether the mediator improved transparency.

The rise of coding agents changes the measurement problem. AI systems no longer only summarize or remind. They can generate code, open pull requests, update issues, draft documentation, propose decisions, and produce fluent explanations. This can improve visible traceability, but it can also create a new kind of transparency failure. The artifact layer may become more complete while the team loses human understanding, review depth, accountability, or trust.

This paper calls that failure mode **transparency drift**: a gradual divergence between visible project artifacts and the shared understanding of the human team. Transparency drift matters because artifact fluency can look like coordination. A project may show more comments, cleaner issue records, faster summaries, and more complete decision logs while team members are less able to explain why decisions were made, who endorsed them, whether AI-generated changes were deeply reviewed, or how errors should be corrected.

The central contribution of this paper is CA-TTI, a revised measurement framework for human-AI software teams. The key shift is simple:

```text
CA-TTI = artifact score + confidence + trend + Human-Agent Alignment Gap
```

CA-TTI is not intended to replace human judgment or rank individuals. It is an early-warning framework for team-level transparency. Its purpose is to show when an apparently orderly system may be drifting away from shared human understanding.

## 2. Background and Motivation

Agile software development depends on frequent communication and shared context. Daily stand-up meetings can support awareness, coordination, and monitoring, but prior work also shows that their value depends on team context and meeting quality (Stray et al., 2016, 2017, 2020). Agile transparency therefore cannot be inferred from the presence of ceremonies alone.

Traceability research raises a parallel issue. Software traceability is valuable, but it is often created ad hoc and after the fact, which limits its practical benefit (Cleland-Huang et al., 2014). A team can have many artifacts and still lack a reliable chain from discussion to decision to implementation. Conversely, informal understanding may exist but remain invisible to the project record.

AI-supported project work adds another layer. Recent work on requirements engineering, AI agents, and Agile project-management support suggests that AI and machine-learning systems can extract structured requirements information and simulate or support Agile project-management roles (Cinkusz et al., 2025; Umar et al., 2025). Human-centered AI research also warns that useful automation must preserve human control, safety, and trust (Shneiderman, 2020). Workplace surveillance research adds a governance concern: measurement systems can become instruments of monitoring and pressure if they expose individual behavior without appropriate safeguards (Ball, 2021).

These strands suggest a measurement problem rather than only a tool-building problem. The question is not simply whether AI can produce more complete project artifacts. The harder question is whether a team remains genuinely transparent when AI participates in producing those artifacts.

## 3. From the original artifact-oriented TTI to CA-TTI

### 3.1 Original Artifact-Oriented TTI: Artifact Transparency

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

This score is useful because it makes artifact transparency operational. However, it remains vulnerable to two problems.

First, the score can become overconfident under sparse or uneven data. If only one source is available, a clean-looking score may reflect missing evidence rather than real alignment.

Second, the score can reward documentation hygiene even when human alignment is weakening. AI agents may improve links, summaries, and completeness while reducing review depth or obscuring responsibility.

### 3.2 CA-TTI: Multi-Signal Transparency

CA-TTI keeps the five artifact components but changes the output format. Instead of returning a single score, it returns four signals:

```text
artifact_score
confidence
trend_state
human_agent_alignment_gap
```

The artifact score answers: Are the visible project records linked, consistent, confirmed, timely, and complete?

Confidence answers: How much evidence supports the score? Confidence should fall when event counts are low, source coverage is partial, consent gaps are large, coder reliability is unknown, or tool streams are missing.

Trend state answers: Is the system improving, stable, deteriorating, noisy, or insufficiently observed? Trend matters because transparency problems often appear gradually. A single sprint can be noisy; repeated deterioration is more informative.

The Human-Agent Alignment Gap answers: Are AI-generated artifacts still aligned with human understanding, review, and control?

## 4. Human-Agent Alignment Gap

The Human-Agent Alignment Gap (HAG) is the distance between what agents produce or record and what the human team has actually reviewed, endorsed, understood, or accepted.

HAG is not an anti-AI measure. It does not treat agent participation as harmful by default. It asks whether AI contribution is growing faster than the team's capacity for review, confirmation, and shared understanding.

Examples of high-HAG situations include:

- AI-generated updates are written without explicit human confirmation.
- Pull requests created by agents are merged after shallow review.
- Decision records are produced by an agent but cannot be explained by the affected team members.
- Correction or revert rates increase on AI-generated artifacts.
- Attribution becomes unclear: the team cannot tell whether a claim came from a human, an agent, or a mixed process.
- Documentation improves while trust or psychological safety declines.

HAG should initially remain separate from the artifact score. Combining it too early into one final number would hide the most important interpretive distinction. A team can have high artifact transparency and high HAG at the same time. That combination is exactly the risk case this paper aims to detect.

## 5. Synthetic Stress-Test Design

The present draft uses a synthetic stress test to evaluate whether CA-TTI behaves sensibly under controlled failure modes. This is not a field validation study. It is a measurement behavior test.

The prototype compared a raw TTI-like score against a CA-TTI score. The synthetic generator produced trajectories for five scenarios:

| Scenario | Purpose |
| --- | --- |
| Clean baseline | Raw TTI and artifact-centered signals should agree. |
| Artifact drift | Artifact quality deteriorates before interaction quality visibly fails. |
| Fluent hallucination | Output remains fluent and confident while artifact quality and evidence coverage collapse. |
| Low-confidence good artifacts | Useful artifacts exist but system confidence is muted. |
| Noisy interaction with stable artifacts | Interaction-level noise should not be treated as artifact failure. |

The implemented prototype used trajectory-level observations rather than full event-level Agile records. Each row included:

```text
raw_tti
artifact_score
confidence
unsupported_claim_rate
evidence_coverage
actual_quality
failure_label
```

The prototype scorer computed:

```text
ca_tti_score =
  0.45 * artifact_score
+ 0.20 * calibrated_confidence
+ 0.20 * trend_score
+ 0.15 * (1 - hag)
```

Warnings were generated when:

```text
ca_tti_score < 0.58
or hag >= 0.42
or trend_score <= 0.42
```

In the implementation, `hag` was operationalized narrowly as a hallucination-amplification gap derived from unsupported claims, confidence-artifact mismatch, and missing evidence. In the broader paper model, this should be treated as one subtype of Human-Agent Alignment Gap rather than the full construct.

## 6. Synthetic Results

The first synthetic run used 8 trials and 10 steps per scenario, producing 400 trajectory-level observations. The results are summarized below.

| Scenario | Failure Trials | Raw Warn Trials | CA-TTI Warn Trials | Mean CA-TTI Lead |
| --- | ---: | ---: | ---: | ---: |
| Artifact drift | 8/8 | 0/8 | 8/8 | 3.0 steps |
| Fluent hallucination | 8/8 | 0/8 | 8/8 | 1.5 steps |
| Clean baseline | 0/8 | 0/8 | 0/8 | n/a |
| Low-confidence good artifacts | 0/8 | 1/8 | 0/8 | n/a |
| Noisy interaction with stable artifacts | 0/8 | 7/8 | 0/8 | n/a |

These results support the behavioral premise of CA-TTI. In the two failure scenarios, raw TTI did not warn at all, while CA-TTI warned in every trial. In the noisy but stable scenario, raw TTI produced warnings in most trials, while CA-TTI produced none. In the low-confidence good-artifact scenario, CA-TTI did not treat low confidence alone as failure when artifacts and evidence remained strong.

The results should be interpreted cautiously. The generator was intentionally constructed to test known failure modes, and the scoring thresholds were not validated against real teams. The correct interpretation is not that CA-TTI is proven. The defensible claim is narrower: separating artifact score, confidence calibration, trend, and alignment-gap signals can make failure modes visible that a single raw score misses.

## 7. Governance Interpretation

CA-TTI should be used as a team-level diagnostic and early-warning framework. It should not be used to score individual developers, rank teams, or evaluate personal performance. Such use would distort behavior and create surveillance risk.

The governance rule is:

```text
A team should not be considered more transparent if artifact transparency improves while psychological safety, trust, or human-agent alignment declines.
```

This rule matters because AI agents can increase the quantity and polish of project artifacts. More complete artifacts are not inherently harmful. The risk is that the organization may mistake artifact fluency for shared understanding. CA-TTI is designed to prevent that collapse of interpretation.

Practical deployment would require safeguards:

1. Report CA-TTI at the team level, not the individual level.
2. Separate artifact score from confidence and HAG.
3. Preserve provenance for AI-created or AI-modified records.
4. Require explicit human confirmation for high-impact decisions.
5. Treat psychological safety and workload as hard governance constraints.
6. Allow participants to challenge, correct, or reverse AI-mediated records.
7. Avoid manager-facing dashboards that expose individual prompt behavior.

## 8. Discussion

The shift from the original artifact-oriented TTI to CA-TTI changes the paper's contribution. The original contribution was a protocol for evaluating a conversational AI mediator. The revised contribution is a measurement model for human-AI software teams.

This change makes the paper more durable. Tool designs will change quickly as AI agents evolve. A measurement problem will remain: how can teams know whether AI participation is improving shared transparency or merely improving the appearance of traceability?

CA-TTI addresses that problem by refusing to compress transparency into one score. A high artifact score with low confidence should not be interpreted like a high artifact score with rich evidence. A high artifact score with rising HAG should not be interpreted as success. A temporary noisy transition should not be treated like confirmed transparency decline. These distinctions are the main value of the framework.

The synthetic stress test also clarifies what future validation should test. A real-world study should not only ask whether CA-TTI increases during an intervention. It should ask whether CA-TTI predicts cases where teams report lower alignment, lower trust, or lower psychological safety despite improved artifact completeness.

## 9. Limitations

This draft has four major limitations.

First, the synthetic data are not real Agile data. They test measurement behavior under designed scenarios but cannot establish construct validity.

Second, the current prototype is trajectory-level rather than event-level. A fuller version should generate or collect event-level data with fields such as event type, source, actor type, linked artifact, confirmation status, delay, metadata completeness, review depth, autonomy level, correction events, trust signal, psychological safety signal, and missingness flag.

Third, HAG is only partially operationalized in the current prototype. The implemented version focuses on unsupported claims and confidence-evidence mismatch. The broader construct should include review depth, confirmation debt, attribution ambiguity, correction/revert rate, trust decline, and psychological safety decline.

Fourth, the paper still requires citation and claim verification before submission. Several references are inherited from the previous protocol draft and must be audited for claim-reference alignment.

## 10. Future Work

Future work should proceed in three stages.

First, improve the synthetic generator so it produces event-level software-team records rather than only trajectories. This would make the metric easier to explain and closer to the eventual field setting.

Second, conduct coder-based plausibility review. Human reviewers should inspect generated scenarios and judge whether the synthetic events plausibly represent healthy teams, documentation-only improvement, human-agent drift, noisy transition, and true transparency decline.

Third, run a small field feasibility study. The goal should not be causal proof. The goal should be to test whether CA-TTI can be computed reliably, whether HAG can be coded consistently, and whether team members find the outputs meaningful rather than intrusive.

## 11. Conclusion

Human-AI software teams need a way to detect transparency drift before it becomes visible as project failure. Raw artifact scores are not enough because AI agents can improve the visible record while weakening shared human understanding. CA-TTI responds by separating artifact transparency, confidence, trend, and Human-Agent Alignment Gap.

The first synthetic stress test supports the plausibility of this framing. CA-TTI detected artifact drift and fluent hallucination scenarios that raw TTI missed, while avoiding false warnings in noisy but stable conditions. These findings are preliminary, but they show why a single transparency score is not sufficient for human-AI software teams.

CA-TTI should therefore be understood as an early-warning measurement framework. Its purpose is not to declare that a team is productive or well-managed. Its purpose is to ask whether the team still understands, reviews, confirms, and controls the work that humans and agents are producing together.

## References

Ball, K. (2021). *Electronic monitoring and surveillance in the workplace: Literature review and policy recommendations*. Publications Office of the European Union. https://doi.org/10.2760/5137

Cinkusz, K., Chudziak, J. A., & Niewiadomska-Szynkiewicz, E. (2025). Cognitive agents powered by large language models for agile software project management. *Electronics, 14*(1), Article 87. https://doi.org/10.3390/electronics14010087

Cleland-Huang, J., Gotel, O. C. Z., Huffman Hayes, J., Mäder, P., & Zisman, A. (2014). Software traceability: Trends and future directions. In *Future of Software Engineering Proceedings* (pp. 55-69). ACM. https://doi.org/10.1145/2593882.2593891

Shneiderman, B. (2020). Human-centered artificial intelligence: Reliable, safe & trustworthy. *International Journal of Human-Computer Interaction, 36*(6), 495-504. https://doi.org/10.1080/10447318.2020.1741118

Stray, V., Moe, N. B., & Bergersen, G. R. (2017). Are daily stand-up meetings valuable? A survey of developers in software teams. In H. Baumeister, H. Lichter, & M. Riebisch (Eds.), *Agile Processes in Software Engineering and Extreme Programming* (pp. 274-281). Springer. https://doi.org/10.1007/978-3-319-57633-6_20

Stray, V., Moe, N. B., & Sjoberg, D. I. K. (2020). Daily stand-up meetings: Start breaking the rules. *IEEE Software, 37*(3), 70-77. https://doi.org/10.1109/MS.2018.2875988

Stray, V., Sjøberg, D. I. K., & Dybå, T. (2016). The daily stand-up meeting: A grounded theory study. *Journal of Systems and Software, 114*, 101-124. https://doi.org/10.1016/j.jss.2016.01.004

Umar, M. A., Lano, K., & Abubakar, A. K. (2025). Automated requirements engineering framework for agile model-driven development. *Frontiers in Computer Science, 7*, Article 1537100. https://doi.org/10.3389/fcomp.2025.1537100
