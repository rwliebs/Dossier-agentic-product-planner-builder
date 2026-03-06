# ADR 0011: RVF Package Structure for Self-Contained Agents

- Status: Proposed
- Date: 2026-03-06

## Context

Dossier currently dispatches agents via agentic-flow's `query()` with system prompts and tool permissions (ADR 0008). Agents run in the host process with full filesystem access scoped only by `cwd`. This model has measurable limitations:

| Limitation | Current State | Impact |
|------------|---------------|--------|
| **No isolation** | Agents share host OS, network, filesystem | Misbehaving agent can affect host or other agents |
| **No portability** | Agent = system prompt + host toolchain | Reproducing environment requires full machine setup |
| **No composability** | All agents share one undifferentiated runtime | Cannot bundle agent-specific models, indices, or runtimes |
| **No verifiability** | No cryptographic chain from definition to execution | Cannot prove what ran, attest capabilities, or audit operations |
| **No progressive readiness** | Agent loads all context upfront or not at all | Large knowledge bases delay agent startup |

The **RVF (RuVector Format)** addresses all five gaps. RVF is an existing binary format implemented in the `ruvector` ecosystem (14 Rust crates, 4 npm packages, 1,156 tests) that merges database, model, graph engine, kernel, and attestation into a single deployable `.rvf` file.

The native Rust HNSW and vector primitives in `wyr-ruvector` (ADR 0010) validate the same algorithms that power RVF's INDEX_SEG and VEC_SEG segments, providing the foundation for this proposal.

### What is OpenClaw

OpenClaw is an open-source contract lifecycle and legal automation system. Integrating OpenClaw agents into Dossier enables:

- Contract drafting and review as planning artifacts (cards with legal clause requirements).
- Automated compliance checks as build-time run checks.
- Legal knowledge retrieval via HNSW embeddings over clause libraries.

OpenClaw agents require isolated execution (sensitive contract data), specialized toolchains (NLP models, clause parsers), and attestable outputs (signed contract artifacts). These requirements generalize to any agent handling sensitive data or needing a controlled runtime.

## Decision

Adopt the **RVF (RuVector Format)** as the packaging and execution substrate for self-contained agents in Dossier and OpenClaw. Each agent is a single `.rvf` file containing up to 24 segment types that encode everything from vector indices to embedded Linux kernels.

### RVF Segment Architecture

An `.rvf` file is a single binary with 64-byte-aligned, self-describing segments. Each segment header carries magic `0x52564653` ("RVFS"), a type code, flags, payload hash, and compression indicator.

#### Segment Header (64 bytes)

```
Offset  Size  Field
0x00    4     magic              0x52564653 ("RVFS")
0x04    1     version            Currently 1
0x05    1     seg_type           0x01-0x32
0x06    2     flags              COMPRESSED|SIGNED|ATTESTED|SEALED|HAS_LINEAGE|...
0x08    8     segment_id         Monotonically increasing
0x10    8     payload_length     Bytes
0x18    8     timestamp_ns       Nanosecond UNIX
0x20    1     checksum_algo      0=CRC32C, 1=XXH3-128, 2=SHAKE-256
0x21    1     compression        0=none, 1=LZ4, 2=ZSTD
0x22    6     reserved           Must be zero
0x28    16    content_hash       First 128 bits of payload hash
0x38    4     uncompressed_len   Original size before compression
0x3C    4     alignment_pad      Padding to 64-byte boundary
```

#### 24 Segment Types

**Data & Indexing**

| Code | Name | Agent Use |
|------|------|-----------|
| `0x01` | VEC_SEG | Agent knowledge embeddings (fp16/fp32/int8/int4/binary) |
| `0x02` | INDEX_SEG | HNSW adjacency with progressive A/B/C loading |
| `0x05` | MANIFEST_SEG | Segment directory, epoch state, FileIdentity, agent profile |
| `0x06` | QUANT_SEG | Quantization codebooks for compressed search |
| `0x07` | META_SEG | Key-value metadata (agent config, tool declarations, domain knowledge) |
| `0x08` | HOT_SEG | Temperature-promoted frequently-accessed vectors |
| `0x0D` | META_IDX_SEG | Inverted indexes for filtered metadata search |

**AI / Models**

| Code | Name | Agent Use |
|------|------|-----------|
| `0x03` | OVERLAY_SEG | LoRA adapter deltas for fine-tuned agent behavior |
| `0x09` | SKETCH_SEG | Access sketches, VQE snapshots |
| `0x0B` | PROFILE_SEG | Agent role, model, tools, constraints, resource limits |
| `0x30` | TRANSFER_PRIOR | Transfer learning priors between agent generations |
| `0x31` | POLICY_KERNEL | Thompson Sampling policy for adaptive routing |
| `0x32` | COST_CURVE | Cost/reward optimization data |

**Compute**

| Code | Name | Agent Use |
|------|------|-----------|
| `0x0E` | KERNEL_SEG | Compressed Linux unikernel (200KB-2MB), KernelBinding footer |
| `0x0F` | EBPF_SEG | Kernel-space vector acceleration (XDP/TC/socket) |
| `0x10` | WASM_SEG | WASM microkernel: 5.5KB tile or 46KB control plane |

**Security**

| Code | Name | Agent Use |
|------|------|-----------|
| `0x04` | JOURNAL_SEG | Mutation log and deletion records |
| `0x0A` | WITNESS_SEG | Tamper-evident SHAKE-256 hash-chained audit trail |
| `0x0C` | CRYPTO_SEG | Ed25519 + ML-DSA-65 + SLH-DSA-128s signatures |

**Branching**

| Code | Name | Agent Use |
|------|------|-----------|
| `0x20` | COW_MAP_SEG | Cluster ownership for copy-on-write derivation |
| `0x21` | REFCOUNT_SEG | Per-cluster reference counts (rebuildable) |
| `0x22` | MEMBERSHIP_SEG | Vector visibility bitmaps for branch filtering |
| `0x23` | DELTA_SEG | Sparse delta patches and LoRA overlays |

### Three-Tier Execution Model

The same `.rvf` file can execute at three tiers. Dossier selects the tier based on the agent's PROFILE_SEG and host capabilities.

| Tier | Segment | Environment | Boot Time | Use Case |
|------|---------|-------------|-----------|----------|
| 1 | WASM_SEG (5.5KB) | Browser / Node.js / edge | <1ms | Lightweight search, preview, embedding queries |
| 2 | EBPF_SEG (10-50KB) | Linux kernel (XDP/TC) | <20ms | Kernel-space vector acceleration |
| 3 | KERNEL_SEG (200KB-2MB) | Firecracker / QEMU / TEE | <125ms | Full isolated agent with Linux filesystem |

### MANIFEST_SEG and Cold Boot

The MANIFEST_SEG carries a 4KB Level-1 root at EOF:

- Segment directory with offsets to all segments
- Hotset pointers (HNSW entry points, centroids, quantization dicts)
- Epoch counter and generation tracking
- Vector count and dimension
- FileIdentity: `file_id` (16B UUID) + `parent_id` (16B) + `parent_manifest_hash` (32B SHAKE-256) + `depth` (4B)
- Agent profile reference (role, model, tools, constraints)
- Security policy hash

Cold boot from the 4KB manifest: **1.6 microseconds**. Append-only design: incomplete writes are ignored on recovery (no WAL needed).

### Progressive HNSW Loading (INDEX_SEG)

| Layer | Load Time | Recall@10 | Content |
|-------|-----------|-----------|---------|
| A | Microseconds | >= 70% | Entry points + centroids from manifest hotset |
| B | Background | >= 85% | Hot region adjacency links |
| C | Background | >= 95% | Full HNSW graph |

Agents answer queries at Layer A immediately. The `wyr-ruvector` HNSW implementation (ADR 0010) validates the same multi-layer search algorithm.

### KERNEL_SEG for Isolated Agents

| Field | Size | Description |
|-------|------|-------------|
| `arch` | 1B | x86_64, aarch64, riscv64, arm |
| `kernel_type` | 1B | Linux, Hermit, MicroVM |
| `flags` | 2B | HAS_QUERY_API, HAS_NETWORKING, HAS_SSH |
| `api_port` | 2B | RVF query server TCP port |

Payload: compressed bzImage + cpio initramfs + embedded manifest snapshot. A **128-byte KernelBinding footer** contains SHAKE-256(MANIFEST_SEG), preventing segment-swap attacks — the kernel is cryptographically bound to its agent's manifest. Boot time: **<125ms** on Firecracker/QEMU with KVM.

### COW Branching for Agent Derivation

Copy-on-write at cluster granularity (~256KB per cluster):

```
base-agent.rvf (1M vectors, ~512MB)
  → rvf derive --mode filter --include "contract-law"
  → openclaw-base.rvf (~2.5MB child, inherits parent's shared HNSW)

  → rvf derive --mode lora --overlay jurisdiction-fine-tune.delta
  → openclaw-california.rvf (delta child with jurisdiction LoRA)
```

Children carry a `FileIdentity` with `parent_id` and `parent_manifest_hash`, creating a cryptographic lineage chain verifiable without accessing the parent file.

### Security Architecture

**Witness Chains (WITNESS_SEG)**: Every operation hash-chained into a tamper-evident ledger. Each 73-byte entry: `prev_hash` (32B SHAKE-256) + `action_hash` (32B) + `timestamp_ns` (8B) + `witness_type` (1B). Types include PROVENANCE, COMPUTATION, SEARCH, DELETION, TEE_ATTESTATION (SGX/SEV-SNP/TDX/CCA), and LINEAGE events. Modifying any byte breaks all subsequent verification.

**Cryptographic Signing (CRYPTO_SEG)**:

| Algorithm | Signature Size | Purpose |
|-----------|---------------|---------|
| Ed25519 | 64B | Classical NIST EdDSA |
| ML-DSA-65 | 2,420B | Post-quantum lattice (FIPS 204) |
| SLH-DSA-128s | 2,144B | Post-quantum stateless hash (FIPS 205) |

Dual-signing (Ed25519 + ML-DSA-65) provides forward security against quantum attacks.

**7-step fail-closed verification** before any execution: segment integrity → manifest consistency → dual-signature → witness chain → kernel binding → lineage → TEE measurement.

**eBPF Acceleration (EBPF_SEG)**: Kernel-space distance computation (cosine, Euclidean, hamming), metadata filtering, and request routing. Acceleration-only — no auth decisions in eBPF. Graceful fallback: if eBPF attachment fails, the file remains fully functional.

### Dossier Integration

```
User triggers card build
  → createAssignment (executor: 'rvf', rvf_package: 'agent-name@version')
  → Resolve .rvf file (local cache or registry)
  → 7-step verification
  → Tier selection from PROFILE_SEG + host capabilities:
      Tier 1 (WASM): Load WASM_SEG in-process
      Tier 2 (eBPF): Attach EBPF_SEG + WASM_SEG
      Tier 3 (Kernel): rvf launch → Firecracker microVM
  → Agent loads INDEX_SEG (progressive HNSW: Layer A immediate)
  → Agent queries VEC_SEG, reads META_SEG
  → Operations recorded in WITNESS_SEG
  → Agent writes outputs to workdir mount (Tier 3) or returns structured result (Tier 1/2)
  → Host collects outputs
  → CRYPTO_SEG verified post-execution
  → RVF-specific RunChecks (signature, witness chain, lineage, resource compliance)
  → Standard RunCheck pipeline → ApprovalRequest → PR
```

The `CardAssignment` interface gains:

```typescript
interface CardAssignment {
  // ... existing fields from ADR 0008
  executor: 'agentic-flow' | 'rvf';
  rvf_package?: string;          // "openclaw-reviewer@0.2.0"
  rvf_package_hash?: string;     // "rvf:sha256:a1b2c3..."
}
```

### AgentDB Integration

`agentdb@3.0.0-alpha.10` uses RVF via its `ruvector` dependency for proof-gated graph intelligence. Every state mutation requires cryptographic proof.

| AgentDB Feature | RVF Segment |
|----------------|-------------|
| Episodic memory | VEC_SEG + INDEX_SEG |
| Causal reasoning | @ruvector/graph-transformer |
| Reflexion memory | JOURNAL_SEG + META_SEG |
| Skill library | OVERLAY_SEG (LoRA deltas) |
| Provenance | WITNESS_SEG + CRYPTO_SEG |
| Lifelong learning | TRANSFER_PRIOR + COW branching |

### OpenClaw Agent as RVF

An OpenClaw contract reviewer is a single `.rvf` file:

| Segment | Content |
|---------|---------|
| VEC_SEG | 50K clause embeddings + case law precedent embeddings |
| INDEX_SEG | Progressive HNSW over clause/precedent vectors |
| PROFILE_SEG | role=reviewer, model=claude-sonnet, tools=[Read,Write,Grep], network=none |
| META_SEG | Jurisdiction rules, clause taxonomy, glossary |
| KERNEL_SEG | Minimal Linux unikernel (no virtio-net for network isolation) |
| EBPF_SEG | Cosine distance accelerator for clause search |
| WASM_SEG | 5.5KB browser-preview clause search widget |
| WITNESS_SEG | Tamper-evident audit trail for legal compliance |
| CRYPTO_SEG | Ed25519 + ML-DSA-65 dual signatures |
| OVERLAY_SEG | LoRA deltas for jurisdiction-specific fine-tuning |

### CLI Commands (17 subcommands)

| Command | Purpose |
|---------|---------|
| `rvf create` | Initialize new agent store with dimension and metric |
| `rvf ingest` | Insert vectors from JSON/CSV/NumPy |
| `rvf query` | k-NN search with metadata filters |
| `rvf delete` | Remove vectors by ID |
| `rvf status` | Vector count, dimension, segment list |
| `rvf inspect` | Detailed segment metadata and headers |
| `rvf compact` | Reclaim space from deletions |
| `rvf derive` | Create child with lineage (Filter/LoRA/Snapshot) |
| `rvf serve` | HTTP REST + TCP streaming server |
| `rvf launch` | Boot in QEMU/Firecracker microVM |
| `rvf embed-kernel` | Compile and embed Linux kernel |
| `rvf embed-ebpf` | Compile C to eBPF and embed |
| `rvf filter` | Apply inclusion/exclusion membership filter |
| `rvf freeze` | Snapshot-freeze current generation |
| `rvf verify-witness` | Validate SHAKE-256 chain integrity |
| `rvf verify-attestation` | Verify KernelBinding + TEE quotes |
| `rvf rebuild-refcounts` | Recompute refcounts from COW map |

### Published Ecosystem

| Package | Registry | Version |
|---------|----------|---------|
| `rvf-types`, `rvf-runtime`, `rvf-crypto`, `rvf-index` + 10 crates | crates.io | 14 Rust crates |
| `@ruvector/rvf` | npm | 0.2.0 |
| `@ruvector/rvf-node` | npm | 0.1.7+ |
| `@ruvector/rvf-wasm` | npm | Browser/WASM runtime |
| `@ruvector/rvf-mcp-server` | npm | MCP server for Claude Code |
| `ruvector` | npm | 0.2.11 |
| `agentdb` | npm | 3.0.0-alpha.10 |

Test coverage: 1,156 passing tests across 46 examples.

## Consequences

- **Single-file agents**: All agent state — vectors, indices, kernel, models, audit trail — in one `.rvf` file. No filesystem sprawl, no environment variables, no implicit dependencies.
- **Three-tier deployment**: Same file runs in browser (WASM <1ms), kernel-accelerated (eBPF <20ms), or fully isolated (Firecracker <125ms). Host selects tier automatically.
- **Progressive loading**: 70% recall in microseconds, 95%+ as full index loads. Agents answer immediately, not after full initialization.
- **Cryptographic lineage**: FileIdentity + witness chains create verifiable, auditable provenance from parent to child. Critical for OpenClaw legal workflows.
- **Post-quantum ready**: ML-DSA-65 dual-signing alongside Ed25519 provides forward security.
- **Lightweight branching**: COW derivation creates specialized agents at ~2.5MB from 512MB parents. Jurisdiction-specific OpenClaw agents are derivations, not full copies.
- **Existing ecosystem**: No greenfield — 14 Rust crates, 4 npm packages, 1,156 tests already published and maintained.
- **Backward compatible**: `executor: 'agentic-flow'` remains the default. RVF is an additional option. Migration is per-agent, not system-wide.

## Alternatives Considered

- **Docker/OCI containers**: No embedded vector indices, no progressive loading, no witness chains. Shares host kernel (weaker isolation). No COW branching at vector level.
- **Custom tar+zstd archive**: Our original draft (v1 of this ADR). Loses the 24-segment architecture, progressive HNSW, eBPF acceleration, COW branching, and the existing ruvector ecosystem. Would require building everything from scratch.
- **WASM-only**: Good for Tier 1 workloads but cannot run full Linux toolchains (Git, compilers) for build agents. RVF includes WASM as Tier 1 alongside Tier 2/3 for complete coverage.
- **Host-process agents (current)**: No isolation, no portability, no attestation. Adequate for trusted single-user local development but insufficient for multi-tenant, sensitive, or legally-auditable workloads like OpenClaw.

## Implementation Phases

| Phase | Scope | Dependencies |
|-------|-------|-------------|
| 1 | Add `@ruvector/rvf` to Dossier; read `.rvf` files for WASM-tier queries (Tier 1) | npm install |
| 2 | Implement `RvfExecutor` in orchestration layer alongside existing `agentic-flow` executor | ADR 0008 dispatch path |
| 3 | Build OpenClaw contract-reviewer `.rvf` package with clause HNSW indices | wyr-ruvector or rvf-index |
| 4 | Enable Tier 3 execution (KERNEL_SEG via Firecracker) for isolated agents | Linux host with KVM |
| 5 | Integrate AgentDB proof-gated mutations with RVF WITNESS_SEG | agentdb@3 |

## Related

- [ADR 0010](./0010-wyr-rust-ruvector.md) — Native Rust HNSW and vector primitives that validate RVF's core algorithms
- [ADR 0008](./0008-agentic-flow-execution-plane.md) — Current execution plane that RVF extends
- [rvf-kernel-reference.md](../domains/rvf-kernel-reference.md) — Three-tier execution DDD
- [rvf-package-reference.md](../domains/rvf-package-reference.md) — Segment format DDD
- [rvf-security-reference.md](../domains/rvf-security-reference.md) — Witness chains and attestation DDD
- [rvf-runtime-reference.md](../domains/rvf-runtime-reference.md) — Agent lifecycle DDD
- [rvf-openclaw-reference.md](../domains/rvf-openclaw-reference.md) — OpenClaw agent DDD
