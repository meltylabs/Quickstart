# Requirements Template — FileUploadGroup (RSGFU)

Use this template when creating `requirements.md` for any feature that requires Full SDD.

---

## 1. Overview

**Feature Name:** {name}
**Requested By:** {stakeholder/ticket}
**Priority:** {P0/P1/P2}
**Target Service(s):** {FileUpload | CFODService | RSGManagementService | Multiple}

### Summary
{1-2 sentence description of what this feature does from the user/device perspective}

## 2. User Stories

| # | As a... | I want to... | So that... |
|---|---------|--------------|------------|
| 1 | {actor} | {action} | {benefit} |
| 2 | | | |

## 3. Acceptance Criteria

| # | Given | When | Then |
|---|-------|------|------|
| 1 | {precondition} | {action} | {expected outcome} |
| 2 | | | |

## 4. Non-Functional Requirements

| Requirement | Target | Current Baseline |
|-------------|--------|-----------------|
| Response time | {ms} | {current ms} |
| Throughput | {req/s} | {current req/s} |
| Availability | {%} | 99.x% |
| File size limit | {MB} | {current limit} |

## 5. Constraints

- {Technical constraints}
- {Compliance/security constraints}
- {Timeline constraints}

## 6. Dependencies

| Dependency | Type | Status | Impact if Unavailable |
|------------|------|--------|----------------------|
| {service/system} | {hard/soft} | {available/planned} | {consequence} |

---

## 7. Impact Analysis (REQUIRED for RSGFU)

### 7.1 Affected Services

| Service | Change Type | Blast Radius |
|---------|-------------|--------------|
| FileUpload | {new endpoint / modify existing / config change} | {which workflows affected} |
| CFODService | {change or N/A} | {which workflows affected} |
| RSGManagementService | {change or N/A} | {which workflows affected} |

### 7.2 Convergence Points Touched

Consult `dependency-map.yaml` convergence_points section.

| Convergence Point | Workflows Sharing It | Impact of This Change |
|-------------------|---------------------|----------------------|
| `FileUploadService.processFileUpload()` | default, lfod, cfod | {describe impact or "not affected"} |
| `FileUploadNotificationService.submitStatus()` | default, lfod, cfod | {describe impact or "not affected"} |
| `FileCompleteUploadService.processCompleteUpload()` | default, lfod, cfod | {describe impact or "not affected"} |

### 7.3 Cross-Group Dependencies

| External Service | Current Usage | Change Required? | Risk |
|-----------------|--------------|-----------------|------|
| AMS (AssociateManagementGroup) | Device validation | {yes/no} | {description} |
| PRS (File Transfer) | Checksum validation | {yes/no} | {description} |
| BLR (Blob Repository) | S3 presigned URLs | {yes/no} | {description} |
| ControlServiceTopic | Device MQTT commands | {yes/no} | {description} |

### 7.4 Database Impact

| Schema | Table | Change | Migration Required? |
|--------|-------|--------|-------------------|
| fileupload_service_schema | {table} | {add column / new table / index} | {yes/no} |
| cfod_service_schema | {table} | {change or N/A} | {yes/no} |

### 7.5 Infrastructure Impact

| Resource | Change | IaC Update Required? |
|----------|--------|---------------------|
| SNS topics | {new topic / modify existing / N/A} | {yes/no} |
| S3 buckets | {new bucket / policy change / N/A} | {yes/no} |
| Redis | {new key patterns / TTL change / N/A} | {yes/no} |
| IAM policies | {new permissions / N/A} | {yes/no} |

### 7.6 Cross-Region Considerations

- Does this change behave differently in eu-west-1 vs us-east-1?
- Does it require data replication changes?
- Are there region-specific configurations needed?

## 8. Migration / Rollback

### Rollback Plan
{How to revert if the feature causes issues in production}

### Data Migration
{Any data migration steps needed — DMS, scripts, backfill}

### Feature Toggle
{Can this be deployed behind a feature flag? How to disable without revert?}
