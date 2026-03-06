---
document_id: doc.rvf-runtime
last_verified: 2026-03-06
tokens_estimate: 800
tags:
  - rvf
  - runtime
  - lifecycle
  - agentdb
  - dossier-integration
anchors:
  - id: contract
    summary: "Agent lifecycle: verify → provision → boot (tier 1/2/3) → execute → collect → terminate"
  - id: dispatch
    summary: "CardAssignment gains executor:'rvf' with .rvf file reference"
  - id: agentdb
    summary: "agentdb@3 uses RVF via ruvector for proof-gated graph intelligence"
ttl_expires_on: null
---
# RVF Runtime Domain Reference

**Anchors**: [ADR 0011](../adr/0011-rvf-agent-packages.md), [orchestration-reference.md](orchestration-reference.md)

## Contract

### Invariants
- INVARIANT: 7-step verification passes before any execution tier boots
- INVARIANT: Agent microVM (Tier 3) terminated after task completion or timeout; no persistent VMs
- INVARIANT: All agent operations recorded in WITNESS_SEG
- INVARIANT: Outputs collected only from declared mount points / vsock channel

### Boundaries
- ALLOWED: Verify, boot (tier 1/2/3), deliver task, collect results, terminate, audit
- FORBIDDEN: Persistent VMs; agent accessing host outside mounts; skipping verification steps

---

## Agent Lifecycle

```
  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  Verify  │────▶│ Provision│────▶│   Boot   │────▶│ Execute  │
  └──────────┘     └──────────┘     └──────────┘     └────┬─────┘
       │                                                   │
   REJECT if                              ┌────────────────┤
   any step                               ▼                ▼
   fails                           ┌──────────┐    ┌───────────┐
                                   │ Collect  │    │  Timeout  │
                                   └────┬─────┘    └─────┬─────┘
                                        │                │
                                        ▼                ▼
                                   ┌──────────────────────────┐
                                   │       Terminate          │
                                   └──────────────────────────┘
```

### 1. Verify

Run the 7-step fail-closed verification pipeline (see [rvf-security-reference.md](rvf-security-reference.md)):
- Segment integrity, manifest consistency, dual-signature, witness chain, kernel binding, lineage, TEE

### 2. Provision

Based on PROFILE_SEG, select execution tier:

| Check | Result |
|-------|--------|
| `requires_isolation` + host has KVM | Tier 3 (KERNEL_SEG) |
| `benefits_from_acceleration` + host has BPF | Tier 2 (EBPF_SEG) + Tier 1 |
| Otherwise | Tier 1 (WASM_SEG) |

Prepare tier-specific resources:
- **Tier 3**: Configure VMM (vCPUs, memory, virtio devices, mount points)
- **Tier 2**: Load eBPF bytecode, check BTF availability
- **Tier 1**: Instantiate WASM runtime

### 3. Boot

- **Tier 3**: `rvf launch` → extract KERNEL_SEG → verify KernelBinding → VMM direct boot → kernel init → mount rootfs → load INDEX_SEG Layer A → open vsock
- **Tier 2**: Attach eBPF to XDP/TC/socket hooks → programs accelerate vector ops in kernel space
- **Tier 1**: Load WASM_SEG → instantiate in wasmtime/browser/V8 → load INDEX_SEG progressively

### 4. Execute

| Tier | Task Delivery | Execution | Output |
|------|--------------|-----------|--------|
| 3 | vsock message (JSON payload) | Linux process in microVM; full filesystem | Files on /work mount; vsock DONE message |
| 2 | Host process call | eBPF acceleration + userspace logic | In-memory results |
| 1 | WASM function call | Sandboxed WASM; progressive HNSW queries | Return value / structured output |

During Tier 3 execution:
- Agent loads HNSW from INDEX_SEG (Layer A immediate: 70% recall; B/C in background)
- Queries VEC_SEG for similarity search
- Reads META_SEG for agent config and domain knowledge
- Applies OVERLAY_SEG deltas if fine-tuned
- Operations recorded in WITNESS_SEG
- Heartbeats every 5s via vsock; missed heartbeat triggers timeout

### 5. Collect

- **Tier 3**: Host reads vsock DONE message; scans /work mount; computes diff; extracts result payload
- **Tier 2**: Results already in host memory
- **Tier 1**: WASM return value captured

All tiers produce a `CollectedResult`:
```
CollectedResult {
  exit_code: u8,
  files: Vec<FileEntry>,       // New/modified files
  diff: DiffSummary,           // Changes vs pre-execution
  summary: String,             // Agent-produced summary
  witness_entries: Vec<Hash>,  // New WITNESS_SEG entries from this run
  metrics: ExecutionMetrics,   // Duration, memory peak, vector queries
}
```

### 6. Terminate

- **Tier 3**: VMM kills microVM; release virtio devices; destroy ephemeral block device
- **Tier 2**: Detach eBPF programs from hooks
- **Tier 1**: Drop WASM instance

Log execution record and store in Dossier run history.

---

## Dossier Dispatch Integration

### Assignment Extension

```typescript
interface CardAssignment {
  // ... existing fields from ADR 0008
  executor: 'agentic-flow' | 'rvf';       // NEW: execution backend
  rvf_package?: string;                     // "openclaw-reviewer@0.2.0"
  rvf_package_hash?: string;                // "rvf:sha256:a1b2c3..."
  rvf_tier_override?: 1 | 2 | 3;          // Force specific tier (optional)
}
```

### Dispatch Path

```
Existing (ADR 0008):
  createAssignment → agentic-flow client → query() → host-process tools

New (ADR 0011):
  createAssignment (executor: 'rvf')
    → Resolve .rvf file (local cache or registry pull)
    → 7-step verification
    → Tier selection from PROFILE_SEG
    → Boot selected tier
    → Deliver task (card requirements, context paths, instructions)
    → Monitor execution (heartbeats, logs)
    → Collect results
    → Terminate
    → CollectedResult feeds into existing RunCheck pipeline
```

### Run Checks

RVF-specific checks added to the existing pipeline:

| Check | Description |
|-------|-------------|
| `rvf-signature` | Package signature valid against trust store |
| `rvf-witness` | Witness chain unbroken post-execution |
| `rvf-lineage` | FileIdentity chain valid if derived package |
| `rvf-resource` | Execution stayed within declared resource limits |

---

## AgentDB Integration

`agentdb@3.0.0-alpha.10` uses RVF via the `ruvector` dependency for proof-gated graph intelligence:

| AgentDB Feature | RVF Segment |
|----------------|-------------|
| Episodic memory | VEC_SEG + INDEX_SEG (HNSW) |
| Causal reasoning | GRAPH_SEG via @ruvector/graph-transformer |
| Reflexion memory | JOURNAL_SEG + META_SEG |
| Skill library | OVERLAY_SEG (LoRA deltas) |
| Provenance | WITNESS_SEG + CRYPTO_SEG |
| Lifelong learning | TRANSFER_PRIOR + COW branching |

When Dossier dispatches an RVF agent, AgentDB can attach as the memory layer — reading VEC_SEG for semantic search and writing to JOURNAL_SEG for state mutations, all within the same `.rvf` file.

### MCP Integration

`@ruvector/rvf-mcp-server` exposes RVF operations as MCP tools:

| MCP Tool | Operation |
|----------|-----------|
| `rvf_query` | k-NN search with metadata filters |
| `rvf_ingest` | Insert vectors |
| `rvf_status` | File status and segment list |
| `rvf_inspect` | Detailed segment metadata |
| `rvf_derive` | Create child with lineage |
| `rvf_verify` | Run verification pipeline |

Claude Code agents can interact with `.rvf` files directly via MCP without spawning a separate process.

---

## Performance

| Metric | Target |
|--------|--------|
| Cold boot (4KB manifest) | 1.6us |
| WASM instantiation | <1ms |
| eBPF attach | <20ms |
| Kernel boot (Firecracker) | <125ms |
| First query (Layer A) | 70% recall |
| Full query (Layer C) | 95%+ recall |
| COW branch (10K vectors) | 2.6ms |

---

## Key Entities

| Entity | Description |
|--------|-------------|
| `RvfExecutor` | Dossier component: tier selection, boot, monitor, collect |
| `VerificationPipeline` | 7-step fail-closed check before execution |
| `TierSelector` | Chooses Tier 1/2/3 based on PROFILE_SEG + host |
| `CollectedResult` | Output bundle: files, diff, summary, witness, metrics |
| `ExecutionRecord` | Audit entry: package hash, duration, resources, exit |
| `AgentDbBridge` | AgentDB ↔ RVF segment read/write adapter |
| `McpServer` | @ruvector/rvf-mcp-server tool exposure |

## Related
- [ADR 0011](../adr/0011-rvf-agent-packages.md) — RVF specification
- [rvf-kernel-reference.md](rvf-kernel-reference.md) — Three-tier execution
- [rvf-package-reference.md](rvf-package-reference.md) — Segment format
- [rvf-security-reference.md](rvf-security-reference.md) — Verification pipeline
- [rvf-openclaw-reference.md](rvf-openclaw-reference.md) — OpenClaw agents
- [orchestration-reference.md](orchestration-reference.md) — Existing dispatch
