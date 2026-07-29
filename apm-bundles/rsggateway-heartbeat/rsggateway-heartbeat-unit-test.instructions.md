# Unit Test Instructions — RSGGateway + Heartbeat

**Overrides:** `unit-test-guidelines.instructions.md` from base bundle  
**Reason:** Base bundle assumes C#/NSubstitute/MSTest. This group uses JUnit 5 + Mockito + Spring Test.

## Test Framework

| Component | Library | Version |
|-----------|---------|---------|
| Test runner | JUnit 5 (Jupiter) | Managed by super-pom |
| Mocking | Mockito | Managed by super-pom |
| Assertions | AssertJ (preferred) or JUnit assertions | Managed by super-pom |
| Spring test | @SpringBootTest, @WebFluxTest, @WebMvcTest | Spring Boot managed |
| Mutation testing | PITest | Managed by super-pom |

## Test Patterns by Service Type

### Reactive Gateway Services (RegionalCloudGateway, RSGGatewayService)

Use `@WebFluxTest` for gateway filter tests — do NOT use `@SpringBootTest` for unit tests.

```java
@WebFluxTest
@Import({RateLimitingFilter.class, TestSecurityConfig.class})
class RateLimitingFilterTest {

    @Autowired
    private WebTestClient webTestClient;

    @MockBean
    private RateLimitService rateLimitService;

    @Test
    void shouldAllowRequestWithinRateLimit() {
        when(rateLimitService.tryConsume(anyString())).thenReturn(Mono.just(true));

        webTestClient.get()
            .uri("/monitor/HeartBeat/devices")
            .exchange()
            .expectStatus().isOk();
    }

    @Test
    void shouldRejectRequestExceedingRateLimit() {
        when(rateLimitService.tryConsume(anyString())).thenReturn(Mono.just(false));

        webTestClient.get()
            .uri("/monitor/HeartBeat/devices")
            .exchange()
            .expectStatus().isEqualTo(429);
    }
}
```

### Servlet Services (MonitorService, RSGScheduler)

Use `@WebMvcTest` for controller tests, plain Mockito for service layer.

```java
@ExtendWith(MockitoExtension.class)
class MonitorServiceTest {

    @Mock
    private AssociateManagementClient amsClient;

    @Mock
    private InventoryClient inventoryClient;

    @InjectMocks
    private HeartbeatMonitorService heartbeatMonitorService;

    @Test
    void shouldUpdateHubStatusWhenHeartbeatReceived() {
        var hub = new HubInfo("hub-123", "online");
        when(inventoryClient.getHub("hub-123")).thenReturn(hub);

        heartbeatMonitorService.processHeartbeat("hub-123");

        verify(amsClient).updateHeartbeatStatus("hub-123", "online");
    }
}
```

### Lambda (HeartbeatSchedulerService)

Test the handler directly without Spring context where possible.

```java
@ExtendWith(MockitoExtension.class)
class HeartbeatSchedulerServiceHandlerTest {

    @Mock
    private HeartbeatUpdateService updateService;

    @Mock
    private OAuthTokenProvider tokenProvider;

    @InjectMocks
    private HeartbeatSchedulerServiceHandler handler;

    @Test
    void shouldUpdateHeartbeatAcrossAllRegions() {
        when(tokenProvider.getToken("EU")).thenReturn("token-eu");
        when(tokenProvider.getToken("US")).thenReturn("token-us");
        when(tokenProvider.getToken("CN")).thenReturn("token-cn");

        handler.handleRequest(new ScheduledEvent(), null);

        verify(updateService).updateHeartbeat("EU", "token-eu");
        verify(updateService).updateHeartbeat("US", "token-us");
        verify(updateService).updateHeartbeat("CN", "token-cn");
    }

    @Test
    void shouldContinueProcessingWhenOneRegionFails() {
        when(tokenProvider.getToken("EU")).thenReturn("token-eu");
        when(tokenProvider.getToken("US")).thenThrow(new RuntimeException("US IAM down"));
        when(tokenProvider.getToken("CN")).thenReturn("token-cn");

        handler.handleRequest(new ScheduledEvent(), null);

        verify(updateService).updateHeartbeat("EU", "token-eu");
        verify(updateService).updateHeartbeat("CN", "token-cn");
        verify(updateService, never()).updateHeartbeat(eq("US"), any());
    }
}
```

### DynamoDB Tests (HeartbeatService)

Use DynamoDB Local for repository tests when possible. For unit tests, mock the DynamoDB client.

```java
@ExtendWith(MockitoExtension.class)
class DeviceLookupRepositoryTest {

    @Mock
    private DynamoDbClient dynamoDbClient;

    @InjectMocks
    private DeviceLookupRepository repository;

    @Test
    void shouldReturnDeviceWhenFound() {
        var item = Map.of("deviceId", AttributeValue.builder().s("dev-123").build());
        when(dynamoDbClient.getItem(any(GetItemRequest.class)))
            .thenReturn(GetItemResponse.builder().item(item).build());

        var result = repository.findDevice("dev-123");

        assertThat(result).isPresent();
        assertThat(result.get().getDeviceId()).isEqualTo("dev-123");
    }
}
```

## Test Naming Convention

```
{MethodUnderTest}_{Scenario}_{ExpectedBehavior}
```

Or the BDD style already in use:
```
should{ExpectedBehavior}When{Scenario}
```

Examples:
- `shouldRouteToAmsWhenPathMatchesAssociateManagement`
- `shouldRejectRequestWhenRateLimitExceeded`
- `shouldContinueProcessingWhenOneRegionFails`

## What to Test / What NOT to Test

### DO test:
- Gateway filter logic (rate limiting, auth validation, header manipulation)
- Multi-region fallback behavior (one region fails, others continue)
- DynamoDB repository access patterns
- RabbitMQ message handling in MonitorService
- Cron trigger behavior in RSGScheduler
- Redis caching logic (invalidation, TTL behavior)
- Error handling paths (Axeda timeout, IAM token expiry)

### DO NOT test:
- Spring Cloud Gateway route definitions (these are YAML config — test in CI Automation)
- Bucket4j library internals (trust the library)
- Spring framework behavior (e.g., that @Scheduled actually fires)
- DynamoDB/Redis infrastructure behavior (test in integration tests)

## Mutation Testing Notes

- PITest is SKIPPED on RSGGatewayService (known debt) — do not re-enable without architect approval
- PITest runs on all other services — aim for high mutation kill rate
- If mutation testing reveals surviving mutants, add targeted tests for those specific code paths
