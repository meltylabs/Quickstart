# Base Bundle Instruction Audit — FileUploadGroup (RSGFU)

**Date:** 2026-05-28
**ServiceGroup:** FileUploadGroup (rsgfu)
**Base Bundle Dependency:** `philips-internal/HSP_GenAI_Framework/Resources/apm-bundles/java`

## Summary

The base bundle's instructions are written for a .NET/C# project ("dataStoreCurie") and will actively mislead AI agents generating code for FileUploadGroup. 5 of 8 instruction files require overrides.

## Mismatch Report

| Base Instruction | Override Needed? | Override File | Key Mismatches |
|-----------------|-----------------|---------------|----------------|
| `java.instructions.md` | **YES** | `rsgfu-java.instructions.md` | Java 17 not 21; field injection not constructor; IoT HttpClientFactory not RestTemplate; no Lombok; registry/strategy pattern |
| `build-and-test.instructions.md` | **YES** | `rsgfu-build-and-test.instructions.md` | Maven not dotnet; JaCoCo not coverlet; PITest mutation testing; super-pom 3.0.6-RC parent; Karate for integration tests |
| `unit-test-guidelines.instructions.md` | **YES** | `rsgfu-unit-test.instructions.md` | JUnit 5 not MSTest; Mockito not NSubstitute; convergence point test requirements |
| `service-test-guidelines.instructions.md` | **YES** | `rsgfu-service-test.instructions.md` | Karate BDD not .NET TestServer; WireMock for stubs; tests in automation_test_suite/ not src/test/ |
| `code-reuse.instructions.md` | **YES** | `rsgfu-code-reuse.instructions.md` | Maven shared libs not NuGet; 7 IoT commons libraries; HttpClientFactory pattern; super-pom dependency management |
| `typescript-react.instructions.md` | **N/A** | — | No UI in FileUploadGroup (backend services only) |
| `self-explanatory-code-commenting.instructions.md` | NO | — | Generic enough to work as-is |
| `conventional-commit.instructions.md` | NO | — | Team uses conventional commits (confirmed from CI pipeline naming) |

## Critical Mismatches (HIGH severity)

### 1. HTTP Client Pattern
- **Base bundle teaches:** Spring RestTemplate or WebClient
- **RSGFU actually uses:** IoT `HttpClientFactory` from `http-abstraction` library
- **Risk:** Agent generates RestTemplate code → inconsistent with codebase, may not integrate with IoT auth/logging

### 2. Dependency Injection Style
- **Base bundle teaches:** Constructor injection
- **RSGFU actually uses:** Field injection (`@Autowired` on fields)
- **Risk:** Agent introduces constructor injection → inconsistent style, potential Spring context issues

### 3. Build Tool
- **Base bundle teaches:** `dotnet build`, NuGet packages
- **RSGFU actually uses:** Maven with super-pom parent
- **Risk:** Agent suggests wrong commands, wrong dependency management

### 4. Test Framework
- **Base bundle teaches:** MSTest/NSubstitute/.NET assertions
- **RSGFU actually uses:** JUnit 5 + Mockito + AssertJ
- **Risk:** Agent generates completely wrong test syntax

### 5. Integration Test Approach
- **Base bundle teaches:** .NET TestServer in-process testing
- **RSGFU actually uses:** Karate BDD feature files + WireMock, tests in separate automation_test_suite directory
- **Risk:** Agent puts integration tests in wrong location with wrong framework

## Override Files Produced

All 5 override files are in `apm-bundles/rsgfu/`:
1. `rsgfu-java.instructions.md` — Java 17, Spring Boot, field injection, IoT HttpClientFactory, registry pattern
2. `rsgfu-build-and-test.instructions.md` — Maven, JaCoCo, PITest, CI pipeline structure
3. `rsgfu-unit-test.instructions.md` — JUnit 5, Mockito, convergence point testing rules
4. `rsgfu-service-test.instructions.md` — Karate BDD, WireMock, automation_test_suite location
5. `rsgfu-code-reuse.instructions.md` — 7 IoT commons libraries, super-pom dependency management

## Validation

After deploying the APM bundle, verify:
- [ ] `apm install -t all` loads override instructions (not base bundle versions)
- [ ] Agent generates code using HttpClientFactory (not RestTemplate)
- [ ] Agent uses field injection (not constructor injection)
- [ ] Agent puts tests in correct locations
- [ ] Agent references correct shared libraries
