# SDD Assessment — FileUploadGroup (RSGFU)

**Date:** 2026-05-28
**ServiceGroup:** FileUploadGroup
**Alias:** rsgfu
**Assessed By:** SDD Enablement Skill (automated)

## ServiceGroup Profile

| Question | Answer |
|----------|--------|
| Service count | 3 active services (FileUpload, CFODService, RSGManagementService) + 1 IaC repo |
| Tech stack | Java 17, Spring Boot, Maven (parent: super-pom 3.0.6-RC) |
| Messaging systems | AWS SNS (CFOD notifications only). RabbitMQ declared in pom.xml but NOT actively used (no listeners, no publishers found in code) |
| Messaging complexity | Very light — 1 SNS topic pattern (`cfod-notification_{region}_{env}`), 0 active RabbitMQ exchanges/queues |
| Hub services | FileUpload (highest in-degree — called by RSGManagement, receives callbacks from PRS) |
| Cross-region deployment | Regional (eu-west-1 primary, us-east-1 secondary) |
| Cross-group dependencies | All 3 services → AssociateManagementGroup (device validation via REST) |
| Shared code paths | Yes — registry pattern with 3 processors (Default, LFOD, CFOD) sharing convergence points |

## Decision Matrix Result

| ServiceGroup Profile | SDD Level | Match? |
|---------------------|-----------|--------|
| 1 service, no messaging, REST-only | Skip | No |
| **2-5 services, simple messaging (< 10 exchanges, < 20 queues)** | **Light** | **YES** |
| 5+ services, moderate messaging | Standard | No |
| 10+ services, complex messaging | Full | No |

## SDD Level: Light

**Estimated Effort:** 1-2 days

**Rationale:**
- 3 services with clear separation of concerns
- Messaging is minimal (SNS only, CFOD→external)
- Inter-service communication is REST-only (synchronous, traceable)
- Convergence points exist but are well-isolated via registry/strategy pattern
- No complex async chains or multi-hop messaging workflows
- Cross-group dependency on AMS is uniform across all services (same pattern)

## What You Get (Light Level)

1. **Dependency map** (`dependency-map.yaml`) — cross-service wiring
2. **APM bundle** (`apm-bundles/rsgfu/`) — coding instructions + prompt templates
3. **Base bundle overrides** — Java/build/test instructions matching actual team patterns
4. **Impact analysis instructions** — blast radius awareness for AI agents

## Phases to Execute

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Assess | COMPLETE |
| 2 | Code Scan (partial) | COMPLETE |
| 3 | Dependency Map | IN PROGRESS |
| 7 | Base Bundle Audit | IN PROGRESS |
| 8 | Create APM Bundle | IN PROGRESS |
| 9 | Deploy | PENDING |

## Key Findings from Code Scan

### FileUpload Service
- 7 REST controllers, 8 endpoints
- Outbound REST calls to: BLR, PRS, CFOD, ControlServiceTopic, Observability
- Registry pattern: `FileUploadProcRegistry` routes to 3 processors by command type
- No RabbitMQ usage despite dependency in pom.xml (dead dependency)
- 1 @Async method (observability reporting)

### CFOD Service (from wiki)
- Publishes to AWS SNS (`cfod-notification_{region}_{env}`)
- Spring Retry for resilient external calls
- Depends on AMS for device validation

### RSGManagement Service (from wiki)
- Stateless (Redis-only, no database)
- Endpoint resolution + checksum validation routing
- Calls FileUpload service for validation delegation

## Architectural Notes

- **No actual RabbitMQ usage** — `spring-boot-starter-amqp` and `iot-infra-config` are in pom.xml but no listeners or templates exist in code. Likely a dead dependency from legacy or infra-config bootstrapping.
- **Strategy/Registry pattern** in FileUpload is the primary convergence mechanism — 3 processor types handle different file upload flavors (default, LFOD, CFOD)
- **PRS callback** is the only inbound async-like pattern (PRS calls FileUpload's checksum endpoint after file validation)
