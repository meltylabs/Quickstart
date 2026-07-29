# Impact Analysis Instructions — RSGGateway + Heartbeat

## Purpose

Before making any change to the RSGGateway or Heartbeat services, you MUST assess the blast radius. These are critical infrastructure services — RegionalCloudGateway routes ALL device traffic, RSGGatewayService handles ALL device-originated HTTPS, and HeartbeatGroup bridges legacy systems across 3 regions.

## How to Read the Dependency Map

The `dependency-map.yaml` in the CI/CD repo root describes all cross-service wiring. Use it to:

1. **Identify downstream impact** — If you're changing a gateway route, which backend services are affected?
2. **Identify upstream callers** — If you're changing MonitorService's API, who calls it (RSGScheduler triggers it)?
3. **Check rate limiting scope** — RegionalCloudGateway has path-specific whitelists; OnCloudGW has 39 Bucket4j rules
4. **Verify multi-region impact** — HeartbeatSchedulerService operates across EU/US/CN

## Blast Radius Assessment Checklist

Before submitting a PR, verify:

### Gateway Services (RegionalCloudGateway, RSGGatewayService)

- [ ] **Route change?** Which of the 37 (RCG) or 9 (RSGGateway) backend services are affected?
- [ ] **Rate limit change?** Will this path-specific rule affect device traffic throughput?
- [ ] **Whitelist change?** Removing a path from the auth whitelist will require ALL devices to send tokens for that path
- [ ] **Ingress change?** Does this affect the NGINX (external) or ALB (internal) ingress rules?
- [ ] **Canary routing?** Is the blue-green header (`x-sanity-rsgrg` or `x-sanity-rsggh`) affected?
- [ ] **CF dual-deploy?** Does this change need to be applied to both EKS and CF manifests?

### MonitorService

- [ ] **RabbitMQ change?** Both queues (`heartbeat.queue` and `rsg.heartbeat.queue`) receive fan-out from the same exchange
- [ ] **AMS dependency?** MonitorService calls AssociateManagementService — changes to the AMS contract affect heartbeat correlation
- [ ] **PRS publish?** MonitorService publishes connectivity-data to PRS — format changes affect downstream

### RSGScheduler

- [ ] **Cron timing?** The 5-minute heartbeat check interval affects all hub online/offline detection latency
- [ ] **Batch size?** AMS batch queries can time out if the associate set grows

### HeartbeatGroup

- [ ] **Multi-region?** HeartbeatSchedulerService hits EU, US, and CN endpoints — test all three
- [ ] **OAuth2 per-region?** Each region has separate credentials in SSM Parameter Store
- [ ] **Axeda integration?** HeartbeatService proxies to legacy Axeda — changes here can break device polling
- [ ] **DynamoDB schema?** Table access patterns (DeviceLookup, Reporting, InvalidSoapRequest) are critical for device flow
- [ ] **Redis + Ehcache?** Two-tier caching — invalidation must happen at both layers

## Cross-Group Impact

These services are CRITICAL infrastructure for the entire RSG platform:

| Service | If it fails | Impact |
|---------|-------------|--------|
| RegionalCloudGateway | ALL device-to-cloud traffic fails | 27+ cloud services unreachable |
| RSGGatewayService | ALL device HTTPS traffic fails | 9 backend services unreachable from devices |
| MonitorService | Hub heartbeat tracking stops | Fleet online/offline status becomes stale |
| RSGScheduler | Heartbeat checks stop triggering | Stale connectivity data across all hubs |
| HeartbeatService | Axeda bridge breaks | Legacy devices lose heartbeat/polling |
| HeartbeatSchedulerService | AMS heartbeat updates stop | Associate heartbeat status stale in EU/US/CN |

## Decision: When to Escalate

Escalate to the architect if your change:
- Adds/removes/modifies a gateway route (affects traffic routing for all devices)
- Changes rate limiting thresholds (affects device throughput)
- Modifies the auth whitelist (changes security posture)
- Touches RabbitMQ exchange/queue bindings
- Changes multi-region behavior (EU/US/CN)
- Modifies the Axeda proxy (legacy integration — fragile)
