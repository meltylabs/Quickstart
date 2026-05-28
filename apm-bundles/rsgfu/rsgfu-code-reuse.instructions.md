# Code Reuse Instructions — FileUploadGroup (RSGFU)

> **OVERRIDES:** `code-reuse.instructions.md` from the base bundle. The base bundle assumes NuGet shared packages and .NET project references — this file documents RSGFU's actual Maven shared libraries.

## Shared Libraries (DO NOT Recreate)

These libraries are available via Maven from the `super-pom` dependency chain. Use them instead of writing your own:

| Library | GroupId | Purpose | Use For |
|---------|---------|---------|---------|
| `iot-logging` | com.philips.services.iot | Structured logging | ALL logging — do not use raw SLF4J |
| `iot-infra-config` | com.philips.services.iot | RabbitMQ/Redis connections | Redis Sentinel configuration, connection management |
| `http-abstraction` | com.philips.services.iot | HTTP client utilities | ALL outbound HTTP calls (HttpClientFactory) |
| `iot-cloud-reddis-utility` | com.philips.services.iot | Redis Sentinel operations | Cache reads/writes, distributed state |
| `iot-control-service-topic` | com.philips.services.iot | Device command publishing | MQTT command publishing to devices |
| `iot-serviceinfo-provider` | com.philips.services.iot | Service info resolution | Service discovery, endpoint lookup |
| `iot-authorization` | com.philips.services.iot | IAM introspect | OAuth2 token validation (RSGManagement) |

## Using the HTTP Abstraction

**ALWAYS** use `HttpClientFactory` for outbound HTTP calls:

```java
// CORRECT
IoTHttpRequest request = new IoTHttpRequest();
request.setUrl(targetUrl);
request.setMethod(HttpMethod.POST);
request.setBody(requestBody);
request.setHeaders(headers);

IoTHttpResponse response = HttpClientFactory.getHttpClientInstance().sendHttpRequest(request);
```

**DO NOT** introduce:
- Spring RestTemplate
- Spring WebClient
- Apache HttpClient directly
- OkHttp
- Feign clients

## Using Redis Utility

```java
// CORRECT — use IoT Redis utility
@Autowired
private IotCloudRedisUtility redisUtility;

// Read
String value = redisUtility.getValue(key);

// Write
redisUtility.setValue(key, value, ttlSeconds);
```

## Using Control Service Topic

```java
// CORRECT — use ControlSvcTopicProviderFactory
ControlSvcTopicProviderFactory.getInstance().postCommand(command);
ControlSvcTopicProviderFactory.getInstance().updateCSTCommand(command);
```

## Parent POM (super-pom 3.0.6-RC)

The parent POM manages:
- Spring Boot version (do NOT override)
- Common plugin configurations (JaCoCo, PITest, Spring Boot Maven Plugin)
- Dependency management (do NOT add version numbers for Spring dependencies)

```xml
<!-- CORRECT — version managed by super-pom -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>

<!-- WRONG — do not specify version for managed dependencies -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <version>2.7.x</version>  <!-- NO! Let super-pom manage this -->
</dependency>
```

## Cross-Service Shared Patterns

### Error Handling Pattern (reuse across services)

```java
// All services use properties-file-based error mapping
// ErrorScenariosToHttpErrorCodeMapping.properties
// ErrorScenariosToBusinessErrorCodeMapping.properties

// Throw named exception → framework maps to HTTP status + business code
throw new ServiceException(ErrorScenarios.SOME_ERROR);
```

### Observability Pattern (reuse across services)

```java
// All services use async observability calls via FileUploadUtils pattern
@Async
public void callObservabilityService(String nameTag, String sessionId, 
    String state, ObservabilityFileData data, String workflowName) { ... }
```

## What NOT to Do

- Do NOT reference NuGet packages (this is Maven/Java)
- Do NOT create new HTTP utility classes (use `http-abstraction`)
- Do NOT create new Redis wrapper classes (use `iot-cloud-reddis-utility`)
- Do NOT create new logging utilities (use `iot-logging`)
- Do NOT add version numbers for dependencies managed by super-pom
- Do NOT duplicate utility methods that exist in IoT commons libraries
