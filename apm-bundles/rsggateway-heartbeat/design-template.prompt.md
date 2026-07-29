# Design Template — RSGGateway + Heartbeat

Use this template when designing changes to the RSGGateway or Heartbeat services.

---

## 1. Architecture Overview

**Change Summary:** {One paragraph describing the architectural change}

**Affected Components:**
```
{Draw or describe which services/components are touched}
```

## 2. Per-Service Design

### 2.1 {ServiceName} Changes

**Files Modified:**
- `{path/to/file.java}` — {what changes}
- `{path/to/config.yml}` — {what changes}

**New Files:**
- `{path/to/new/file.java}` — {purpose}

**Behavior Change:**
{Describe what the service does differently after this change}

{Repeat for each affected service}

## 3. Gateway Route Changes (if applicable)

### New/Modified Routes

| Route ID | Path | Target Service | Auth Required? | Rate Limited? |
|----------|------|----------------|----------------|---------------|
| {id} | {path pattern} | {backend service} | {yes/no} | {yes — specify rule} |

### Rate Limiting Configuration

```yaml
# Bucket4j config addition (if applicable)
- path: {/new/path/**}
  bucket-capacity: {N}
  refill-tokens: {N}
  refill-duration: {Ns}
```

### Whitelist Changes (if applicable)

```yaml
# Paths to add/remove from auth whitelist
whitelist:
  add:
    - {/new/path/that/bypasses/auth}
  remove:
    - {/old/path/no/longer/whitelisted}
```

## 4. Messaging Changes (if applicable)

### RabbitMQ

| Change | Exchange | Queue | Routing Key | Consumer |
|--------|----------|-------|-------------|----------|
| {add/modify/remove} | {name} | {name} | {key} | {service} |

### Impact on Existing Consumers

{Describe how existing MonitorService consumers are affected}

## 5. Configuration Changes

### Environment Variables

| Variable | Service | Value Pattern | Purpose |
|----------|---------|---------------|---------|
| {VAR_NAME} | {service} | {pattern} | {purpose} |

### SSM Parameters

| Parameter | Path | Services Using It |
|-----------|------|-------------------|
| {name} | /{ENV}/{name} | {services} |

### ConfigMap Changes

```yaml
# Changes to gateway route ConfigMap
{relevant YAML changes}
```

## 6. Security Considerations

- **Authentication:** {How is this path/feature authenticated?}
- **Authorization:** {What roles/scopes are required?}
- **Data sensitivity:** {Any PII, PHI, or credentials involved?}
- **TLS:** {Any TLS configuration changes?}

## 7. Multi-Region Considerations (HeartbeatGroup)

| Region | Impact | Config Change |
|--------|--------|---------------|
| EU | {description} | {env var / SSM changes} |
| US | {description} | {env var / SSM changes} |
| CN | {description} | {env var / SSM changes} |

## 8. Deployment Plan

### Environment Promotion

```
dev → master-qa → release-qa → sit → staging → prod
```

### Canary Validation Steps

1. Deploy green: {deploy with canary ingress}
2. Validate with header: `curl -H "x-sanity-{group}: true" {endpoint}`
3. Expected response: {what to check}
4. Promote: {switch production traffic}

### Rollback Procedure

1. {Step to revert — e.g., "switch ingress back to blue deployment"}
2. {Step to verify — e.g., "confirm previous version handles traffic"}

## 9. Test Strategy

| Test Type | Service | What to Test | Where |
|-----------|---------|--------------|-------|
| Unit | {service} | {logic under test} | Service repo |
| Integration (CI Automation) | {service} | {end-to-end path} | CI pipeline |
| Canary | {service} | {production validation} | Staging/prod with header |
| Load | {service} | {rate limit behavior} | Perf environment |

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| {risk description} | {H/M/L} | {H/M/L} | {how to prevent/detect/recover} |
