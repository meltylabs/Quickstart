# Code Reuse Instructions — RSGGateway + Heartbeat

**Overrides:** `code-reuse.instructions.md` from base bundle  
**Reason:** Base bundle assumes NuGet shared packages. This group uses Maven artifacts from internal Philips registries.

## Shared Libraries — Gateway Services (rsgrg, rsggh)

These are Maven artifacts provided by the RSG platform team. Use them — do NOT reimplement.

| Library | Artifact | Version | What It Provides |
|---------|----------|---------|-----------------|
| iot-logging | `com.philips.services.iot:iot-logging` | 6.0.0.0-RC | Structured logging, MDC context, correlation IDs |
| http-abstraction | `com.philips.services.iot:http-abstraction` | 6.0.0.1-RC | HTTP client wrapper with retry, circuit breaker, metrics |
| iot-cloud-reddis-utility | `com.philips.services.iot:iot-cloud-reddis-utility` | 6.1.0.2-RC | Redis client (Redisson), connection management, Sentinel support |
| iot-infra-config | `com.philips.services.iot:iot-infra-config` | 6.1.2.0-RC | Infrastructure config loading (SSM, Vault), excludes JPA |
| iot-authorization | `com.philips.services.iot:iot-authorization` | 6.0.0.4-RC | Authorization framework, HSDP IAM integration |
| iot-serviceinfo-provider | `com.philips.services.iot:iot-serviceinfo-provider` | 6.0.0.1-RC | Service info/health, metadata endpoints |

### Usage Rules

1. **Logging:** Always use `iot-logging` — never add SLF4J/Logback directly
2. **HTTP calls:** Use `http-abstraction` for outbound REST calls from servlet services. For reactive services (gateways), use `WebClient` directly (http-abstraction is servlet-based)
3. **Redis:** Use `iot-cloud-reddis-utility` for Redis connections — it handles Sentinel configuration. Note: RSGScheduler uses version `6.0.0.10-RC` (mismatch, known debt)
4. **Configuration:** Use `iot-infra-config` for loading SSM parameters and Vault secrets
5. **Auth:** Use `iot-authorization` for HSDP IAM integration (MonitorService uses this)

## Shared Libraries — HeartbeatGroup (rsgbridge)

| Library | Artifact | Version | What It Provides |
|---------|----------|---------|-----------------|
| iotbridge-http-abstraction | `com.philips.services.rsg.bridge:iotbridge-http-abstraction` | 2.0.0.1-RC (Service) / 2.0.0.2-RC (Scheduler) | HTTP client wrapper specific to bridge pattern |

### Important: Different Library Ecosystem

HeartbeatGroup uses the **bridge super-pom** ecosystem, NOT the standard RSG ecosystem:
- Parent POM: `com.philips.services.rsg.bridge:super-pom:1.0.0-RC`
- HTTP client: `iotbridge-http-abstraction` (NOT `http-abstraction`)
- These are different artifacts with different APIs — do not mix them

## What Already Exists — Don't Recreate

### Rate Limiting (Gateways)
Already implemented via **Bucket4j + Redisson JCache**. 39 path-specific rules exist.
- To add a new rate limit: add configuration in the Bucket4j config section
- Do NOT implement custom rate limiting logic

### Token Introspection (Gateways)
Already implemented via HSDP IAM introspection filter.
- To whitelist a path: add it to the whitelist configuration
- Do NOT implement custom auth bypass logic

### Structured Logging
Already configured via `iot-logging`. Correlation fields are automatically set:
- `X-iot-TraceId` (cross-service tracing)
- `x-sanity-rsgrg` / `x-sanity-rsggh` (canary routing)
- Do NOT add custom MDC setup — use the existing correlation field configuration

### Redis Connection Management
Already handled by `iot-cloud-reddis-utility` (standard) or Redisson (gateways):
- Do NOT create custom Redis connection pools
- Do NOT manage Jedis/Lettuce/Redisson lifecycle directly

### Multi-Region OAuth2 (HeartbeatScheduler)
The per-region token management (EU/US/CN) pattern already exists:
- Each region has its own IAM endpoint and credentials
- Credentials stored in SSM per region
- Do NOT hardcode region-specific logic — use the existing region iteration pattern

## When to Create New Code vs. Use Existing

| Need | Do This | Don't Do This |
|------|---------|---------------|
| New gateway route | Add YAML config in ConfigMap | Write Java routing code |
| New rate limit rule | Add Bucket4j config entry | Write custom throttling |
| New auth whitelist | Add path to whitelist config | Write custom filter bypass |
| HTTP call from servlet service | Use `http-abstraction` | Create new RestTemplate/WebClient |
| HTTP call from reactive service | Use `WebClient` with `http-abstraction` config | Use RestTemplate (blocks!) |
| Redis access | Use `iot-cloud-reddis-utility` | Create raw Jedis/Lettuce connections |
| DynamoDB access (HeartbeatGroup) | Use existing repository pattern | Create raw AWS SDK calls in service layer |
| Logging | Use `iot-logging` with existing MDC | Add custom logback.xml or SLF4J config |
| Secret access | Use `iot-infra-config` SSM client | Read env vars or files directly |

## Version Management

- Library versions are managed by the parent POM (`super-pom` or `bridge super-pom`)
- Do NOT override library versions in service pom.xml unless there's a specific incompatibility
- When upgrading a shared library version, coordinate with the platform team
- The version inconsistency on RSGScheduler's Redis utility (6.0.0.10-RC vs 6.1.0.2-RC) is known debt — align if you're making changes to Scheduler
