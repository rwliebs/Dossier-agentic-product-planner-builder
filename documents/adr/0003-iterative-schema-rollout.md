# ADR 0003: Iterative Schema Rollout (Slice A/B/C)

- Status: Accepted
- Date: 2026-02-12

## Context

The canonical schema is large. Implementing all entities at once increases migration risk and test noise.

## Decision

Roll out schema in slices:

- Slice A: core planning entities + `PlanningAction`.
- Slice B: context, knowledge items, and planned files.
- Slice C: execution, checks, approvals, and audit entities.

Each slice must include:
- Contract tests
- CRUD/integration tests
- Migration checks for new constraints/indexes

## Consequences

- Better delivery control and easier debugging.
- Requires explicit dependency mapping between slices.
- Some cross-slice endpoints may remain partial until later slices land.

## Alternatives Considered

- Big-bang schema implementation: rejected due to risk concentration.
