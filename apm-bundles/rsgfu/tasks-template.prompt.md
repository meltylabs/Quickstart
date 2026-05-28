# Tasks Template — FileUploadGroup (RSGFU)

Use this template when creating `tasks.md` for any feature that requires Full SDD.

---

## Implementation Plan

**Feature:** {feature name}
**Design Doc:** {link to design.md}
**Estimated PRs:** {count}
**Estimated Days:** {count}

## Task List

### Task 1: {Description}

**Service:** {FileUpload | CFODService | RSGManagementService | IaC}
**PR:** #{number or "PR-1"}
**Depends On:** {none | Task N}
**Workflows Affected:** {default-file-upload, lfod-file-upload, cfod-file-upload, etc.}

#### Files to Modify
| File | Change |
|------|--------|
| `src/main/java/.../ClassName.java` | {description of change} |
| `src/test/java/.../ClassNameTest.java` | {new tests to add} |

#### Test Requirements
- [ ] Unit test for {scenario 1}
- [ ] Unit test for {scenario 2}
- [ ] Verify existing tests still pass for ALL processor types

#### Verification Steps
1. `mvn clean verify` passes
2. PITest mutation coverage maintained
3. {Service-specific verification}

---

### Task 2: {Description}

{Same structure as Task 1}

---

## PR Grouping Strategy

| PR | Service(s) | Tasks Included | Merge Order |
|----|-----------|----------------|-------------|
| PR-1 | {service} | Task 1, Task 2 | First (no dependencies) |
| PR-2 | {service} | Task 3 | After PR-1 |
| PR-3 | IaC | Task 4 | Before service PRs (if infra change) |

### Merge Order Rules for RSGFU

1. **IaC changes first** — if new SNS topics, S3 policies, or IAM roles are needed
2. **CI/CD repo changes** — if dependency-map.yaml or bundle updates are included
3. **Service PRs can go in parallel** — unless one service's change depends on another's deployed endpoint
4. **Integration test PR last** — Karate tests run against deployed services

## Cross-Service Coordination

| Change in Service A | Requires Change in Service B | Coordination |
|--------------------|-----------------------------|--------------|
| {FileUpload endpoint change} | {RSGManagement routing update} | Deploy A first, then B |
| {CFOD SNS topic change} | {IaC provisioning update} | Deploy IaC first, then CFOD |

## Verification Checklist (Post-Merge)

### Per-PR Verification
- [ ] CI pipeline passes (pr_pipeline.yml)
- [ ] SonarQube quality gate passes
- [ ] No new PITest mutants survive

### Post-Deploy Verification
- [ ] Karate sanity tests pass on deployed environment
- [ ] Health endpoint returns 200 (`/actuator/health`)
- [ ] Metrics visible in Prometheus (`/actuator/prometheus`)
- [ ] No error spike in logs post-deploy

### Convergence Point Verification (if applicable)
- [ ] Default file upload workflow still works end-to-end
- [ ] LFOD file upload workflow still works end-to-end
- [ ] CFOD file upload workflow still works end-to-end
- [ ] PRS validation callback still processes correctly
- [ ] Status API returns correct states for all job types

## Rollback Plan

| Trigger | Action | Time to Recover |
|---------|--------|-----------------|
| {error condition} | {revert PR / scale down / disable feature} | {minutes} |

## Notes

- ALB canary testing available via header: `x-sanity-rsgfu: true` (routes to green deployment)
- Priority 351 = green/canary traffic, 375 = default production traffic
- HPA will scale FileUpload up to 20 replicas under load
