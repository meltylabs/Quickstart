# Service / Integration Test Instructions — RSGGateway + Heartbeat

**Overrides:** `service-test-guidelines.instructions.md` from base bundle  
**Reason:** Base bundle assumes .NET TestServer patterns. This group uses Karate (CI Automation), WireMock, and Spring Boot Test.

## Integration Test Strategy

| Service | CI Automation? | Integration Test Approach |
|---------|---------------|--------------------------|
| RegionalCloudGateway | YES | Karate tests against EKS-deployed service with WireMock backends |
| RSGGatewayService | YES | Karate tests against EKS-deployed service with WireMock backends |
| MonitorService | YES | Karate + RabbitMQ (real Amazon MQ in test env) |
| RSGScheduler | NO (missing) | Manual testing only |
| HeartbeatService | NO (missing) | Manual testing only — known gap |
| HeartbeatSchedulerService | NO (missing) | Manual testing only — known gap |

## CI Automation Pipeline (Gateway Services)

The CI Automation pipeline (`ci_automation.yml`) runs integration tests in an ephemeral EKS environment:

```
1. Terraform: provision infrastructure (Redis, RabbitMQ, ALB, ingress)
2. Helm: deploy service under test + WireMock backends
3. Karate: run API-level integration tests
4. Terraform: destroy ephemeral environment
```

### Writing Karate Tests

Karate tests live in the service repo under `src/test/karate/` or a dedicated test directory.

```gherkin
Feature: RegionalCloudGateway routing

  Background:
    * url gatewayBaseUrl
    * configure headers = { 'Authorization': '#(authToken)' }

  Scenario: Route /associatemanagement/** to AMS backend
    Given path '/associatemanagement/Associates'
    When method get
    Then status 200
    And match response.associates == '#present'

  Scenario: Rate limit /monitor/HeartBeat/devices at 50 requests
    * def results = []
    * def sendRequest =
      """
      function() {
        var response = karate.call('classpath:helpers/heartbeat-request.feature');
        return response.responseStatus;
      }
      """
    # Send 51 requests rapidly
    * eval for (var i = 0; i < 51; i++) results.push(sendRequest())
    # At least one should be rate-limited (429)
    * match results contains 429

  Scenario: Whitelisted path /fleet/Hubs/* bypasses auth
    Given path '/fleet/Hubs/hub-123'
    And header Authorization = ''
    When method get
    Then status 200
```

### WireMock Configuration

Backend services are mocked with WireMock in CI Automation:

```json
{
  "request": {
    "method": "GET",
    "urlPathPattern": "/associatemanagement/Associates.*"
  },
  "response": {
    "status": 200,
    "headers": { "Content-Type": "application/json" },
    "body": "{\"associates\": [{\"id\": \"test-associate\"}]}"
  }
}
```

WireMock is deployed as a container in the ephemeral environment, configured to respond to the paths that the gateway routes to.

## Spring Boot Integration Tests (MonitorService)

For services with RabbitMQ, use `@SpringBootTest` with embedded/test containers:

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class MonitorServiceIntegrationTest {

    @Container
    static RabbitMQContainer rabbitMQ = new RabbitMQContainer("rabbitmq:3.12-management");

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @DynamicPropertySource
    static void configureRabbitMQ(DynamicPropertyRegistry registry) {
        registry.add("spring.rabbitmq.host", rabbitMQ::getHost);
        registry.add("spring.rabbitmq.port", rabbitMQ::getAmqpPort);
    }

    @Test
    void shouldProcessHeartbeatMessage() {
        // Publish heartbeat to exchange
        rabbitTemplate.convertAndSend(
            "iotcloud.monitoringservice.exchange.name",
            "heartbeat.routing.key",
            new HeartbeatMessage("hub-123", Instant.now())
        );

        // Verify the message was processed
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            var response = restTemplate.getForEntity("/monitor/status/hub-123", HubStatus.class);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody().getStatus()).isEqualTo("online");
        });
    }
}
```

## DynamoDB Integration Tests (HeartbeatService)

Use DynamoDB Local for integration tests:

```java
@SpringBootTest
@Testcontainers
class HeartbeatServiceDynamoDBTest {

    @Container
    static GenericContainer<?> dynamoDb = new GenericContainer<>("amazon/dynamodb-local:latest")
        .withExposedPorts(8000);

    @DynamicPropertySource
    static void configureDynamoDB(DynamicPropertyRegistry registry) {
        registry.add("aws.dynamodb.endpoint",
            () -> "http://localhost:" + dynamoDb.getMappedPort(8000));
    }

    @BeforeAll
    static void createTables() {
        // Create DeviceLookup, Reporting, DeviceInvalidSoapRequest tables
    }

    @Test
    void shouldStoreAndRetrieveDeviceLookup() {
        // Test DynamoDB access patterns
    }
}
```

## Canary / Sanity Testing

Before promoting to production, validate with canary headers:

```bash
# RegionalGatewayGroup canary
curl -H "x-sanity-rsgrg: true" https://regional-cloud-gateway-staging.example.com/associatemanagement/Associates

# OnCloudGatewayGroup canary
curl -H "x-sanity-rsggh: true" https://rsggateway-staging.example.com/monitor/status
```

These headers route to the green (canary) deployment without affecting production traffic.

## Test Environment Setup

For local development against mocked backends:

```yaml
# application-local.yml
spring:
  cloud:
    gateway:
      routes:
        - id: associate-management-service
          uri: http://localhost:9090  # Local WireMock
          predicates:
            - Path=/associatemanagement/**

# Redis (local)
spring.data.redis.host: localhost
spring.data.redis.port: 6379
```

## Test Data Management

- **Gateway tests:** No persistent test data needed (stateless routing)
- **MonitorService:** RabbitMQ messages are ephemeral — create fresh per test
- **HeartbeatService:** DynamoDB tables should be created fresh per test run (DynamoDB Local)
- **HeartbeatScheduler:** Mock HSP IAM token responses and AMS heartbeat endpoint
