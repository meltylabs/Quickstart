# Changelog

All notable changes to FitDrop Card are documented here.

Format: [Semantic Versioning](https://semver.org/)

## [0.0.1.0] - 2026-05-26

### Added
- **Virtual try-on** — upload a person photo + garment image, generate an AI try-on result via Fashn.ai API with up to 60-second generation window.
- **FitDrop Card** — shareable 1080×1920 story card with item name, outfit image, Bebas Neue typography, and QR code linking to the vote page.
- **Cop or Drop voting** — dedicated `/v/:shareId` vote page with live COP/DROP counts, animated percentage bar, 10-minute per-IP rate limit (atomic SET NX, `x-real-ip` for spoofing prevention), and 7-day KV TTL.
- **Share flow** — Web Share API with file sharing when available; clipboard fallback; `window.prompt` last resort. FitDropCard rendered with html2canvas for native share.
- **Vote share badge** — post-vote badge showing result, cop/drop bar, and re-share button.
- **Image compression** — client-side JPEG compression with binary-search quality targeting 200 KB before upload.
- **Design system** (`DESIGN.md`) — typography (Bebas Neue + Inter), dark color palette, amber accent, green COP, red DROP, animation tokens.
- **Post-hackathon backlog** (`TODOS.md`) — V2 features, infrastructure, testing, and product roadmap.
- **Skill routing** (`CLAUDE.md`) — gstack skill routing rules for automated review, QA, and ship workflows.
