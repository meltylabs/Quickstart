# SDD Workflow Instructions — RSGGateway + Heartbeat

## When to Use Full SDD

| Change Type | SDD Level | Reason |
|-------------|-----------|--------|
| Add/modify a gateway route | **Full** (requirements → design → tasks) | Affects traffic routing for all devices |
| Change rate limiting rules | **Full** | Affects device throughput, potential backend overload |
| Modify auth whitelist | **Full** | Security posture change — needs architect sign-off |
| Add/modify RabbitMQ binding | **Full** | Messaging topology change in MonitorService |
| Change multi-region behavior | **Full** | Affects 3 regions (EU/US/CN) — must test all |
| Bug fix in existing logic | **Light** (tasks only) | No architectural impact |
| Dependency version bump | **Skip** | Standard maintenance |
| Config/environment change | **Light** | Document which environments affected |

## Three-Phase Spec Process

### Phase 1: Requirements (requirements.md)

Create `Documentation/specs/{feature-name}/requirements.md`:

1. **Overview** — What is being changed and why
2. **User Stories** — Who benefits and how
3. **Acceptance Criteria** — Testable conditions for done
4. **Impact Analysis** — Run the blast radius checklist from `rsggateway-heartbeat-impact-analysis.instructions.md`
5. **Affected Services** — Which of the 6 services are touched
6. **Cross-Region Impact** — Does this affect HeartbeatScheduler's EU/US/CN operation?
7. **Non-Functional Requirements** — Latency, throughput, availability

### Phase 2: Design (design.md)

Create `Documentation/specs/{feature-name}/design.md`:

1. **Architecture Changes** — Updated routing diagram if gateway routes change
2. **Per-Service Design** — What changes in each affected service
3. **Rate Limiting** — If adding a new route, what Bucket4j rule applies?
4. **Security** — Auth requirements for new paths (whitelisted or token-required?)
5. **Messaging** — Any RabbitMQ changes (exchange bindings, queue names)
6. **Configuration** — Which environment variables, ConfigMaps, or SSM parameters change
7. **Rollback Plan** — How to revert if the change causes issues (canary header routing)

### Phase 3: Tasks (tasks.md)

Create `Documentation/specs/{feature-name}/tasks.md`:

1. **Ordered implementation tasks** with dependencies
2. **Per-task:** files to modify, test requirements
3. **PR grouping** — which changes go in which PR
4. **Environment promotion order** — dev → master-qa → release-qa → sit → staging → prod
5. **Verification steps** — canary test with `x-sanity-*` headers

## Directory Conventions

```
Documentation/
└── specs/
    └── {feature-name}/
        ├── requirements.md
        ├── design.md
        └── tasks.md
```

## Enforcement Rules

- **Gate 1:** Requirements must have impact analysis complete before starting design
- **Gate 2:** Design must identify all affected services before starting implementation
- **Gate 3:** Tasks must specify canary test steps before merging

## Service-Specific Notes

### Gateway Services (Reactive/WebFlux)

- These are NON-BLOCKING. Never add blocking calls (RestTemplate, JDBC, Thread.sleep)
- Use WebClient for outbound HTTP, not RestTemplate
- Route definitions are in application.yml / ConfigMap — not Java code
- Rate limiting rules are Bucket4j config — test with load before deploying

### HeartbeatGroup (Java 21 / Different Account)

- Different AWS account (851725340602) — separate IAM, separate ECR, separate SSM
- Uses bridge super-pom (1.0.0-RC) — different from gateway super-pom (3.0.6-RC)
- Virtual threads enabled — no need for reactive patterns here
- DynamoDB — not PostgreSQL. Different testing approach needed (DynamoDB Local for integration tests)
- No Helm charts — deployment is CF Docker + Lambda container image
