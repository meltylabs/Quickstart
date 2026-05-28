# Java Coding Standards — FileUploadGroup (RSGFU)

> **OVERRIDES:** `java.instructions.md` from the base bundle. The base bundle assumes .NET/C# patterns — this file documents what RSGFU actually uses.

## Stack

- **Java:** 17 (NOT 21)
- **Spring Boot:** via super-pom 3.0.6-RC (NOT Spring 5.3 standalone)
- **Build:** Maven (NOT dotnet/NuGet)
- **Base Image:** Red Hat UBI 8 with OpenJDK 17 (ARM64)

## Package Structure

```
com.philips.services.iotcloud.{servicename}/
├── controller/          # REST controllers (one per endpoint group)
├── service/             # Business logic services
├── models/
│   ├── entity/          # JPA entities
│   ├── request/         # Request DTOs
│   └── response/        # Response DTOs
├── config/              # Spring configuration classes
├── constants/           # Enums and constants
├── exceptions/          # Custom exception classes
├── utils/               # Utility classes
├── blob/                # BLR integration (FileUpload only)
├── prs/                 # PRS integration (FileUpload only)
└── registry/            # Processor registry (FileUpload only)
```

## Dependency Injection Style

**Field injection** is the dominant pattern in this codebase. Do NOT refactor to constructor injection.

```java
// CORRECT for this codebase
@Autowired
private FileUploadService fileUploadService;

// DO NOT introduce constructor injection patterns
```

## HTTP Client Pattern

This codebase uses a custom IoT HTTP abstraction — NOT Spring's RestTemplate or WebClient.

```java
// CORRECT — use HttpClientFactory from iot commons
HttpClientFactory.getHttpClientInstance().sendHttpRequest(ioTHttpRequest);

// DO NOT use RestTemplate or WebClient
// DO NOT introduce Feign clients
```

## Controller Pattern

One controller per logical endpoint group. Use `@RestController` with method-level mapping annotations.

```java
@RestController
@RequestMapping("/api/v1")
public class FileUploadController {
    @PostMapping("/file-upload")
    public ResponseEntity<FileUploadResponse> initiateTransfer(...) { ... }
}
```

## Strategy/Registry Pattern

FileUpload uses a processor registry to route by command type. When adding new upload types:

1. Create a new processor implementing the processor interface
2. Register it in `FileUploadProcRegistry`
3. Do NOT modify existing processors unless the change applies to ALL types

```java
// FileUploadProcRegistry routes based on commandName:
// - DEFAULT_FILE_UPLOAD → DefaultFileUploadProcessor
// - ASSOCIATE_LFOD → OnDemandLfodFileUploadProcessor
// - ASSOCIATE_CFOD → OnDemandCfodFileUploadProcessor
```

## Error Handling

Uses properties files for error code mapping:
- `ErrorScenariosToHttpErrorCodeMapping.properties` — maps error scenarios to HTTP status codes
- `ErrorScenariosToBusinessErrorCodeMapping.properties` — maps error scenarios to business codes (e.g., IoT_049)

```java
// Error mapping pattern — throw named exception, map via properties
throw new FileUploadException(ErrorScenarios.JOB_ID_VALIDATION_ERROR);
// Maps to: HTTP 404, Business Code: IoT_049
```

## Async Processing

Use `@Async` for non-blocking calls (e.g., observability tracking):

```java
@Async
public void callObservabilityService(String nameTag, String sessionId, ...) {
    // Non-blocking — does not affect main request flow
}
```

## Redis Usage

All 3 services use Redis Sentinel via `iot-cloud-reddis-utility`:

```java
// Use the IoT Redis utility — do NOT use raw RedisTemplate
@Autowired
private IotCloudRedisUtility redisUtility;
```

## Logging

Structured logging via `iot-logging` library. Do NOT use raw SLF4J directly.

## What NOT to Do

- Do NOT introduce Lombok (not used in this codebase)
- Do NOT introduce MapStruct (manual mapping is the pattern)
- Do NOT use Spring WebFlux/reactive patterns (imperative only)
- Do NOT use RestTemplate or WebClient (use IoT HttpClientFactory)
- Do NOT refactor to constructor injection
- Do NOT add RabbitMQ listeners/publishers (dependency exists but is unused)
