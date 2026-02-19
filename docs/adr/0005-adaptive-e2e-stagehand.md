# ADR 0005: Adaptive E2E Strategy with Stagehand

- Status: Accepted
- Date: 2026-02-12

## Context

Traditional selector-heavy E2E tests are brittle under frequent UI evolution and add maintenance overhead.

## Decision

Use Stagehand for adaptive, intent-driven E2E coverage on a minimal critical-path suite.

- Keep E2E scope intentionally small.
- Anchor pass/fail primarily in domain/API assertions and invariants.
- Treat adaptive UI interaction as resilience support, not business-truth validation.

## Consequences

- Lower selector maintenance burden.
- Better fit for rapidly changing UI.
- Requires disciplined assertion design to avoid false confidence.

## Alternatives Considered

- Playwright-heavy E2E suite: rejected due to expected maintenance cost.
