# Dual LLM Integration Strategy

## Purpose
Define the architectural strategy for introducing two distinct LLM integrations in Dossier:
- A planning context engine that converts idea input into structured context documents and map updates.
- A build orchestrator with RuVector-backed memory and agent coordination for code execution.

This document is the source of truth for decision-making before implementation.

## Product Goal
Enable users to move from product idea to production-grade software through:
- Visual planning with structured user story maps.
- Context-scoped, multi-agent software execution.
- Human-controlled quality gates before repository changes become PRs.

## Scope and Responsibility Boundaries

### Planning Context Engine (Planning LLM)
- Primary channels: chat column and storyboard canvas.
- Allowed actions:
  - Create/modify workflows, activities, steps, and cards.
  - Refine jobs-to-be-done and feature requirements.
  - Create/modify context artifacts attached to cards.
  - Propose file intents on cards (`create`/`edit`) with per-file purpose and constraints.
- Forbidden actions:
  - Generating production code.
  - Triggering autonomous code execution.
  - Writing to GitHub repositories.
  - Creating/modifying/deleting real files in connected repositories.

### Build Orchestrator (claude-flow + RuVector)
- Primary channels: orchestration APIs, run status UI, per-card build triggers.
- Execution plane: claude-flow (MCP server on dedicated host) with RuVector embedded for persistent memory.
- Allowed actions:
  - Commit card/context artifacts to memory.
  - Coordinate multi-agent swarms (architect → coder → tester → reviewer) with shared memory per build.
  - Execute coding tasks on feature branches in the repo checkout on the dedicated host.
  - Commit to those feature branches as part of scoped card execution.
  - Prepare draft PRs for human review.
- Forbidden actions:
  - Auto-merge to `main`.
  - Merging to `main` or protected branches without explicit user action.
  - Skipping test/lint gates.
  - Ignoring card context boundaries.
- MVP scope:
  - Single-card builds only. One build at a time per project (enforced by single-build lock).
  - No git worktree provisioning. Agents work in the same repo checkout on the dedicated host.
  - Parallel multi-card builds deferred until worktree management is implemented.

## Decision-Making Principles
1. Separation of concerns first:
   - Planning intelligence and coding intelligence remain isolated services.
2. Structured outputs over free text:
   - LLM outputs must validate against strict schemas before state mutation.
3. Human-in-the-loop for repo impact:
   - PR creation and merge remain approval-gated.
4. Card-scoped execution:
   - Agent work is bounded by card context, allowed files, and linked artifacts.
5. Memory with provenance:
   - Every memory write and retrieval includes project/workflow/activity/step/card provenance metadata.
6. Safe progressive rollout:
   - Ship behind feature flags with measurable phase gates.

## Priorities (Ordered)
1. Correctness and safety boundaries between planning and coding flows.
2. Reliable map-edit UX driven by validated structured actions.
3. Card-level context fidelity for coding agents.
4. End-to-end observability across memory, agents, and approval checkpoints.
5. Extensibility for model/provider swaps and orchestration backend evolution.

## Architectural Strategy

### Service Topology (Two-Service Architecture)

**Service 1: Dossier (Vercel)**
- Frontend (existing Next.js app):
  - Canvas and chat interactions.
  - Run status and approval controls.
- Planning Context API service (Next.js API route):
  - Provider-agnostic LLM adapter.
  - Action schema validation.
  - Context-document and map-mutation contract.
- Orchestrator API service (Next.js API route):
  - Memory content CRUD (Postgres `memory_unit` tables).
  - Build dispatch via MCP to claude-flow.
  - Status polling and artifact reporting.
- Supabase (Postgres):
  - All canonical entities, orchestration state, memory content + metadata.
  - Single source of truth for current state.

**Service 2: claude-flow + RuVector (Dedicated Host — Railway / Fly.io)**
- claude-flow MCP server (`npx claude-flow@v3alpha mcp start`):
  - Multi-agent swarm coordination (60+ agent types, hierarchical topology).
  - Task routing via Q-Learning with Mixture of Experts.
  - Agent lifecycle management (spawn, monitor, retry, terminate).
  - Per-build shared memory pool for agent collaboration.
  - Git operations (branch creation, commits) on the repo checkout.
- RuVector (embedded in claude-flow, persistent volume):
  - Vector embeddings for semantic memory search.
  - HNSW indexes with SIMD acceleration.
  - GNN self-learning weights (improve retrieval quality over time).
  - Historical build snapshots (append-only).
  - Local embedding generation via fastembed (no external API cost).
- Persistent volume mounts:
  - `/data/ruvector/` — vectors, indexes, GNN weights, snapshots.
  - `/data/repo/` — git checkout of the target repository.
- GitHub for branch/PR lifecycle.

**Communication**: Dossier dispatches to claude-flow via MCP over HTTP. Claude-flow reports status via MCP `tasks/status` and `tasks/cancel` tools. All MCP calls are short-lived from Dossier's perspective (dispatch returns immediately; status is polled).

**Why two services**: Dossier's API routes are lightweight, short-lived requests suitable for Vercel serverless. Claude-flow runs long-lived agent processes (minutes per build), spawns subprocesses, needs filesystem write access, and requires persistent disk for RuVector data. These are incompatible with serverless constraints.

### Orchestration Ownership Model (Control Plane + Execution Plane + Memory Plane)
- Dossier is the system orchestrator (control plane):
  - Owns workflow/card truth, approvals, policy enforcement, and run lifecycle.
  - Decides which roles/profiles may execute and what repo boundaries apply.
  - Owns memory content and metadata in Postgres (`memory_unit`, `memory_unit_relation`).
  - Orchestrates the seed/execute/harvest memory cycle for each build.
- claude-flow is the execution orchestrator (execution plane):
  - Owns swarm coordination, agent routing, retries/fallbacks, and task lifecycle.
  - Coordinates multi-agent collaboration with shared per-build memory pool.
  - Must execute only within Dossier-provided scope envelopes and constraints.
  - Accessed via MCP over HTTP; exposes `tools/call`, `tasks/status`, `tasks/cancel`.
- RuVector is the memory substrate (memory plane, embedded in claude-flow):
  - Owns vector embeddings, HNSW indexes, GNN self-learning weights, and historical snapshots.
  - Provides semantic search with GNN-refined ranking that improves over time.
  - Generates embeddings locally via fastembed (no external embedding API dependency).
  - Does not decide policy, approvals, or repository write authority.
  - Data persists on dedicated host's persistent volume across builds and restarts.
- Integration principle:
  - Dossier remains the policy authority even when claude-flow handles worker-level orchestration.
  - Postgres is the source of truth for memory content; RuVector is the source of truth for vectors and learning.
  - Memory content in Postgres links to RuVector entries via `embedding_ref`.

### Storage Architecture: Current State and Historical Learning

The system uses a split storage model to maximize both relational integrity and self-learning.

**Postgres (Supabase): Current State (Source of Truth)**
- All canonical entities: Project, Workflow, WorkflowActivity, Step, Card, ContextArtifact, CardPlannedFile, knowledge items, runs, approvals.
- Memory content and metadata: `memory_unit` (content + `embedding_ref`), `memory_unit_relation` (provenance), `memory_retrieval_log`.
- Single source of truth for current state and memory content.
- ACID transactions, referential integrity, exact lookups, aggregations.

**RuVector (embedded in claude-flow, persistent volume): Semantic Memory and Historical Snapshots**
- **MemoryUnit embeddings**: vectors for RAG retrieval; referenced by `MemoryUnit.embedding_ref` in Postgres.
- **GNN self-learning weights**: graph neural network model that refines retrieval ranking over time based on build outcomes.
- **HNSW indexes**: fast approximate nearest neighbor search with SIMD acceleration.
- **Local embeddings**: fastembed models (no Voyage AI or other external embedding API dependency).
- **Historical card snapshots**: append-only copies of past card states for learning.
  - Snapshot granularity: on status transitions, approval events (e.g. `planned_file_approved`), or on build trigger.
  - Each snapshot: embedding of `title + description + status + planned_files_summary` (or equivalent) plus metadata (`card_id`, `project_id`, `workflow_id`, `timestamp`, `status`, `event_type`).
  - RuVector learns from usage: "cards that looked like this at this stage tended to succeed/fail."
  - Enables retrieval: "find past card states similar to this one" for context augmentation.

**Benefits**
- No conflict: Postgres owns current content; RuVector owns vectors and immutable history.
- GNN self-learning improves retrieval quality over time across builds within a project.
- Richer context: similar past states as additional orchestration input.
- Append-only sync: no update conflicts; Postgres mutations trigger async snapshot writes.
- No external embedding API cost: fastembed runs locally on the dedicated host.
- Memory compounds across builds: each build's learnings persist and inform future builds.

**Sync Policy**
- Dossier triggers snapshot on key events (status change, approval, build start).
- Snapshot pipeline is async; Postgres mutations never block on RuVector.
- Full object content remains in Postgres; RuVector stores embedding + metadata only.
- RuVector data persists on the dedicated host's persistent volume; survives container restarts and redeployments.

**Build Memory Lifecycle (Seed → Execute → Harvest)**
- **Seed (pre-build)**: Dossier queries RuVector (via claude-flow MCP `memory_search`) for vectors similar to the current card context. Returns ranked `memory_unit_ids`. Dossier fetches full content from Postgres and seeds it into claude-flow's per-build swarm memory namespace.
- **Execute (during build)**: Swarm agents read and write to the shared per-build memory pool. Each agent builds on prior agents' work (architect's plan, coder's implementation, tester's results, reviewer's feedback).
- **Harvest (post-build)**: Dossier reads durable learnings from claude-flow's swarm memory (via MCP `memory_list`). For each learning: calls RuVector to generate embedding and store vector, saves `embedding_ref` back to a new `memory_unit` row in Postgres with provenance relations (`card` source + `project` scope). Appends historical snapshot to RuVector.
- **Compound effect**: Build N+1 retrieves Build 1..N's learnings during its seed phase. Agents don't reinvent patterns, reuse established interfaces, and avoid known pitfalls.

### Execution Input Contract (System-Wide vs Per-Build)
- System-wide input contract (always-on, applies to every run):
  - Project policy profile (branch protections, approval requirements, merge rules).
  - Dependency/security policy (allowed sources, banned packages/patterns, secret handling).
  - Required check matrix (`dependency`, `security`, `policy`, `lint`, `unit`, `integration`, `e2e`).
  - Architecture constraints (protected paths, bounded context rules, interface invariants).
  - Global context pack (approved project summaries, standards, runbooks).
- Per-build input contract (varies by workflow/card trigger):
  - Scope target (`workflow_id` or `card_id`) and immutable execution snapshot.
  - Approved planned files and per-file contract notes.
  - Agent role/profile selection and assignment constraints (`allowed_paths`, forbidden areas).
  - Retrieved memory references and approved card knowledge items.
  - Build commands/check overrides allowed by system policy.
  - Acceptance criteria and expected output artifacts for approval.
- Contract precedence:
  - System-wide policy constrains all per-build inputs.
  - Per-build inputs may narrow scope further but cannot relax system-wide constraints.

### Orchestration Flow (Control + Execution + Memory)
- Trigger:
  - User starts a `card` build from Dossier (single-card scope for MVP).
  - Dossier checks single-build lock: rejects if any `OrchestrationRun` with status `running` exists for this project.
- Control-plane intake:
  - Dossier resolves system-wide input bundle and per-build input bundle.
  - Dossier validates policy precedence and scope boundaries.
  - Dossier creates `OrchestrationRun` and `CardAssignment` records in Postgres.
- Seed stage:
  - Dossier queries RuVector (via claude-flow MCP `memory_search`) for project-scoped and card-scoped approved memory.
  - Dossier fetches full memory content from Postgres by returned IDs.
  - Dossier seeds claude-flow's swarm memory namespace (via MCP `memory_store`) with card context, requirements, planned files, acceptance criteria, and retrieved memory.
- Execution stage:
  - Dossier dispatches to claude-flow via MCP `tools/call` with task description, feature branch, allowed/forbidden paths, and constraints.
  - claude-flow initializes a hierarchical swarm for the card:
    - **Architect agent**: reads seeded memory, produces implementation plan, writes decisions to shared memory.
    - **Coder agent**: reads plan + memory, implements files per plan, commits to feature branch, writes implementation notes to shared memory.
    - **Tester agent**: reads implementation from memory, writes and runs tests, writes results to shared memory.
    - **Reviewer agent**: reads everything, checks boundary compliance and code quality, approves or requests revisions via shared memory.
  - All agents share the same memory pool; each builds on the work of previous agents.
  - Dossier polls claude-flow `tasks/status` to track progress; updates `AgentExecution` and `EventLog` in Postgres.
- Harvest stage:
  - On completion, Dossier reads durable learnings from claude-flow's swarm memory.
  - Dossier writes new `MemoryUnit` entries to Postgres with `embedding_ref` pointing to RuVector vectors.
  - Dossier appends historical snapshot to RuVector (build outcome, files changed, checks passed).
- Quality and approval stage:
  - Required checks execute (lint, unit, integration, e2e per policy profile).
  - Dossier requests approval only after required checks pass.
  - PR lifecycle actions remain user-gated for protected branches.

### Always-On Run Pipeline (Applies to Every Build)
- Preflight:
  - Validate per-build input snapshot against active system policy profile.
  - Resolve protected/forbidden paths and assignment boundaries.
- Retrieval:
  - Pull card/workflow-scoped approved memory first, then broaden only when policy allows.
- Execution:
  - Dispatch scoped assignments to claude-flow via MCP with immutable assignment input snapshots.
- Global quality baseline:
  - Execute `dependency`, `security`, and `policy` checks for all runs.
  - Execute build checks matrix (`lint`, `unit`, `integration`, `e2e`) per system profile requirements.
- Approval:
  - Only request PR-impacting approvals after required checks complete.
  - Never allow per-build overrides to bypass system-mandated checks.

### Planning Agent Reliability for Visual Build Execution
- We do not depend on Mermaid or diagram DSLs as execution truth.
- The visual build is driven by canonical structured state + mutation actions:
  - State truth: workflows, activities, steps, cards, artifacts, and planned files.
  - Mutation truth: validated `PlanningAction` records only.
- Execution protocol for planning agents:
  1. Read latest canonical state snapshot.
  2. Produce schema-valid mutation actions only (no free-form state edits).
  3. Run deterministic validation (referential integrity, ordering, duplicate checks, policy checks).
  4. Dry-run action application and generate a user preview delta.
  5. Apply atomically if accepted; otherwise reject with explicit reasons.
- Reliability training strategy:
  - Use curated gold examples of visual map edits and expected action payloads.
  - Add adversarial cases (reorder conflicts, stale IDs, missing dependencies).
  - Continuously evaluate action validity, preview fidelity, and revert rate.
  - Promote model/config updates only when reliability thresholds are met.
- Reliability SLOs for planning execution:
  - Action schema validity >= 99%.
  - Deterministic apply success on accepted actions >= 99.5%.
  - Preview/apply mismatch rate <= 0.5%.
  - Auto-revert or rejection coverage for invalid actions = 100%.

### Provider Strategy
- MVP uses a direct Claude integration for planning/context operations.
- Provider adapter abstraction is explicitly deferred until after MVP stability gates are met.
- The provider boundary remains internal so adapter extraction can be done later without API contract churn.

### Orchestration Strategy
- Semi-autonomous execution mode:
  - Agents can generate code and commit on feature branches.
  - Human must explicitly approve PR creation/merge to protected branches.
- Assignment model:
  - Card-to-swarm mapping: each card build dispatches a multi-agent swarm (architect, coder, tester, reviewer) with shared memory, immutable execution snapshot, and context envelope.
  - Single-card builds only for MVP. One active build per project (single-build lock).
- Integration model:
  - A dedicated integration pass validates cross-card compatibility.
- Execution plane technology:
  - claude-flow v3 (MCP server) with RuVector embedded for memory.
  - Accessed via MCP over HTTP from Dossier API routes.
  - Deployed on dedicated host (Railway / Fly.io) with persistent volume.
- Future: parallel multi-card builds via git worktree isolation (deferred past MVP).

### Dual Scope Operation Policy
- The system supports two first-class execution scopes:
  - `workflow` scope for coherent end-to-end value delivery.
  - `card` scope for targeted improvements, fixes, and iterative shipping.
- Build commands, status, logs, retries, and approvals must work for both scopes.
- Neither scope is treated as secondary; users may choose either based on intent.

### MVP Planning-to-Build Handshake
- Architecture is presented through **card-level planned files**, not a separate required architecture canvas.
- Planning output remains schema artifacts only (no repo writes).
- User review step before build:
  - Per card, user can inspect/edit planned files (`logical_file_name`, `artifact_kind`, `action`, `intent_summary`, `contract_notes`).
  - Build can only trigger when planned files are approved for targeted cards.
- On build trigger, orchestration uses approved planned files as part of agent prompts and constraints.

### State and Stateless Balance (Core Policy)
- Planning prompts are stateless per invocation:
  - The planning agent does not rely on prior chat/session transcript as truth.
  - Inputs are current user request + current map state + linked artifacts.
- Chat persistence policy:
  - Full planning chat transcript storage is optional and disabled by default.
  - Required persistence is limited to structured artifacts and approvals.
- Truth is stored in persistent artifacts:
  - Story map entities (workflows, activities, steps, cards).
  - Card context artifacts.
  - Card planned files and approvals.
  - Approved project-level summaries/constraints.
- Scope is card-first, not session-first:
  - Retrieval and orchestration are keyed by `project_id` + `card_id`.
  - Session/invocation identifiers are observability metadata only.

### Structured Card Knowledge Lifecycle
- Card knowledge is persisted in structured form early so agents can reliably populate and revise it.
- Each knowledge item follows a lifecycle:
  - `draft`: agent- or user-generated working item.
  - `approved`: accepted as orchestration-trusted input.
  - `rejected`: explicitly excluded from orchestration context.
- Orchestration context policy:
  - Always include `approved` items.
  - Include `draft` items only when explicitly allowed by build/planning mode policy.
  - Never include `rejected` items.

## Phase 0 Full Data Schema (Canonical V1)

This schema is the implementation contract for Phase 1+ APIs, storage, and UI wiring.

### Enums
- `card_status`: `todo | active | questions | review | production`
- `activity_color`: `yellow | blue | purple | green | orange | pink`
- `artifact_type`: `doc | design | code | research | link | image | skill | mcp | cli | api | prompt | spec | runbook`
- `file_type`: `component | api | service | hook | util | schema | middleware`
- `planned_file_action`: `create | edit`
- `planned_file_status`: `proposed | user_edited | approved`
- `planned_file_kind`: `component | endpoint | service | schema | hook | util | middleware | job | config`
- `knowledge_item_status`: `draft | approved | rejected`
- `knowledge_item_source`: `agent | user | imported`
- `llm_provider`: `anthropic | openai | vertex | custom`
- `run_status`: `queued | running | blocked | failed | completed | cancelled`
- `build_scope`: `workflow | card`
- `agent_role`: `planner | coder | reviewer | integrator | tester`
- `approval_status`: `pending | approved | rejected`
- `pr_status`: `not_created | draft_open | open | merged | closed`
- `run_check_type`: `dependency | security | policy | lint | unit | integration | e2e`

### Core Planning Entities (MVP simplified)
- `Project`
  - `id` (uuid, pk)
  - `name` (text, required)
  - `repo_url` (text, optional)
  - `default_branch` (text, default `main`)
  - `created_at`, `updated_at` (timestamptz)
- `WorkflowLabel` (lightweight taxonomy object)
  - `key` (text, pk)
  - `title` (text, required)
  - `description` (text, nullable)
- `VersionLabel` (lightweight taxonomy object)
  - `key` (text, pk)
  - `title` (text, required)
  - `description` (text, nullable)
  - `sort_order` (int, nullable)
- `Workflow` (optional lightweight grouping object)
  - `id` (uuid, pk)
  - `project_id` (uuid, fk, indexed)
  - `label_key` (text, fk `WorkflowLabel.key`)
  - `title` (text, required)
  - `description` (text, nullable)
  - `build_state` (`run_status`, nullable)
  - `last_built_at` (timestamptz, nullable)
  - `last_build_ref` (text, nullable)  // branch/PR ref for latest workflow-level execution
  - `position` (int, required)
- `WorkflowActivity` (collapsed from prior Epic + UserActivity layers)
  - `id` (uuid, pk)
  - `workflow_id` (uuid, fk, indexed)
  - `title` (text, required)
  - `color` (`activity_color`, nullable)
  - `workflow_label_key` (text, nullable, fk `WorkflowLabel.key`)
  - `version_label_key` (text, nullable, fk `VersionLabel.key`)
  - `depends_on_activity_ids` (uuid[], nullable)
  - `position` (int, required)
- `Step`
  - `id` (uuid, pk)
  - `workflow_activity_id` (uuid, fk, indexed)
  - `title` (text, required)
  - `workflow_label_key` (text, nullable, fk `WorkflowLabel.key`)
  - `version_label_key` (text, nullable, fk `VersionLabel.key`)
  - `depends_on_step_ids` (uuid[], nullable)
  - `position` (int, required)
- `Card`
  - `id` (uuid, pk)
  - `workflow_activity_id` (uuid, fk, indexed)   // fallback target if step granularity is skipped
  - `step_id` (uuid, fk `Step.id`, nullable, indexed)
  - `title` (text, required)
  - `description` (text, nullable)
  - `status` (`card_status`, required)
  - `priority` (int, required)
  - `position` (int, required)
  - `workflow_label_key` (text, nullable, fk `WorkflowLabel.key`)
  - `version_label_key` (text, nullable, fk `VersionLabel.key`)
  - `quick_answer` (text, nullable)
  - `build_state` (`run_status`, nullable)
  - `last_built_at` (timestamptz, nullable)
  - `last_build_ref` (text, nullable)  // branch/PR ref for latest card-level execution
  - `created_at`, `updated_at` (timestamptz)

### Card Context and Knowledge
- `ContextArtifact` (replaces `ContextDoc` concept; UI can keep `ContextDoc` alias during migration)
  - `id` (uuid, pk)
  - `project_id` (uuid, fk, indexed)
  - `name` (text, required)
  - `type` (`artifact_type`, required)
  - `title` (text, nullable)
  - `content` (text, nullable)
  - `uri` (text, nullable)            // URL/path/identifier for link, image, skill, MCP, CLI, API, etc.
  - `locator` (text, nullable)        // Optional pointer like endpoint path, command, skill id, MCP tool name
  - `mime_type` (text, nullable)      // Useful for images and binary-like linked artifacts
  - `integration_ref` (jsonb, nullable) // Provider-specific handle (e.g., MCP server/tool, CLI command template)
  - `checksum` (text, nullable)
  - `created_at`, `updated_at`
- `CardContextArtifact` (many-to-many)
  - `card_id` (uuid, fk, indexed)
  - `context_artifact_id` (uuid, fk, indexed)
  - `linked_by` (text, optional)
  - `usage_hint` (text, nullable)     // Why this artifact is relevant for this card/subagent
  - pk: (`card_id`, `context_artifact_id`)
- `CardRequirement`
  - `id` (uuid, pk)
  - `card_id` (uuid, fk, indexed)
  - `text` (text, required)
  - `status` (`knowledge_item_status`, required)
  - `source` (`knowledge_item_source`, required)
  - `confidence` (numeric, nullable)   // 0..1 confidence for agent-generated items
  - `position` (int, required)
  - `created_at`, `updated_at`
- `CardKnownFact`
  - `id` (uuid, pk)
  - `card_id` (uuid, fk, indexed)
  - `text` (text, required)
  - `evidence_source` (text, nullable) // citation/source doc reference
  - `status` (`knowledge_item_status`, required)
  - `source` (`knowledge_item_source`, required)
  - `confidence` (numeric, nullable)
  - `position` (int, required)
  - `created_at`, `updated_at`
- `CardAssumption`
  - `id` (uuid, pk)
  - `card_id` (uuid, fk, indexed)
  - `text` (text, required)
  - `status` (`knowledge_item_status`, required)
  - `source` (`knowledge_item_source`, required)
  - `confidence` (numeric, nullable)
  - `position` (int, required)
  - `created_at`, `updated_at`
- `CardQuestion`
  - `id` (uuid, pk)
  - `card_id` (uuid, fk, indexed)
  - `text` (text, required)
  - `status` (`knowledge_item_status`, required)
  - `source` (`knowledge_item_source`, required)
  - `confidence` (numeric, nullable)
  - `position` (int, required)
  - `created_at`, `updated_at`
- `CardPlannedFile` (MVP architecture checkpoint artifact)
  - `id` (uuid, pk)
  - `card_id` (uuid, fk, indexed)
  - `logical_file_name` (text, required)
  - `module_hint` (text, nullable)
  - `artifact_kind` (`planned_file_kind`, required)  // app-form artifacts only
  - `action` (`planned_file_action`, required)
  - `intent_summary` (text, required)   // What code this file should contain/do
  - `contract_notes` (text, nullable)   // Data/API/interface expectations
  - `status` (`planned_file_status`, required)
  - `position` (int, required)
  - `created_at`, `updated_at`

### Architecture View Entities (Optional, V2+ Enrichment)
- `CodeFile`
  - `id` (uuid, pk)
  - `project_id` (uuid, fk, indexed)
  - `path` (text, required, unique per project)
  - `name` (text, required)
  - `type` (`file_type`, required)
  - `description` (text, nullable)
  - `code` (text, nullable)
  - `created_at`, `updated_at`
- `CardCodeFile` (many-to-many)
  - `card_id` (uuid, fk, indexed)
  - `code_file_id` (uuid, fk, indexed)
  - `link_type` (`implementation | test`, required)
  - pk: (`card_id`, `code_file_id`, `link_type`)
- `DataFlow` is optional and non-blocking for MVP orchestration.

### Planning Action Entities
- `PlanningAction`
  - `id` (uuid, pk)
  - `project_id` (uuid, fk, indexed)
  - `action_type` (`createWorkflow | createActivity | createStep | createCard | updateCard | reorderCard | linkContextArtifact | upsertCardPlannedFile | approveCardPlannedFile | upsertCardKnowledgeItem | setCardKnowledgeStatus`, required)
  - `target_ref` (jsonb, required)
  - `payload` (jsonb, required)
  - `validation_status` (`accepted | rejected`, required)
  - `rejection_reason` (text, nullable)
  - `applied_at` (timestamptz, nullable)

### Execution Policy and Input Snapshot
- `SystemPolicyProfile` (project-level always-on execution constraints)
  - `id` (uuid, pk)
  - `project_id` (uuid, fk, indexed, unique)
  - `required_checks` (`run_check_type`[], required)
  - `protected_paths` (text[], nullable)
  - `forbidden_paths` (text[], nullable)
  - `dependency_policy` (jsonb, required)
  - `security_policy` (jsonb, required)
  - `architecture_policy` (jsonb, required)
  - `approval_policy` (jsonb, required)
  - `updated_at` (timestamptz, required)

### Memory and Retrieval (RuVector)

RuVector is the memory substrate, embedded in claude-flow on the dedicated host. It provides semantic search, GNN self-learning, local embedding generation, and historical snapshot storage. Dossier interacts with RuVector exclusively through claude-flow's MCP tools (`memory_store`, `memory_search`, `memory_list`).

**Content Memory (MemoryUnits)**
- `MemoryUnit` (minimal wrapper around RuVector entries)
  - `id` (uuid, pk)
  - `content_type` (`inline | link`, required)
  - `mime_type` (text, nullable)
  - `title` (text, nullable)
  - `content_text` (text, nullable)   // markdown/code/summary for inline units
  - `link_url` (text, nullable)       // URL or external reference for link units
  - `status` (`draft | approved | rejected`, required)
  - `embedding_ref` (text, required)  // vector id pointer in RuVector
  - `updated_at` (timestamptz, required)
- `MemoryUnitRelation` (many-to-many scope mapping)
  - `memory_unit_id` (uuid, fk, indexed)
  - `entity_type` (`project | workflow | activity | step | card | schema`, required)
  - `entity_id` (uuid/text, required)
  - `relation_role` (`source | supports | constrains`, nullable)
  - pk: (`memory_unit_id`, `entity_type`, `entity_id`)
- `MemoryRetrievalLog` (optional, minimal observability)
  - `id` (uuid, pk)
  - `query_text` (text, required)
  - `scope_entity_type` (`project | workflow | activity | step | card | schema`, required)
  - `scope_entity_id` (uuid/text, required)
  - `result_memory_ids` (uuid[], required)
  - `created_at` (timestamptz, required)

**Historical Snapshots (RuVector-only; no Postgres table)**
- Stored directly in RuVector as append-only entries.
- Structure per snapshot:
  - `embedding` (vector): from `title + description + status + planned_files_summary` (or equivalent).
  - `metadata`: `card_id`, `project_id`, `workflow_id`, `timestamp`, `status`, `event_type` (e.g. `status_transition`, `planned_file_approved`, `build_trigger`).
- Enables retrieval: "find past card states similar to this one" and GNN learning from build outcomes.

### Orchestration and Agent Execution
- `OrchestrationRun`
  - `id` (uuid, pk)
  - `project_id` (uuid, fk, indexed)
  - `scope` (`build_scope`, required)
  - `workflow_id` (uuid, nullable, indexed)
  - `card_id` (uuid, nullable, indexed)
  - `trigger_type` (`card | workflow | manual`, required)
  - `status` (`run_status`, required)
  - `initiated_by` (text, required)
  - `repo_url` (text, required)
  - `base_branch` (text, required)
  - `system_policy_profile_id` (uuid, fk `SystemPolicyProfile.id`, required)
  - `system_policy_snapshot` (jsonb, required) // immutable system-wide policy at run start
  - `run_input_snapshot` (jsonb, required)     // immutable per-build inputs at run start
  - `worktree_root` (text, nullable)
  - `started_at`, `ended_at`
- `CardAssignment`
  - `id` (uuid, pk)
  - `run_id` (uuid, fk, indexed)
  - `card_id` (uuid, fk, indexed)
  - `agent_role` (`agent_role`, required)
  - `agent_profile` (text, required)
  - `feature_branch` (text, required)
  - `worktree_path` (text, nullable)
  - `allowed_paths` (text[], required)
  - `forbidden_paths` (text[], nullable)
  - `assignment_input_snapshot` (jsonb, required) // immutable prompt/context/constraints for worker
  - `status` (`run_status`, required)
  - unique: (`run_id`, `card_id`, `agent_profile`)
- `AgentExecution`
  - `id` (uuid, pk)
  - `assignment_id` (uuid, fk, indexed)
  - `status` (`run_status`, required)
  - `started_at`, `ended_at`
  - `summary` (text, nullable)
  - `error` (text, nullable)
- `AgentCommit`
  - `id` (uuid, pk)
  - `assignment_id` (uuid, fk, indexed)
  - `sha` (text, required)
  - `branch` (text, required)
  - `message` (text, required)
  - `committed_at` (timestamptz, required)

### Quality Gates and Approval
- `RunCheck`
  - `id` (uuid, pk)
  - `run_id` (uuid, fk, indexed)
  - `check_type` (`run_check_type`, required)
  - `status` (`passed | failed | skipped`, required)
  - `output` (text, nullable)
  - `executed_at`
- `PullRequestCandidate`
  - `id` (uuid, pk)
  - `run_id` (uuid, fk, indexed, unique)
  - `base_branch` (text, required)
  - `head_branch` (text, required)
  - `title` (text, required)
  - `description` (text, required)
  - `status` (`pr_status`, required)
  - `pr_url` (text, nullable)
  - `created_at`
- `ApprovalRequest`
  - `id` (uuid, pk)
  - `run_id` (uuid, fk, indexed)
  - `approval_type` (`create_pr | merge_pr`, required)
  - `status` (`approval_status`, required)
  - `requested_by` (text, required)
  - `requested_at` (timestamptz, required)
  - `resolved_by` (text, nullable)
  - `resolved_at` (timestamptz, nullable)
  - `notes` (text, nullable)

### Audit and Observability
- `EventLog`
  - `id` (uuid, pk)
  - `project_id` (uuid, fk, indexed)
  - `run_id` (uuid, nullable, indexed)
  - `event_type` (text, required)  // e.g. planning_action_applied, memory_committed
  - `actor` (text, required)       // user, planning_engine, coder_agent
  - `payload` (jsonb, required)
  - `created_at` (timestamptz, required)

### Relationship Rules
- `Project` 1:N `Workflow`, `ContextArtifact`, `CodeFile`, `OrchestrationRun`.
- `Project` 1:1 `SystemPolicyProfile`.
- `MemoryUnit` is associated to project/workflow/activity/step/card/schema via `MemoryUnitRelation`.
- `Project` 1:N `PlanningAction`.
- `Workflow` 1:N `WorkflowActivity`; `WorkflowActivity` 1:N `Step`; `Step` 1:N `Card` (with `workflow_activity_id` fallback).
- `Card` N:M `ContextArtifact` via `CardContextArtifact`.
- `Card` 1:N `CardPlannedFile` (required for build-ready cards in MVP).
- `Card` N:M `CodeFile` via `CardCodeFile`.
- `OrchestrationRun` 1:N `CardAssignment`, `RunCheck`, `ApprovalRequest`.
- `CardAssignment` 1:N `AgentExecution`, `AgentCommit`.

### Integrity Constraints
- No merge operation may execute unless an `ApprovalRequest` exists with:
  - `approval_type = merge_pr`
  - `status = approved`
  - `resolved_by` non-null.
- Every `OrchestrationRun` must include immutable `system_policy_snapshot` and `run_input_snapshot`.
- `run_input_snapshot` must be validated against the active `SystemPolicyProfile` at run creation.
- `CardAssignment.feature_branch` must not equal project `default_branch`.
- `allowed_paths` must be non-empty for all coding assignments.
- `CardAssignment.assignment_input_snapshot` must include all context/materialized IDs used for prompt construction.
- `CardAssignment.forbidden_paths` must be enforced when present.
- Planning actions with code-generation intents must be rejected (`validation_status = rejected`).
- `ContextArtifact` requires at least one of `content`, `uri`, or `integration_ref`.
- Planning services are read-only against connected repositories.
- Build execution for a card requires at least one `CardPlannedFile` with `status = approved`.
- Only orchestration/subagent execution may write to connected repositories.
- Memory retrieval ranking must prioritize card-scoped approved `MemoryUnit` records before broader project records.
- Session/invocation data must not override approved project/card artifacts.
- `CardPlannedFile.artifact_kind` must not include test artifacts; tests are generated at build-time by orchestration.
- `OrchestrationRun.scope = workflow` requires `workflow_id` and null `card_id`.
- `OrchestrationRun.scope = card` requires `card_id` and may include optional `workflow_id`.
- `CardRequirement`, `CardKnownFact`, `CardAssumption`, and `CardQuestion` must have explicit `status`.
- `rejected` knowledge items must be excluded from orchestration retrieval payloads.
- `approved` knowledge items are authoritative over `draft` in prompt construction.
- `MemoryUnit.content_type = inline` requires non-null `content_text`.
- `MemoryUnit.content_type = link` requires non-null `link_url`.
- `MemoryUnit.status = rejected` must be excluded from retrieval payloads.
- Checks in `SystemPolicyProfile.required_checks` must execute for every run before approval requests.
- `integration` checks are mandatory for `workflow` scope and cannot be skipped by per-build overrides.
- `e2e` checks may be scoped by policy profile but cannot be silently omitted when required by policy.

### Indexing Baseline
- Composite indexes:
  - `Card(step_id, priority)`
  - `Step(workflow_activity_id, position)`
  - `WorkflowActivity(workflow_id, position)`
  - `MemoryUnit(status, updated_at desc)`
  - `MemoryUnitRelation(entity_type, entity_id, memory_unit_id)`
  - `OrchestrationRun(project_id, scope, status, created_at desc)`
  - `OrchestrationRun(workflow_id, status, created_at desc)`
  - `OrchestrationRun(card_id, status, created_at desc)`
  - `CardAssignment(run_id, status)`
  - `EventLog(project_id, run_id, created_at desc)`
- Unique indexes:
  - `CodeFile(project_id, path)`
  - `PullRequestCandidate(run_id)`

## Opportunities
- Faster idea-to-spec conversion with visual, editable structured planning.
- Improved coding quality through narrow context assignment per card.
- Reduced regression risk via human checkpoints and test gates.
- Reusable cross-project memory that compounds learning across builds.
- Self-learning from historical card snapshots: retrieval improves as the GNN learns which past states correlate with successful builds.
- Future monetization path through orchestration insights and memory intelligence.

## Risks and Mitigations

### Risk: Planning and coding concerns bleed together
- Mitigation:
  - Enforce separate APIs and schemas.
  - Reject planning actions containing code-generation intents.

### Risk: Agents overreach card boundaries and create integration conflicts
- Mitigation:
  - Per-card allowed-path constraints.
  - Required integration check agent before PR approval.

### Risk: Memory contamination across projects, cards, or invocations
- Mitigation:
  - Strict metadata partitioning (`projectId`, `workflowId`, `stepId`, `cardId`, `repo`, `invocationId`).
  - Scoped retrieval policies by default; broad retrieval only for integration tasks.

### Risk: Incorrect or low-quality LLM outputs mutate map state
- Mitigation:
  - Schema validation + confidence gates.
  - Transaction-like apply/revert map operations.
  - User-visible change preview for major mutations.

### Risk: Hidden failures in orchestration pipeline
- Mitigation:
  - Event logging at each stage (`memory_committed`, `agent_run_started`, `tests_passed`, `approval_requested`).
  - Retries with deterministic execution snapshots.

### Risk: Security/privacy leaks in context or memory
- Mitigation:
  - Redaction rules for secrets before memory writes.
  - Least-privilege credentials for GitHub and orchestration services.

### Risk: Historical snapshot sync lag or loss when RuVector/claude-flow host is unavailable
- Mitigation:
  - Snapshot pipeline is async; Postgres mutations never block on RuVector.
  - Queue snapshots for retry on failure; optionally replay from EventLog if needed.
  - Learning degrades gracefully; retrieval falls back to exact card/project scoping from Postgres when semantic search is unavailable.
  - RuVector data persists on the dedicated host's persistent volume; survives container restarts.

### Risk: claude-flow alpha instability
- Mitigation:
  - Pin exact claude-flow version in deployment config.
  - Mock client auto-activates when claude-flow is unavailable (existing pattern from `claude-flow-client.ts`).
  - Dossier enforces constraints independently (allowed_paths, policy) regardless of claude-flow behavior.
  - Pre-commit hook on feature branches rejects out-of-scope file changes as defense-in-depth.

### Risk: Dedicated host downtime blocks builds
- Mitigation:
  - Dossier detects timeout on MCP calls, marks run as failed, allows retry.
  - Planning and all non-build workflows continue to function (Vercel + Supabase are independent).
  - No data loss: all content and metadata are in Postgres; only vectors and GNN weights are on the dedicated host.

## Guardrails and Non-Negotiables
- No direct coding actions from planning interactions.
- No auto-merge to `main`.
- Mandatory test/lint gates before approval request.
- Mandatory system-wide checks (`dependency`, `security`, `policy`) before approval request.
- Immutable run records for auditability.
- Explicit user approvals for PR-impacting actions.

## Validation Strategy
- Contract tests (core-first):
  - Slice A contracts first (`Project`, `Workflow`, `WorkflowActivity`, `Step`, `Card`, `PlanningAction`).
  - Planning action schema validation and rejection paths.
  - Orchestration command schema and card-boundary enforcement.
- Integration tests (core-first):
  - Core CRUD API contracts for planning state and action submission.
  - Deterministic mutation pipeline behavior (`validate -> preview -> apply`) with rollback semantics.
- End-to-end tests (adaptive, minimal):
  - Idea -> context artifact/map updates.
  - Planned-file approval -> build trigger eligibility.
  - Build run -> claude-flow dispatch via MCP -> status reconciliation.
- Regression checks:
  - Existing canvas/chat interactions remain functional.
  - UI smoke checks for modified screens.

### Test Core Policy (MVP)
- Prioritize a lean, high-signal test core over broad low-signal coverage.
- Test hierarchy:
  1. Contract and mutation tests as source of truth.
  2. Integration tests for API and orchestration boundaries.
  3. A minimal adaptive E2E suite for critical user journeys.
- Avoid snapshot-heavy UI testing except for a very small number of stable containers.

## Prototype-to-Realtime MVP Delta Plan (Implementation Order)
This is the concrete transition path from the current UI-heavy prototype to a production-reliable real-time story map system.

### MVP Delivery Decisions (Feb 2026)
- Schema rollout is iterative to reduce migration and test bloat risk:
  - Slice A: core planning entities + `PlanningAction`.
  - Slice B: context/knowledge/planned-file entities.
  - Slice C: execution/checks/approval/audit entities.
- Authentication and RLS are deferred for initial proof-of-concept validation.
  - Scope: prove planning/build correctness first, then harden auth and policy enforcement layers.
- Adaptive E2E strategy is preferred for MVP critical paths; selector brittleness should not be a core failure mode.

### Phase 1: Contract Hardening (UI + Types)
- Freeze canonical map contracts:
  - `Workflow -> WorkflowActivity -> Step -> Card`
  - `PlanningAction` as the only mutation contract.
- Align frontend types/components to canonical schema and remove prototype-only contract drift.
- Introduce client-side action validation helpers to reject malformed mutations before API calls.
- Exit criteria:
  - UI compiles with canonical contracts only.
  - No direct state mutation paths outside typed action handlers.

### Phase 2: Persistence and API Baseline
- Implement persistent storage for planning entities and action logs.
- Add API endpoints for:
  - Fetching canonical map snapshots.
  - Submitting mutation actions.
  - Fetching action history and run metadata.
- Record immutable snapshots for map state and accepted actions.
- Exit criteria:
  - Refresh-safe persistence for all map edits.
  - Snapshot reconstruction from action history is deterministic.

### Phase 3: Deterministic Mutation Pipeline
- Implement server-side `validate -> dry-run -> preview -> apply` flow.
- Add transactional apply with automatic rollback on partial failure.
- Persist preview deltas and apply outcomes for auditability.
- Exit criteria:
  - 100% of state changes pass through the deterministic pipeline.
  - Rollback works for all failed multi-action mutations.

### Phase 4: Real-Time Sync and Multi-Client Consistency
- Add event transport for accepted action deltas and run status updates.
- Broadcast only accepted/applied actions; never broadcast unvalidated proposals.
- Add ordering/version controls to prevent out-of-order client state.
- Exit criteria:
  - Two clients converge to identical map state under concurrent edits.
  - Reconnect/resubscribe reliably rehydrates latest canonical state.

### Phase 5: Canonical Planning Skill Integration
- Standardize on one planning skill (`story-map-planner-v1`) with strict deterministic output.
- Skill outputs only `PlanningAction[]` payloads, never free-form map patches.
- Add fixture suite (gold + adversarial) to gate skill/prompt updates.
- Exit criteria:
  - Action schema validity >= 99%.
  - Preview/apply mismatch <= 0.5%.

### Phase 6: Build Handshake and Always-On Checks
- Enforce approved planned files before build triggers.
- Materialize `system_policy_snapshot`, `run_input_snapshot`, and `assignment_input_snapshot` at run start.
- Enforce mandatory checks (`dependency`, `security`, `policy`) plus required build matrix checks.
- Exit criteria:
  - No run can request approval without required checks completed.
  - Card/workflow scope constraints are consistently enforced.

### Phase 7: MVP Hardening and Go-Live Gates
- Add end-to-end coverage for:
  - Idea -> map mutation -> persisted state -> realtime sync.
  - Build trigger -> assignment -> checks -> approval request.
- Add operational dashboards for rejection rates, rollback frequency, and sync lag.
- Exit criteria:
  - Stable realtime planning experience under target load.
  - Safety and quality thresholds met for MVP launch.

### AI Development Timeline (MVP)
- Phase 1-2: ~2-4 days.
- Phase 3-4: ~3-6 days.
- Phase 5: ~1-2 days.
- Phase 6-7: ~3-5 days.
- Total: ~9-17 days for a reliable realtime MVP baseline.

## Rollout Strategy
1. Internal feature flags for planning-context API and orchestrator API.
2. Planning context engine in read/write mode while orchestrator remains dry-run.
3. Enable orchestrator branch write mode for selected cards.
4. Enable PR draft generation after stable run metrics.
5. Maintain merge approval gate permanently.

## Success Metrics
- Planning quality:
  - Percentage of idea sessions that produce complete map structures.
- Execution quality:
  - Card runs that pass tests on first orchestration attempt.
- Safety:
  - Zero unauthorized merges and zero boundary-violation incidents.
- Usability:
  - Time from idea submission to first approved draft PR.

## Out of Scope for Initial Release
- Fully autonomous merge to protected branches.
- Unbounded repo-wide agent edits.
- Multi-repo deployment automation.
- Replacing human product decision-making in planning curation.

## Phase 0 Exit Criteria
- Strategy document approved.
- Boundary rules accepted by stakeholders.
- Architecture and safety principles referenced in implementation tickets.
- Phase 1 can begin with API and direct Claude client scaffolding.
