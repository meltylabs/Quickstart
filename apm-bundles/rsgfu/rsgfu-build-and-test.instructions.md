# Build & Test Instructions — FileUploadGroup (RSGFU)

> **OVERRIDES:** `build-and-test.instructions.md` from the base bundle. The base bundle assumes `dotnet build` and .NET tooling — this file documents RSGFU's actual Maven-based build.

## Build Tool

**Maven** with parent POM `super-pom:3.0.6-RC` (com.philips.services.iothub).

## Build Commands

```bash
# Build
mvn clean package -DskipTests

# Build with tests
mvn clean verify

# Run locally
mvn spring-boot:run
```

## Test Commands

```bash
# Unit tests only
mvn test

# Integration tests (Karate)
# Run via CI automation pipeline (ci_automation.yml)

# Mutation tests (PITest)
mvn org.pitest:pitest-maven:mutationCoverage

# Coverage report (JaCoCo)
mvn verify  # JaCoCo runs during prepare-package phase
```

## Quality Gates

| Tool | Purpose | Threshold |
|------|---------|-----------|
| JaCoCo | Code coverage | RSGManagement: 87% branch; others: inherited from super-pom |
| PITest | Mutation testing | 2-4 threads, excludes: ProgramMain, request/response DTOs, config, constants, exceptions, datamodel, registry |
| SonarQube | Static analysis | Per-service project keys |

## JaCoCo Exclusions

These classes are excluded from coverage (do NOT add tests for them):
- `ProgramMain.class`
- `models/**` (entities, DTOs)
- `config/**` (configuration classes)
- `constants/**` (enums, constants)
- `exceptions/**` (custom exceptions)
- `common/datamodel/**`
- `registry/**` (processor registry)

## PITest Configuration

```xml
<targetClasses>
    <param>com.philips.services.iotcloud.fileuploadservice*</param>
</targetClasses>
<excludedClasses>
    <param>com.philips.services.iotcloud.fileuploadservice.ProgramMain*</param>
    <param>com.philips.services.iotcloud.fileuploadservice.*.request.*</param>
    <param>com.philips.services.iotcloud.fileuploadservice.*.response.*</param>
    <param>com.philips.services.iotcloud.fileuploadservice.config.*</param>
    <param>com.philips.services.iotcloud.fileuploadservice.constants.*</param>
    <param>com.philips.services.iotcloud.fileuploadservice.exceptions.*</param>
    <param>com.philips.services.iotcloud.fileuploadservice.common.datamodel.*</param>
    <param>com.philips.services.iotcloud.fileuploadservice.registry.*</param>
</excludedClasses>
```

## CI/CD Pipeline Structure

| Pipeline | Trigger | Runs |
|----------|---------|------|
| `pr_pipeline.yml` | Pull request | TFS link, Git secrets, Build, Mutation tests, SonarQube, IAC scan |
| `day_pipeline.yml` | Push to master | Full build, ECR push, Helm push, CI automation, Blackduck, Fortify |
| `ondemand_pipeline.yml` | Manual | Feature branch builds |
| `ci_automation.yml` | Triggered by day | EKS deployment + Karate integration tests |

## Artifact Output

```xml
<!-- Spring Boot repackage outputs to ../../Jars/ -->
<outputDirectory>../../Jars/</outputDirectory>
<finalName>IoTCloudFileUpload</finalName>
```

## Docker Build

- Base image: `ubi8/openjdk-17-runtime:1.23` (ARM64)
- Build script: `build.sh` in repo root
- Output: Docker image pushed to ECR

## What NOT to Do

- Do NOT use `dotnet build` or any .NET commands (this is Maven/Java)
- Do NOT reference NuGet packages (use Maven dependencies)
- Do NOT use coverlet (use JaCoCo)
- Do NOT change PITest exclusions without architect approval
- Do NOT modify the super-pom version without coordinating across all RSGFU services
