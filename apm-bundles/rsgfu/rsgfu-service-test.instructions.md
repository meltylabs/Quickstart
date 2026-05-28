# Service/Integration Test Guidelines — FileUploadGroup (RSGFU)

> **OVERRIDES:** `service-test-guidelines.instructions.md` from the base bundle. The base bundle assumes .NET TestServer integration test patterns — this file documents RSGFU's actual Karate BDD + WireMock approach.

## Integration Test Framework

- **Karate BDD** — primary integration/API test framework (NOT .NET TestServer)
- **WireMock** — external service stubbing
- **JMeter** — performance testing (FileUpload service only)

## Karate Test Structure

Integration tests live in `automation_test_suite/` at the repo root (NOT in `src/test/`).

```
automation_test_suite/
├── src/test/java/
│   └── karate/
│       ├── features/
│       │   ├── fileupload/
│       │   │   ├── initiate-upload.feature
│       │   │   ├── complete-upload.feature
│       │   │   └── status-check.feature
│       │   ├── cfod/
│       │   └── rsgmanagement/
│       └── karate-config.js
```

## Karate Feature File Pattern

```gherkin
Feature: File Upload Initiation

  Background:
    * url baseUrl
    * header Authorization = 'Bearer ' + authToken
    * header X-Nametag = nameTag

  Scenario: Initiate file upload with valid device
    Given path '/iothub/fileTransfer/logFiles/upload'
    And request { "fileName": "device-log.zip", "fileSize": 1024 }
    When method post
    Then status 200
    And match response.jobId == '#notnull'
    And match response.uploadUrl == '#notnull'
```

## Test Tiers (CI Pipeline)

| Tier | Trigger | Scope |
|------|---------|-------|
| Sanity (checkin) | Every deploy | Critical path only — upload, status, complete |
| Functional (nightly) | Scheduled | Full test suite including edge cases |
| Performance (JMeter) | On-demand | FileUpload only — concurrent uploads, large files |

## WireMock Usage

External services (AMS, PRS, BLR, IAM) are stubbed with WireMock in integration tests:

```java
// Stub AMS device validation
stubFor(get(urlPathMatching("/associate-management/.*"))
    .willReturn(aResponse()
        .withStatus(200)
        .withBody("{\"associated\": true}")));
```

## Security Testing (DAST)

- **ZAP** weekly scans on FileUpload and RSGManagement
- CFOD currently missing ZAP scan (known gap)

## Environment Configuration

Integration tests run against deployed EKS environments:
- `ci_automation.yml` pipeline deploys to dev EKS, then runs Karate tests
- Tests use environment-specific configuration from `karate-config.js`

## What NOT to Do

- Do NOT create .NET TestServer-based integration tests
- Do NOT use RestAssured (Karate is the standard here)
- Do NOT put integration tests in `src/test/` (they go in `automation_test_suite/`)
- Do NOT mock internal service calls in integration tests (mock only external dependencies)
- Do NOT run integration tests during `mvn verify` (they require deployed services)
