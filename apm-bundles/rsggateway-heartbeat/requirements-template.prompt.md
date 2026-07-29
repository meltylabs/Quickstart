# Requirements Template — RSGGateway + Heartbeat

Use this template when creating requirements for changes to the RSGGateway or Heartbeat services.

---

## 1. Overview

**Feature/Change:** {Brief description of what is being changed}  
**Requested By:** {Team/stakeholder}  
**Priority:** {Critical / High / Medium / Low}  
**Target Services:** {List which of the 6 services are affected}

## 2. User Stories

- As a {role}, I want to {action}, so that {benefit}
- As a {role}, I want to {action}, so that {benefit}

## 3. Acceptance Criteria

- [ ] {Testable condition 1}
- [ ] {Testable condition 2}
- [ ] {Testable condition 3}

## 4. Impact Analysis

### 4.1 Affected Services

| Service | Impact Type | Description |
|---------|-------------|-------------|
| RegionalCloudGateway | {route/config/code/none} | {What changes} |
| RSGGatewayService | {route/config/code/none} | {What changes} |
| MonitorService | {code/messaging/config/none} | {What changes} |
| RSGScheduler | {code/config/none} | {What changes} |
| HeartbeatService | {code/config/none} | {What changes} |
| HeartbeatSchedulerService | {code/config/none} | {What changes} |

### 4.2 Blast Radius

- **Downstream services affected:** {List backend services impacted by routing changes}
- **Rate limiting impact:** {Any throughput changes?}
- **Auth whitelist change:** {Any paths added/removed from whitelist?}
- **Cross-region impact:** {Does this affect EU/US/CN operation?}

### 4.3 Cross-Group Dependencies

| Dependency | Impact | Risk |
|-----------|--------|------|
| AssociateManagementGroup | {affected/not affected} | {description} |
| OnPremManagementGroup | {affected/not affected} | {description} |
| PRS/RPM (external) | {affected/not affected} | {description} |
| HSDP IAM | {affected/not affected} | {description} |

## 5. Non-Functional Requirements

- **Latency:** {Expected p50/p95/p99 latency for new/modified paths}
- **Throughput:** {Expected requests/second}
- **Availability:** {SLA requirements}
- **Security:** {Auth requirements, TLS, data sensitivity}

## 6. Constraints

- {Technical constraint 1 — e.g., "must not break CF dual-deploy"}
- {Technical constraint 2 — e.g., "must work on ARM64 Graviton"}
- {Operational constraint — e.g., "must be deployable with canary header routing"}

## 7. Migration/Rollback

- **Rollback plan:** {How to revert if the change causes issues}
- **Feature flag:** {Is header-based canary routing sufficient?}
- **Data migration:** {Any DynamoDB/Redis data migration needed?}
