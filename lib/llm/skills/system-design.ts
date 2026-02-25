/**
 * System Design skill for the Architect agent profile.
 * Injected during finalize for technical documents:
 * architectural-summary, data-contracts, domain-summaries, user-workflow-summaries.
 */

export const SYSTEM_DESIGN_SKILL = `
## System Design (apply when producing technical documents)

- **Service topology**: Identify frontend, backend, database, and external service boundaries. Name each service and its responsibility. Prefer simple topologies (monolith or modular monolith) unless the project scope demands separation.
- **Architectural patterns**: Select patterns that fit the tech stack — e.g. server components + API routes for Next.js, REST or tRPC for API layer, repository pattern for data access. State the pattern and why it fits.
- **Bounded contexts**: Group related domain concepts into contexts (e.g. "Catalog", "Orders", "Users"). Each context owns its entities, has clear interfaces, and avoids leaking internals.
- **API design**: Define endpoints as verb + path + request/response shapes. Use consistent naming (plural nouns, nested resources). Specify status codes for success and common errors.
- **Data modeling**: Define entities with typed fields, relationships (1:1, 1:N, N:N), and constraints (required, unique, indexed). Use the project's database technology conventions.
- **Deployment strategy**: Specify hosting, build pipeline, environment variables, and scaling approach. Match the project's stated deployment target.
- **Cross-cutting concerns**: Address authentication, authorization, error handling, logging, and caching at the architecture level — not per-feature.
- **Write for build agents**: Documents you produce will be consumed by coding agents, not humans. Be precise about file paths, module boundaries, and interface contracts. Avoid vague guidance.
`.trim();
