# ADR 0007: Production Release Gate Requires Auth and RLS

- Status: Accepted
- Date: 2026-02-12

## Context

The MVP intentionally defers authentication and RLS to keep proof-of-concept execution focused and fast. This introduces a known security gap that must not leak into production.

## Decision

Define a hard release gate:

- No production deployment is permitted until authentication and RLS are implemented and validated.
- The no-auth-first policy is limited to local/dev/staging proof-of-concept workflows.

Required completion criteria before production release:

1. Auth flows implemented and verified.
2. RLS policies implemented across in-scope tables and tested for allow/deny paths.
3. Security regression checks pass for API data access boundaries.
4. Release checklist includes explicit sign-off for auth and RLS readiness.

## Consequences

- Preserves MVP velocity without compromising production safety.
- Forces explicit security hardening before launch.
- Adds a non-negotiable milestone that can affect timeline if deferred too long.

## Alternatives Considered

- Implicit release readiness via general QA: rejected as insufficiently explicit and too easy to bypass.
