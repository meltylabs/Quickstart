# SDD Workflow Instructions — FileUploadGroup (RSGFU)

## Spec-Driven Development Process

FileUploadGroup uses a three-phase specification process before implementation. This ensures cross-service impact is understood before code is written.

## Decision Matrix: When to Use SDD

| Change Type | SDD Level | What's Required |
|------------|-----------|-----------------|
| Bug fix in single processor (e.g., DefaultFileUploadProcessor only) | Skip | Fix + tests only |
| Config/property change (no code logic) | Skip | Change + verify |
| New endpoint in single service, no shared code | Light | Brief requirements doc + impact check |
| Modification to shared convergence point | Full | requirements.md + design.md + tasks.md |
| New workflow type (e.g., new processor) | Full | Full SDD with all 3 phases |
| Cross-service contract change | Full | Full SDD + cross-service coordination |
| Infrastructure change (SNS, S3, Redis) | Full | Full SDD with IaC review |

## Phase 1: Requirements (requirements.md)

**Template:** `requirements-template.prompt.md`
**Agent persona:** Product/Requirements Analyst

Must include:
1. Feature overview and user stories
2. Acceptance criteria
3. **Impact analysis section** (from `rsgfu-impact-analysis.instructions.md`)
4. Which services are affected
5. Which convergence points are touched
6. Cross-group dependency impact

**Gate:** Requirements must be reviewed before proceeding to design.

## Phase 2: Design (design.md)

**Template:** `design-template.prompt.md`
**Agent persona:** Technical Architect

Must include:
1. Per-service design (what changes in each affected service)
2. Convergence point decisions (what to do at each shared method)
3. Database/cache/storage changes
4. Messaging changes (SNS topics, if any)
5. API contract changes (REST endpoints)
6. Test strategy per service

**Gate:** Design must address ALL convergence points identified in requirements.

## Phase 3: Tasks (tasks.md)

**Template:** `tasks-template.prompt.md`
**Agent persona:** Implementation Lead

Must include:
1. Ordered implementation tasks
2. Per-task: files to modify, test requirements, cross-service dependencies
3. PR grouping (which changes go in which PR)
4. Verification steps for each processor type

**Gate:** Each task must reference which workflow(s) it affects.

## Directory Conventions

```
specs/
├── {feature-name}/
│   ├── requirements.md
│   ├── design.md
│   └── tasks.md
```

## Enforcement Rules

1. **No implementation without specs** for Full SDD changes
2. **No design without requirements** — requirements phase must complete first
3. **All convergence points must be addressed** in design — cannot skip shared method analysis
4. **Cross-service changes require coordinated PRs** — document merge order in tasks.md
5. **Each PR must reference** the spec it implements (link in PR description)
