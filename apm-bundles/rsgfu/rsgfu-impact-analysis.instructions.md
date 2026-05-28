# Impact Analysis Instructions — FileUploadGroup (RSGFU)

## Purpose

Before making ANY code change to a FileUploadGroup service, you MUST perform impact analysis to determine the blast radius. This prevents regressions in workflows that share code paths.

## How to Use dependency-map.yaml

The `dependency-map.yaml` file in the CI/CD repo root documents all cross-service wiring. Before modifying code:

1. **Identify which service you're changing** (FileUpload, CFODService, or RSGManagementService)
2. **Check the convergence_points section** for that service — is the method you're modifying shared by multiple workflows?
3. **Check the publishes/consumes sections** — will your change affect the contract with another service?
4. **Check the external dependencies** — are you changing how an external service is called?

## Blast Radius Assessment

### FileUpload Service Changes

The FileUpload service uses a **registry/strategy pattern** with 3 processor types:
- `DefaultFileUploadProcessor` — standard device-initiated file uploads
- `OnDemandLfodFileUploadProcessor` — local file-on-demand uploads
- `OnDemandCfodFileUploadProcessor` — cloud file-on-demand uploads

**Critical convergence points:**

| Method | Shared By | Risk If Modified |
|--------|-----------|-----------------|
| `FileUploadService.processFileUpload()` | All 3 upload workflows | Routes to different processors — adding pre-processing logic affects all |
| `FileUploadNotificationService.submitStatus()` | All 3 workflows (different downstream targets) | Default/LFOD → CST; CFOD → CFODService. Changes affect routing logic |
| `FileCompleteUploadService.processCompleteUpload()` | All 3 workflows | Single-part vs multi-part logic — affects all upload types |
| `FileUploadUtils.callObservabilityService()` | All workflows + complete-upload | Low risk (async utility) but failures here affect observability for ALL workflows |

### CFODService Changes

- Changes to SNS publishing affect external subscribers
- SNS topic naming is multi-tenant (`{business}_v1_cfod-notification_{region}_{env}`)
- Spring Retry configuration changes affect resilience for ALL CFOD operations

### RSGManagementService Changes

- Stateless (Redis-only) — lower blast radius
- Changes to endpoint resolution affect ALL device routing
- Changes to validation routing affect FileUpload service

## Cross-Group Impact

All 3 services depend on **AssociateManagementGroup** (AMS) for device validation:
- If you modify how AMS responses are handled, verify across ALL services
- AMS outage = FileUploadGroup cannot accept new uploads (no circuit breaker currently)

## Mandatory Verification Checklist

Before submitting a PR for ANY FileUploadGroup service:

- [ ] Identified which workflows pass through the modified code (check dependency-map.yaml convergence_points)
- [ ] Verified the change works for ALL processor types (Default, LFOD, CFOD) if modifying shared code
- [ ] Checked cross-service contracts haven't been broken (REST endpoints, request/response shapes)
- [ ] Confirmed external service call patterns haven't changed (BLR, PRS, CST, AMS)
- [ ] Ran unit tests for ALL affected processor types, not just the one being modified
- [ ] For FileUpload: verified PRS callback handling still works (POST /api/v1/validate-checksum)
- [ ] For CFOD: verified SNS topic naming pattern unchanged
- [ ] For RSGManagement: verified Redis-only behavior preserved (no database writes introduced)

## When to Skip Impact Analysis

- Pure test-only changes (no production code modified)
- Documentation-only changes
- Dependency version bumps with no API changes
- Changes isolated to a single processor implementation with no shared method modifications
