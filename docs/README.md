# Documentation

Single source for all Dossier documentation.

## Structure

```
docs/
├── SYSTEM_ARCHITECTURE.md    # Master architecture overview
├── docs-index.yaml           # Document registry
├── README.md                 # This file
├── testing-reference.md      # Test commands, structure, mocking
├── development-reference.md  # Setup, scripts, workflow
│
├── domains/                  # Domain references
│   ├── api-reference.md
│   ├── data-contracts-reference.md
│   ├── map-reference.md
│   ├── memory-reference.md
│   ├── mutation-reference.md
│   ├── orchestration-reference.md
│   └── planning-reference.md
│
├── product/                  # Product & UX
│   ├── user-personas.md
│   ├── user-stories.md
│   └── user-workflows-reference.md
│
├── reference/                # Technical reference
│   ├── api-endpoints.md
│   ├── memory-coordination-prompt.md
│   ├── database-schema.md
│   └── configuration-reference.md
│
├── strategy/                 # Strategic decisions
│   ├── dual-llm-integration-strategy.md
│   └── worktree-management-flow.md
│
├── plans/                    # Work plans
│   └── remaining-work-plan.md
│
├── investigations/           # Investigations (TTL: 2 weeks)
│   ├── investigation-ruvector-retrieval-harvest-tests.md
│   └── o10-claude-flow-gap.md
│
├── adr/                      # Architecture Decision Records
│   └── 0001-*.md, 0002-*.md, ...
└── archive/                  # Historical / deprecated
    ├── README.md
    ├── STEP_2_*.md
    └── SUPABASE_SETUP.md
```

## Quick Links

- [System Architecture](SYSTEM_ARCHITECTURE.md)
- [Development](development-reference.md)
- [Testing](testing-reference.md)
- [Data Contracts](domains/data-contracts-reference.md)
- [User Workflows](product/user-workflows-reference.md)
- [Dual LLM Strategy](strategy/dual-llm-integration-strategy.md)
