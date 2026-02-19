# ADR 0004: No-Auth-First MVP Policy

- Status: Accepted
- Date: 2026-02-12

## Context

For proof-of-concept validation, the primary risk is planning/build correctness, not identity and tenancy hardening.

## Decision

Defer auth and RLS for initial MVP slices while proving core planning/build pipeline behavior.

- Implement core planning state, actions, and orchestration first.
- Add auth and RLS as a dedicated hardening phase before production readiness.

## Consequences

- Faster path to validating product mechanics.
- Security posture is not production-ready during POC.
- Requires explicit pre-production gate to block release until auth/RLS are complete.

## Alternatives Considered

- Implement auth/RLS from day one: rejected for MVP speed and focus.
