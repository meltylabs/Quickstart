# Tasks Template — RSGGateway + Heartbeat

Use this template to break a design into ordered implementation tasks.

---

## Feature: {Feature Name}

**Design Doc:** `Documentation/specs/{feature-name}/design.md`  
**Estimated Effort:** {X days}  
**Target Sprint:** {sprint identifier}

## Task List

### Task 1: {Task Title}

**Service:** {which service}  
**Branch:** `feature/{feature-name}-{task-slug}`  
**PR Target:** `master`

**Files to Modify:**
- `{path/to/file.java}` — {change description}
- `{path/to/test.java}` — {test additions}

**Implementation Steps:**
1. {Step 1}
2. {Step 2}
3. {Step 3}

**Test Requirements:**
- [ ] Unit test: {scenario}
- [ ] Unit test: {scenario}
- [ ] Mutation test passes (PITest)

**Dependencies:** None / {Task N must be complete first}

---

### Task 2: {Task Title}

{Same structure as above}

---

## PR Grouping Strategy

| PR # | Tasks Included | Service Repo | Review Notes |
|------|---------------|--------------|--------------|
| 1 | Task 1, Task 2 | {repo} | {what reviewer should focus on} |
| 2 | Task 3 | {repo} | {what reviewer should focus on} |
| 3 | Task 4 (config) | CI/CD repo | {ConfigMap/route changes — verify in staging first} |

## Merge Order

```
PR 1 ({service changes}) → PR 2 ({dependent changes}) → PR 3 ({config/route activation})
```

**Rationale:** {Why this order — e.g., "code must be deployed before route is activated, otherwise gateway routes to unready service"}

## Environment Promotion Checklist

### Per Environment:

- [ ] **dev:** Deploy and run smoke tests
- [ ] **master-qa:** Run CI Automation (Karate tests)
- [ ] **release-qa:** Full regression suite
- [ ] **sit:** System integration validation
- [ ] **staging:** Canary validation with `x-sanity-*` header
- [ ] **prod:** Canary → full promotion

### Canary Validation Script

```bash
# Validate canary deployment before promoting
SERVICE_URL="https://{service}-staging.{domain}"
HEADER="x-sanity-{group}: true"

# Test the new route/feature
curl -v -H "$HEADER" "$SERVICE_URL/{new-path}"
# Expected: {expected response}

# Test existing routes still work
curl -v -H "$HEADER" "$SERVICE_URL/{existing-path}"
# Expected: {expected response — verify no regression}
```

## Verification Steps (Post-Deploy)

- [ ] Gateway routes resolve correctly (check all affected paths)
- [ ] Rate limiting behaves as configured (load test the path)
- [ ] No increase in 5xx errors (check Prometheus/Grafana)
- [ ] Latency within SLA (check p95/p99 metrics)
- [ ] Multi-region heartbeats succeeding (HeartbeatGroup: check EU/US/CN)
- [ ] RabbitMQ messages processing (MonitorService: check queue depth)
- [ ] No SNS alerts triggered (check alert topic)

## Rollback Plan

If issues detected post-deploy:

1. **Canary phase:** Simply stop routing to green — no action needed, blue still handles traffic
2. **Post-promotion:** Redeploy previous version tag from ECR
3. **Config change:** Revert ConfigMap to previous version in the CI/CD repo
4. **RabbitMQ change:** Messages will queue in DLQ — process after fix

**Rollback command:**
```bash
# Helm rollback (EKS)
helm rollback {release-name} {previous-revision} -n {namespace}

# Or redeploy previous ECR image
helm upgrade {release-name} {chart} --set image.tag={previous-tag} -n {namespace}
```
