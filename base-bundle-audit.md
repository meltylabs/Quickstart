# Base Bundle Instruction Audit — RSGGateway + Heartbeat

**Date:** 2026-07-29  
**ServiceGroups:** RegionalGatewayGroup, OnCloudGatewayGroup, HeartbeatGroup  
**SDD Level:** Light

## Summary

| Base Instruction | Override Needed? | Key Mismatches |
|-----------------|-----------------|----------------|
| java.instructions.md | **YES** | Base assumes .NET/C#. Group uses Java 17/21, Spring Cloud Gateway (reactive WebFlux) + Spring Boot (servlet), two different parent POMs, two different DI patterns |
| build-and-test.instructions.md | **YES** | Base assumes `dotnet build`, .NET test runner, NuGet. Group uses Maven, JUnit 5, JaCoCo, PITest, Karate (CI Automation) |
| unit-test-guidelines.instructions.md | **YES** | Base assumes C#/NSubstitute/MSTest. Group uses JUnit 5, Mockito, AssertJ, @WebFluxTest (reactive), @WebMvcTest (servlet), DynamoDB Local |
| service-test-guidelines.instructions.md | **YES** | Base assumes .NET TestServer. Group uses Karate + WireMock (CI Automation), Testcontainers (RabbitMQ, DynamoDB Local), canary header validation |
| code-reuse.instructions.md | **YES** | Base assumes NuGet shared packages. Group uses Maven artifacts (iot-logging, http-abstraction, iot-cloud-reddis-utility, iot-infra-config, iotbridge-http-abstraction) |
| typescript-react.instructions.md | **N/A** | No UI services in these groups |
| self-explanatory-code-commenting.instructions.md | **NO** | Generic enough to work as-is |
| conventional-commit.instructions.md | **NO** | Team uses standard commit format compatible with conventional commits |

## Critical Mismatches

### 1. Reactive vs. Servlet Architecture (CRITICAL)

The base bundle has no concept of reactive/non-blocking programming. Gateway services (RegionalCloudGateway, RSGGatewayService) use **Spring WebFlux** — any code generated following base bundle patterns will use blocking calls that will deadlock the reactive event loop.

**Base bundle would generate:** `RestTemplate`, synchronous service calls, `@Controller`  
**Correct for gateways:** `WebClient`, `Mono<T>/Flux<T>`, `@RestController` with reactive returns

### 2. Two Different Parent POMs

The base bundle doesn't understand that HeartbeatGroup uses a different build ecosystem (`bridge super-pom:1.0.0-RC`) than the gateway groups (`super-pom:3.0.6-RC`). This affects:
- Available dependencies
- Quality gate thresholds
- Plugin configuration
- HTTP client library (different artifact entirely)

### 3. DynamoDB vs. PostgreSQL

Base bundle assumes relational database patterns. HeartbeatGroup uses DynamoDB (NoSQL):
- No JPA/Hibernate
- No SQL queries
- Different testing approach (DynamoDB Local, not H2/PostgreSQL)
- Different repository patterns (AWS SDK DynamoDbClient, not Spring Data JPA)

### 4. Lambda Deployment Model

Base bundle has no awareness of AWS Lambda. HeartbeatSchedulerService is a Lambda function:
- Different handler pattern (Spring Cloud Function)
- Different testing approach (no @SpringBootTest for handler unit tests)
- Different deployment (container image to Lambda, not Helm to EKS)
- Cold start considerations

### 5. Multi-Region Operations

Base bundle has no multi-region awareness. HeartbeatSchedulerService operates across EU/US/CN:
- Per-region OAuth2 credentials
- Per-region API endpoints
- Failure isolation (one region failing shouldn't block others)
- Testing must cover all three regions

## Override Files Created

| Override File | Replaces | Key Content |
|--------------|----------|-------------|
| `rsggateway-heartbeat-java.instructions.md` | java.instructions.md | Reactive vs. servlet patterns, Java 17/21, two parent POMs, package structure, DI style |
| `rsggateway-heartbeat-build-and-test.instructions.md` | build-and-test.instructions.md | Maven commands, quality gates, CI Automation (Karate), environment promotion |
| `rsggateway-heartbeat-unit-test.instructions.md` | unit-test-guidelines.instructions.md | JUnit 5 + Mockito, @WebFluxTest, @WebMvcTest, DynamoDB patterns, Lambda handler tests |
| `rsggateway-heartbeat-service-test.instructions.md` | service-test-guidelines.instructions.md | Karate + WireMock, Testcontainers, canary header validation, DynamoDB Local |
| `rsggateway-heartbeat-code-reuse.instructions.md` | code-reuse.instructions.md | Maven shared libraries, what exists already, when to use vs. create |

## Validation

To verify overrides are loaded correctly after deployment:

```bash
apm install -t all
# Then ask the agent:
# "What HTTP client should I use for an outbound call in RSGGatewayService?"
# Expected: "WebClient (reactive)" — NOT RestTemplate
# If it says RestTemplate, the base bundle override is not loading
```
