# Design Template — FileUploadGroup (RSGFU)

Use this template when creating `design.md` for any feature that requires Full SDD.

---

## 1. Architecture Overview

### Change Summary
{High-level description of the technical approach}

### Architecture Diagram
{Mermaid diagram showing affected components and data flow}

```mermaid
graph LR
    %% Add relevant services and connections here
```

## 2. Per-Service Design

### 2.1 FileUpload Service

**Changed?** {Yes/No}

#### API Changes
| Endpoint | Change | Breaking? |
|----------|--------|-----------|
| {method path} | {new / modified / removed} | {yes/no} |

#### Business Logic Changes
| Class | Method | Change Description |
|-------|--------|-------------------|
| {ClassName} | {methodName()} | {what changes and why} |

#### Database Changes
| Table | Column | Type | Change |
|-------|--------|------|--------|
| {table} | {column} | {type} | {add/modify/remove} |

### 2.2 CFODService

**Changed?** {Yes/No}

{Same structure as above if changed}

### 2.3 RSGManagementService

**Changed?** {Yes/No}

{Same structure as above if changed}

## 3. Convergence Point Decisions

For each convergence point that this feature touches, document the design decision:

### 3.1 FileUploadService.processFileUpload()

**Affected?** {Yes/No}

If yes:
- **Current behavior:** {what happens today for each processor type}
- **Proposed change:** {what will change}
- **Impact on DefaultFileUploadProcessor:** {description}
- **Impact on OnDemandLfodFileUploadProcessor:** {description}
- **Impact on OnDemandCfodFileUploadProcessor:** {description}
- **Decision:** {add new processor / modify routing / add pre-processing logic / no change}

### 3.2 FileUploadNotificationService.submitStatus()

**Affected?** {Yes/No}

If yes:
- **Current behavior:** Default/LFOD → CST; CFOD → CFODService
- **Proposed change:** {description}
- **Downstream impact:** {which external services affected}

### 3.3 FileCompleteUploadService.processCompleteUpload()

**Affected?** {Yes/No}

If yes:
- **Current behavior:** handles single-part and multi-part completion
- **Proposed change:** {description}

## 4. Messaging Changes

### SNS Topics
| Topic | Change | Multi-tenant Impact |
|-------|--------|-------------------|
| cfod-notification_{region}_{env} | {new / modified / unchanged} | {affects all businesses?} |

### New Messaging (if any)
| Mechanism | Topic/Queue | Publisher | Consumer | Purpose |
|-----------|-------------|-----------|----------|---------|
| {SNS/SQS} | {name} | {service} | {service} | {why} |

## 5. External Service Contract Changes

| Service | Current Contract | Proposed Change | Coordination Needed? |
|---------|-----------------|-----------------|---------------------|
| AMS | {current} | {proposed or no change} | {yes/no — who to contact} |
| PRS | {current} | {proposed or no change} | {yes/no} |
| BLR | {current} | {proposed or no change} | {yes/no} |

## 6. Data Flow

### Happy Path
```
Step 1: {actor} → {service} ({endpoint/action})
Step 2: {service} → {service/external} ({mechanism})
...
Step N: {terminal state}
```

### Error Paths
| Error Condition | Handling | User Impact |
|----------------|----------|-------------|
| {what fails} | {retry/DLQ/error response} | {what user sees} |

## 7. Security Considerations

- Authentication changes: {new scopes, IAM policy changes}
- Data encryption: {new KMS keys, S3 policies}
- Input validation: {new validation rules}
- OWASP top 10 applicability: {any relevant concerns}

## 8. Performance Considerations

| Metric | Current | Expected After Change | Mitigation if Worse |
|--------|---------|----------------------|-------------------|
| p50 latency | {ms} | {ms} | {action} |
| p99 latency | {ms} | {ms} | {action} |
| Throughput | {req/s} | {req/s} | {action} |

## 9. Test Strategy

### Unit Tests (per service)
| Service | Test Focus | New Test Classes |
|---------|-----------|-----------------|
| FileUpload | {what to test} | {TestClassName} |
| CFODService | {what to test or N/A} | {TestClassName} |
| RSGManagement | {what to test or N/A} | {TestClassName} |

### Integration Tests (Karate)
| Feature File | Scenario | Validates |
|-------------|----------|-----------|
| {feature.feature} | {scenario name} | {what it proves} |

### Convergence Point Tests (MANDATORY)
| Convergence Point | Test Scenarios Required |
|-------------------|----------------------|
| {method} | Test for each processor type: Default, LFOD, CFOD |

## 10. Deployment Plan

### PR Sequence
| # | Repo | PR Contents | Depends On |
|---|------|-------------|-----------|
| 1 | {repo} | {description} | — |
| 2 | {repo} | {description} | PR #1 merged |

### Feature Flag / Canary
- Can this be deployed behind the ALB canary header (`x-sanity-rsgfu: true`)?
- Feature toggle mechanism: {describe or N/A}

### Rollback Trigger
{What signals indicate this should be rolled back?}
