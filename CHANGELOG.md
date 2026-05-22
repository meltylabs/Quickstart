# Changelog

All notable changes to FitDrop Card are documented here.

Format: [Semantic Versioning](https://semver.org/)

## [0.0.1.0] - 2026-05-22

### Added
- **Design system** (`DESIGN.md`) — complete visual spec for FitDrop Card: typography (Bebas Neue display + Inter body), color tokens (dark palette with amber accent, green COP, red DROP), layout dimensions (FitDropCard 1080×1920 canvas, VotePage 56px touch targets, 3-step upload progress dots), animation table with `prefers-reduced-motion` fallbacks, and forbidden patterns to prevent AI-slop defaults.
- **TODOS.md** — post-hackathon backlog organized by area: V2 features (card templates, Drop Calendar, auto-segmentation, creator profiles), infrastructure (KV TTL, aggregation keys, Postgres migration), testing (Playwright E2E, client-side polling resilience), and product roadmap (leaderboard, brand API, second try-on provider).
- **Skill routing** (`CLAUDE.md`) — gstack skill routing rules for automated review, QA, ship, and design workflows.
