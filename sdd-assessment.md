# SDD Assessment — RSGGateway and Heartbeat Group

**Date:** 2026-07-29  
**Assessed by:** SDD Enablement Skill  
**Target CI/CD Repo:** HSP_PS_RSG_OnCloudGatewayGroup_CICD

## Scope

Three ServiceGroups treated as a single SDD enablement unit:

| ServiceGroup | Alias | Services | Tech Stack |
|--------------|-------|----------|------------|
| HeartbeatGroup | rsgbridge | HeartbeatService, HeartbeatSchedulerService (Lambda) | Java 21 / Spring Boot / bridge super-pom 1.0.0-RC |
| RegionalGatewayGroup | rsgrg | RegionalCloudGateway | Java 17 / Spring Cloud Gateway 4.3.0 / super-pom 3.0.6-RC |
| OnCloudGatewayGroup | rsggh | RSGGatewayService, MonitorService, RSGScheduler | Java 17 / Spring Cloud Gateway + Spring Boot / super-pom 3.0.6-RC |

**Total services:** 6 (4 EKS containers + 1 Lambda + 1 reactive gateway)

## Decision Matrix

| Factor | Value | Score |
|--------|-------|-------|
| Service count | 6 across 3 groups | Moderate |
| Messaging complexity | 1 RabbitMQ exchange, 2 queues (OnCloudGW only) | Low |
| Shared code paths (convergence) | None identified — services are architecturally isolated | Low |
| Cross-group dependencies | Heavy outbound (gateways route to all RSG groups) but config-driven | Low code risk |
| Multi-region | HeartbeatScheduler operates EU/US/CN; gateways are eu-west-1 only | Moderate |
| Deployment model | Mixed: EKS (Helm), CF Docker (legacy), Lambda | Moderate |
| Regression risk | Low within group — gateway routes are YAML config, not shared code | Low |

## SDD Level Decision: **Light**

**Estimated effort:** 1-2 days

### Justification

1. **Gateway services are stateless routing layers** — route definitions live in ConfigMaps/application.yml, not business logic. Changes are config changes, not code convergence.
2. **HeartbeatGroup has clean separation** — HeartbeatService (Axeda bridge) and HeartbeatSchedulerService (Lambda cron) have zero code sharing or messaging between them.
3. **MonitorService's RabbitMQ is simple** — 2 queues, 1 exchange, fan-out pattern. No complex routing keys or topic-based filtering.
4. **No convergence points** — no methods are called by multiple workflows with different behavioral expectations within these groups.
5. **Primary risk is external** — these groups route TO other groups, so the dependency map (documenting outbound connections) is the highest-value artifact.

### What You Get (Light Level)

- [x] Dependency map (cross-service wiring YAML)
- [x] Base bundle instruction audit + overrides
- [x] APM bundle (apm.yml + coding instructions)
- [ ] ~~Full workflow traces~~ (not needed — workflows are config-driven routing)
- [ ] ~~Convergence point docs~~ (none identified)
- [ ] ~~Drift comparison~~ (no existing docs provided)

## Service Inventory (from wiki)

### HeartbeatGroup (account: 851725340602)

| Service | Repo | Type | Deployment |
|---------|------|------|------------|
| HeartbeatService | philips-internal/HSP_PS_RSGBridge_HeartbeatService | Container | CF Docker / ECS |
| HeartbeatSchedulerService | philips-internal/HSP_PS_RSGBridge_HeartbeatSchedulerService | Lambda | AWS Lambda (container image) |

### RegionalGatewayGroup (account: 290447894946)

| Service | Repo | Type | Deployment |
|---------|------|------|------------|
| RegionalCloudGateway | philips-internal/psi2m-IoTCloud.RegionalCloudGateway | Service | EKS (Helm) + CF (dual-deploy) |

### OnCloudGatewayGroup (account: 290447894946)

| Service | Repo | Type | Deployment |
|---------|------|------|------------|
| RSGGatewayService | (in CI/CD umbrella or separate repo TBD) | Service | EKS (Helm) + CF (dual-deploy) |
| MonitorService | (in CI/CD umbrella or separate repo TBD) | Service | EKS (Helm) + CF (dual-deploy) |
| RSGScheduler | (in CI/CD umbrella or separate repo TBD) | Service | EKS only |

### Supporting Repos

| Repo | Purpose |
|------|---------|
| HSP_PS_RSG_OnCloudGatewayGroup_CICD | CI/CD orchestration — **APM bundle target** |
| HSP_PS_RSG_OnCloudGatewayGroupIacConfiguration | Terraform (RabbitMQ, Pod Identity, IAM) |
| HSP_PS_RSG_RegionalGatewayGroup_CICD | CI/CD for RegionalGateway |
| HSP_PS_RSG_RegionalGatewayGroupIacConfiguration | Terraform for RegionalGateway |
| HSP_PS_RSG_HeartbeatGroup_CICD | CI/CD skeleton (empty) |
| HSP_PS_RSG_HeartbeatGroupIacConfiguration | IAC (no Terraform files found) |
