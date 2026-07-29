# Java Coding Instructions — RSGGateway + Heartbeat

**Overrides:** `java.instructions.md` from base bundle  
**Reason:** Base bundle assumes .NET/C# patterns. This group uses Java 17 (gateways) and Java 21 (heartbeat) with Spring Boot / Spring Cloud Gateway.

## Tech Stack

| Component | Gateway Services (rsgrg, rsggh) | Heartbeat Services (rsgbridge) |
|-----------|--------------------------------|-------------------------------|
| Java version | 17 | 21 |
| Framework | Spring Cloud Gateway 4.3.0 (WebFlux) | Spring Boot (servlet) / Spring Cloud Function (Lambda) |
| Parent POM | super-pom:3.0.6-RC | bridge super-pom:1.0.0-RC |
| Build tool | Maven | Maven |
| Architecture | ARM64 (Graviton) | Not specified (likely x86_64) |
| Threading | Reactor Netty (non-blocking) | Virtual threads (Java 21) |

## Critical Distinction: Reactive vs. Servlet

### Gateway Services (RegionalCloudGateway, RSGGatewayService) — REACTIVE

These services use **Spring WebFlux** (non-blocking). You MUST:

- Use `WebClient` for outbound HTTP calls, NEVER `RestTemplate`
- Return `Mono<T>` or `Flux<T>` from handler methods
- Never call `.block()` on a reactive type in a request thread
- Never use `Thread.sleep()`, `synchronized`, or blocking I/O
- Use `Schedulers.boundedElastic()` if you absolutely must wrap a blocking call
- Routes are defined in YAML configuration, not Java code

```java
// CORRECT — reactive outbound call
webClient.get()
    .uri(targetUri)
    .retrieve()
    .bodyToMono(ResponseDto.class);

// WRONG — blocks the event loop
restTemplate.getForObject(targetUri, ResponseDto.class);
```

### HeartbeatGroup / MonitorService / RSGScheduler — SERVLET or VIRTUAL THREADS

These services use traditional Spring Boot (servlet stack) or Spring Cloud Function:

- HeartbeatService: Servlet + Virtual Threads (`spring.threads.virtual.enabled=true`)
- HeartbeatSchedulerService: Spring Cloud Function (Lambda handler)
- MonitorService: Servlet stack with RabbitMQ listener
- RSGScheduler: Servlet stack with @Scheduled cron

```java
// HeartbeatService — virtual threads allow blocking calls without thread pool exhaustion
@RestController
public class HeartbeatController {
    public ResponseEntity<String> handleHeartbeat(...) {
        // Blocking HTTP call is fine here — virtual threads handle it
        var response = httpClient.execute(request);
        return ResponseEntity.ok(response);
    }
}
```

## Package Structure

Follow the existing patterns per group:

### Gateway repos
```
src/main/java/com/philips/services/iot/
├── config/           # Spring Cloud Gateway route configuration, Bucket4j config
├── filter/           # Gateway filters (rate limiting, auth, logging)
├── model/            # DTOs for filter/route logic
└── util/             # Shared utilities
```

### HeartbeatGroup repos
```
src/main/java/com/philips/services/iotbridge/
├── heartbeat/        # HeartbeatService main package
│   ├── controller/   # REST controllers (/a2b/ACM/*)
│   ├── service/      # Business logic
│   ├── model/        # Domain models
│   ├── repository/   # DynamoDB access
│   └── config/       # Spring configuration
├── heartbeatscheduler/  # HeartbeatSchedulerService main package
│   ├── lambda/       # Lambda handler
│   ├── service/      # Business logic (multi-region AMS calls)
│   └── config/       # Configuration
```

## DI Style

- **Constructor injection** — preferred across all services
- Lombok `@RequiredArgsConstructor` is acceptable if consistent with existing service code
- Field injection (`@Autowired` on fields) — avoid in new code

## Naming Conventions

- Classes: PascalCase (e.g., `HeartbeatSchedulerServiceHandler`, `RegionalCloudGatewayApplication`)
- Methods: camelCase
- Constants: UPPER_SNAKE_CASE
- Environment variables: UPPER_SNAKE_CASE (e.g., `AXEDA_ENDPOINT_EU`, `HSP_IAM_ENDPOINT_US`)
- DynamoDB table names: `{PROJECT_NAME}-{ENV}-{TableName}` (PascalCase table name)
- Redis keys: lowercase with colons (e.g., `heartbeat:device:{id}`)
- Gateway route IDs: kebab-case (e.g., `associate-management-service`, `firmware-management-rule`)

## Error Handling

- Gateway filters: Return appropriate HTTP status via `ServerWebExchange` response
- HeartbeatService: Store invalid SOAP requests in `DeviceInvalidSoapRequest` DynamoDB table for retry
- HeartbeatScheduler: Log and continue on per-region failures (don't let EU failure block US/CN)
- MonitorService: RabbitMQ message failures should use DLQ pattern (message acknowledgment)

## Configuration

- **Gateway services:** Configuration via ConfigMap (route definitions) and SSM Parameter Store (secrets)
- **HeartbeatGroup:** ALL external endpoints via environment variables, credentials in SSM (`/{ENV}/{paramName}`)
- Never hardcode URLs, credentials, or region-specific values
- Use Spring profiles for environment-specific behavior: `default`, `cloud`, `dev`, `prod`

## Security Patterns

- Gateway services handle auth via HSDP IAM token introspection filter
- HeartbeatSchedulerService manages its own OAuth2 client credentials per region
- HeartbeatService: TLS hostname verification is DISABLED for Axeda (known debt — do not extend this pattern)
- Never add new hostname verification bypasses
- Store all secrets in SSM Parameter Store, never in application.yml or environment variables directly
