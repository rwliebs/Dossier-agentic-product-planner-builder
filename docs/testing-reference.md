---
document_id: doc.testing
last_verified: 2026-02-18
tokens_estimate: 800
tags:
  - testing
  - vitest
  - quality
anchors:
  - id: commands
    summary: "npm run test, test:watch, test:coverage, test:planning, test:e2e"
  - id: structure
    summary: "__tests__/ mirrors lib/; components, api, mutations, orchestration"
  - id: mocking
    summary: "Mock DbAdapter, PLANNING_MOCK_ALLOWED for LLM tests"
ttl_expires_on: null
---
# Testing Reference

**Anchors**: [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md)

## Contract

- INVARIANT: Tests use Vitest; jsdom for React components
- INVARIANT: Contract and integration tests are source of truth; E2E augments
- INVARIANT: DB tests use in-memory SQLite or mock adapter

---

## Commands

| Command | Purpose |
|---------|---------|
| `npm run test` | Run full suite once |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Coverage report (v8) |
| `npm run test:planning` | Planning LLM tests (mock allowed) |
| `npm run test:planning:e2e` | Planning E2E (trading card marketplace) |
| `npm run test:e2e:adaptive` | Adaptive E2E flows |
| `npm run test:db` | DB adapter and migration tests |

---

## Structure

```
__tests__/
├── setup.ts                 # @testing-library/jest-dom
├── lib/
│   ├── mock-db-adapter.ts   # Shared mock DbAdapter
│   ├── create-test-db.ts    # Test DB helpers
│   ├── memory/              # ingestion, retrieval, harvest, store, snapshots
│   ├── llm/                 # stream-action-parser, planning fixtures
│   └── ruvector-*           # RuVector client tests
├── components/              # workflow-block, activity-column, implementation-card, etc.
├── api/                     # projects, map, actions, chat-stream, orchestration
├── mutations/               # apply-action, pipeline
├── orchestration/           # create-run, trigger-build, approval-gates, etc.
├── schemas/                 # slice-b, slice-c, core-planning
├── hooks/                   # use-submit-action, use-map-snapshot, etc.
└── e2e/                     # adaptive-flows, trading-card-marketplace-planning
```

---

## Patterns

### Mock DbAdapter
- Use `lib/mock-db-adapter.ts` for unit tests that need DB
- In-memory SQLite for integration tests via `createTestDb()` (when available)

### Planning LLM Tests
- Set `PLANNING_MOCK_ALLOWED=1` to skip real API calls
- Use `__tests__/llm/planning-fixtures.ts` for gold/adversarial examples

### Component Tests
- `@testing-library/react`, `@testing-library/user-event`
- `setup.ts` imports `@testing-library/jest-dom/vitest`

### Coverage
- Provider: v8
- Reporters: text, html
- Run `npm run test:coverage` for report

---

## Verification
- [ ] All tests pass before commit
- [ ] Contract tests cover schema and action validation
- [ ] Integration tests cover API and orchestration boundaries

## Related
- [development-reference.md](development-reference.md)
- [domains/data-contracts-reference.md](domains/data-contracts-reference.md)
