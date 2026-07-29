# Build and Test Instructions — RSGGateway + Heartbeat

**Overrides:** `build-and-test.instructions.md` from base bundle  
**Reason:** Base bundle assumes `dotnet build` and .NET test runner. This group uses Maven with Java 17/21.

## Build Commands

### All Services (Maven)

```bash
# Build without tests
mvn clean package -DskipTests

# Build with unit tests
mvn clean verify

# Build with mutation tests (PITest)
mvn clean verify -Dpitest.skip=false

# Build specific module (if multi-module)
mvn clean package -pl {module-name} -am
```

### Container Image Build

```bash
# Gateway services (ARM64)
docker build --platform linux/arm64 -t {service-name}:latest .

# HeartbeatGroup (x86_64 or default)
docker build -t {service-name}:latest .
```

## Quality Gates

### PR Pipeline (all services)

| Check | Tool | Threshold | Notes |
|-------|------|-----------|-------|
| Unit Tests | JUnit 5 + Maven Surefire | All pass | Blocks merge if any fail |
| Code Coverage | JaCoCo | Per super-pom config (typically 80%+) | MonitorService explicit: 87% |
| Mutation Testing | PITest | Per super-pom config | **Skipped on RSGGatewayService** (known debt) |
| Static Analysis | SonarQube | Quality gate pass | Via super-pom plugin |
| Secrets Scan | git-secrets | No findings | Blocks merge |
| IAC Scan | Toothpick/Checkov | No critical findings | IAC repo only |
| Warning Suppression | Custom check | No @SuppressWarnings abuse | PR pipeline check |

### Day Pipeline (push to master)

| Check | Tool | Notes |
|-------|------|-------|
| Full Build | Maven (clean verify) | Includes all quality gates |
| Security SAST | Fortify | All repos including IAC |
| Dependency Scan | Blackduck (source + image) | Both source SCA and container image SCA |
| Container Push | ECR + Artifactory | Image uploaded to both registries |
| Version Update | CI/CD repo | Version file updated post-build |

### CI Automation (OnCloudGW and RegionalGW only)

| Step | Tool | Notes |
|------|------|-------|
| Infrastructure | Terraform (ephemeral) | Spins up test environment |
| Deploy | Helm | Deploys service + WireMock mocks |
| Integration Tests | Karate | API-level tests against deployed service |
| Teardown | Terraform destroy | Cleans up ephemeral environment |

**Note:** HeartbeatGroup has NO CI Automation pipeline (known gap).

### Security Scan (weekly)

| Check | Tool | Schedule | Notes |
|-------|------|----------|-------|
| DAST | ZAP | Weekly (Sunday 4:40 AM) | RSGGatewayService + MonitorService only |
| CodeQL | GitHub CodeQL | On push to master + RELEASE_* | All services |

**Note:** RSGScheduler is missing securityscan pipeline (known gap).

## Running Tests Locally

```bash
# Unit tests only
mvn test

# Unit + integration tests
mvn verify

# Mutation tests
mvn verify -Dpitest.skip=false

# Specific test class
mvn test -Dtest=HeartbeatControllerTest

# With coverage report
mvn verify jacoco:report
# Report at: target/site/jacoco/index.html
```

## Parent POMs

| Group | Parent POM | Provides |
|-------|-----------|----------|
| Gateway (rsgrg, rsggh) | `super-pom:3.0.6-RC` | JaCoCo, PITest, SonarQube, Fortify, Blackduck, dependency management |
| Heartbeat (rsgbridge) | `com.philips.services.rsg.bridge:super-pom:1.0.0-RC` | Same quality gates but different dependency versions |

Do NOT change parent POM versions without architect approval — they control quality gates for the entire group.

## CI/CD Action

All pipelines use `philips-internal/RSG_Common_action@ci_migration_poc` (or specific commit SHAs for HeartbeatGroup).

Key pipeline variables:
- `SKIP_MUTATIONTEST: YES/NO` — controls PITest execution
- `HOST` — self-hosted runner label
- `ECR_REGISTRY` — container registry URL
- `CF_DOMAIN` — Cloud Foundry domain (dual-deploy services)

## Environment Promotion

```
dev → master-qa → release-qa → sit → staging → prod
```

Each environment has its own:
- SSM Parameter Store namespace (`/{ENV}/{param}`)
- Redis cluster
- DynamoDB tables (HeartbeatGroup)
- ConfigMap with route definitions (gateways)
- Rate limiting thresholds may differ per environment
