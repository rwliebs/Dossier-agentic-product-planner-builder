# ADR 0002: Claude-First Planning LLM (No Provider Adapter in MVP)

- Status: Accepted
- Date: 2026-02-12

## Context

The MVP needs one reliable planning model quickly, while avoiding abstraction complexity before fit is proven.

## Decision

Use direct Claude integration for planning in MVP and defer multi-provider adapter architecture.

- Implement direct client wiring for planning endpoints.
- Keep internal interfaces clean so adapter extraction can be introduced later if needed.

## Consequences

- Lower implementation complexity and faster delivery.
- Less flexibility in MVP if provider change is needed mid-stream.
- Future adapter work remains possible as a controlled refactor.

## Alternatives Considered

- Full provider adapter now: rejected as premature complexity for MVP.
