# ADR 0001: Lean Test Core and TDD-First

- Status: Accepted
- Date: 2026-02-12

## Context

The project is moving from a UI prototype to a functional system. Broad, early test coverage risks maintenance overhead and low-signal failures.

## Decision

Adopt a lean, high-signal test core:

1. Contract tests as source of truth (schemas, action contracts, invariants).
2. Integration tests for critical API and orchestration boundaries.
3. Minimal adaptive E2E tests for top user journeys.

Use TDD flow (`red -> green -> refactor`) for contract and integration layers first.

## Consequences

- Faster iteration with clearer failure signals.
- Reduced test bloat during early architecture shifts.
- Requires discipline to keep assertions domain-focused and deterministic.

## Alternatives Considered

- Wide early UI/E2E coverage: rejected due to brittleness and maintenance cost.
