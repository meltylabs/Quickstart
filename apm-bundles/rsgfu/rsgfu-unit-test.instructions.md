# Unit Test Guidelines — FileUploadGroup (RSGFU)

> **OVERRIDES:** `unit-test-guidelines.instructions.md` from the base bundle. The base bundle assumes C#/NSubstitute/MSTest — this file documents RSGFU's actual JUnit 5 + Mockito patterns.

## Test Framework

- **JUnit 5** (Jupiter) — NOT MSTest or JUnit 4
- **Mockito** — for mocking dependencies (NOT NSubstitute)
- **Spring Boot Test** — for slice tests and context loading
- **AssertJ** or JUnit assertions (both acceptable)

## Test Class Structure

```java
@ExtendWith(MockitoExtension.class)
class FileUploadServiceTest {

    @Mock
    private FileUploadRepository fileUploadRepository;

    @Mock
    private BlobRequestProcessor blobRequestProcessor;

    @InjectMocks
    private FileUploadService fileUploadService;

    @Test
    void processFileUpload_defaultCommand_shouldDelegateToDefaultProcessor() {
        // Arrange
        ...

        // Act
        ...

        // Assert
        verify(defaultProcessor).processFileUpload(any());
    }
}
```

## Naming Conventions

- Test class: `{ClassName}Test.java`
- Test method: `{methodName}_{scenario}_{expectedBehavior}` (snake_case descriptive)
- Location: `src/test/java/` mirroring the main package structure

## Mocking Patterns

```java
// Mock external service calls (HttpClientFactory pattern)
@Mock
private HttpClientFactory httpClientFactory;

// Mock Redis utility
@Mock
private IotCloudRedisUtility redisUtility;

// Mock repository
@Mock
private FileUploadRepository repository;

// Use when() for stubbing
when(repository.findBySessionId(anyString())).thenReturn(Optional.of(entity));

// Use verify() for interaction verification
verify(repository, times(1)).save(any(FileUploadEntity.class));
```

## Testing Convergence Points

When testing methods at convergence points (shared by multiple workflows), you MUST write tests for ALL processor paths:

```java
// MUST test all processor types at convergence points
@Test
void submitStatus_defaultCommand_shouldCallControlServiceTopic() { ... }

@Test
void submitStatus_lfodCommand_shouldCallControlServiceTopicWhenEnabled() { ... }

@Test
void submitStatus_cfodCommand_shouldCallCFODService() { ... }
```

## Test Scope

### DO test:
- Service layer business logic
- Controller request validation and routing
- Processor-specific behavior differences
- Error handling paths (exception → HTTP status mapping)
- PRS callback processing logic
- Job state transitions

### DO NOT test (excluded from coverage):
- ProgramMain (bootstrap)
- Request/Response DTOs
- Config classes
- Constants/Enums
- Exception class definitions
- DataModel classes
- Registry class (just routing)

## What NOT to Do

- Do NOT use NSubstitute (use Mockito)
- Do NOT use MSTest annotations (use JUnit 5 @Test)
- Do NOT use [Fact] or [Theory] (those are xUnit/.NET)
- Do NOT use Assert.Equal() (use assertEquals() or assertThat())
- Do NOT create test base classes with shared setup (prefer per-test clarity)
- Do NOT mock static methods unless absolutely necessary (indicates design issue)
