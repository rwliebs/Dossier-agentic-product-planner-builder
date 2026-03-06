---
document_id: doc.rvf-openclaw
last_verified: 2026-03-06
tokens_estimate: 800
tags:
  - rvf
  - openclaw
  - contracts
  - legal
  - agents
  - clause-search
anchors:
  - id: contract
    summary: "OpenClaw agents as .rvf files: clause HNSW, isolated kernel, witness audit"
  - id: segments
    summary: "VEC_SEG (clauses), INDEX_SEG (HNSW), KERNEL_SEG (no network), WITNESS_SEG (audit)"
  - id: workflow
    summary: "Dossier card → rvf launch → review → collect → RunCheck → approval"
ttl_expires_on: null
---
# RVF OpenClaw Domain Reference

**Anchors**: [ADR 0011](../adr/0011-rvf-agent-packages.md), [rvf-security-reference.md](rvf-security-reference.md), [memory-reference.md](memory-reference.md)

## Contract

### Invariants
- INVARIANT: OpenClaw agents boot with KERNEL_SEG flags excluding HAS_NETWORKING; contract data never leaves microVM
- INVARIANT: Clause embeddings built at package time (VEC_SEG + INDEX_SEG); no runtime embedding API calls
- INVARIANT: All contract review operations recorded in WITNESS_SEG for legal audit trail
- INVARIANT: Agent outputs flow through Dossier's standard RunCheck pipeline with human approval gate

### Boundaries
- ALLOWED: Semantic search over bundled clause indices; annotate contracts; generate compliance reports; produce review artifacts
- FORBIDDEN: Network exfiltration of contract text; persistent state between runs; modifying VEC_SEG/INDEX_SEG at runtime; accessing external databases without explicit PROFILE_SEG declaration

---

## OpenClaw Agent Segment Map

A single OpenClaw `.rvf` file contains:

| Segment | Type | Content |
|---------|------|---------|
| VEC_SEG (0x01) | Data | 50K clause embeddings (fp16) + case law precedent embeddings + regulatory text embeddings |
| INDEX_SEG (0x02) | Index | Progressive HNSW indices (A/B/C layers) over each vector set |
| OVERLAY_SEG (0x03) | Model | LoRA deltas for jurisdiction-specific fine-tuning |
| MANIFEST_SEG (0x05) | Meta | Segment directory, FileIdentity, agent profile reference |
| QUANT_SEG (0x06) | Data | Product quantization codebooks for compressed search |
| META_SEG (0x07) | Config | Clause taxonomy, legal glossary, jurisdiction rules, templates |
| PROFILE_SEG (0x0B) | Agent | `role=reviewer`, `model=claude-sonnet`, `tools=[Read,Write,Grep]`, `network=none` |
| WITNESS_SEG (0x0A) | Audit | Tamper-evident chain of all contract operations |
| CRYPTO_SEG (0x0C) | Security | Ed25519 + ML-DSA-65 dual signatures |
| KERNEL_SEG (0x0E) | Compute | Minimal Linux unikernel (no virtio-net), KernelBinding footer |
| EBPF_SEG (0x0F) | Accel | Cosine distance + metadata filter for clause search acceleration |
| WASM_SEG (0x10) | Preview | 5.5KB tile for browser-side clause search widget |

---

## Agent Types

### 1. Contract Reviewer

| Property | Value |
|----------|-------|
| Package | `openclaw-contract-reviewer@x.y.z` |
| PROFILE_SEG | role=reviewer, model=claude-sonnet, tools=[Read,Write,Grep], network=none |
| VEC_SEG | 50K clause embeddings + 10K precedent embeddings |
| INDEX_SEG | HNSW over clauses (M=16, ef=200) + precedents |
| Execution tier | Tier 3 (KERNEL_SEG) for isolation |

**Input**: Contract document (host-mounted at /work/)
**Output**: Annotated contract + risk report with clause citations

### 2. Clause Analyst

| Property | Value |
|----------|-------|
| Package | `openclaw-clause-analyst@x.y.z` |
| PROFILE_SEG | role=analyst, model=claude-sonnet, tools=[Read,Grep], network=none |
| VEC_SEG | Multi-corpus clause embeddings |
| OVERLAY_SEG | LoRA deltas for comparative analysis |
| Execution tier | Tier 1 (WASM_SEG) or Tier 3 depending on sensitivity |

**Input**: Set of contract clauses
**Output**: Similarity report, conflicting terms, standardization recommendations

### 3. Compliance Checker

| Property | Value |
|----------|-------|
| Package | `openclaw-compliance-checker@x.y.z` |
| PROFILE_SEG | role=compliance, model=claude-sonnet, tools=[Read,Write], network=none |
| VEC_SEG | Regulatory text embeddings by jurisdiction |
| META_SEG | Jurisdiction rules, regulatory mappings |
| Execution tier | Tier 3 (KERNEL_SEG) for isolation |

**Input**: Contract + jurisdiction identifier
**Output**: Compliance report with pass/fail per regulation, citations

---

## Vector Architecture

### Embedding Pipeline (Build-Time)

```
Source corpus (clause library, case law, regulations)
  → Tokenize + chunk (512 token windows, 64 token overlap)
  → Embed via sentence model (all-MiniLM-L6-v2 or domain-tuned)
  → Quantize (product quantization → QUANT_SEG)
  → Build HNSW index (M=16, ef_construction=200 → INDEX_SEG)
  → Store raw embeddings (fp16 → VEC_SEG)
  → Store metadata (id→text mapping → META_SEG)
  → Package into single .rvf file
```

Uses `wyr-ruvector` (ADR 0010) or `rvf-index` crate for native HNSW construction.

### Progressive Loading at Agent Boot

| Layer | Load Time | Recall | Content |
|-------|-----------|--------|---------|
| A | Microseconds | 70% | Clause centroids + entry points (from manifest hotset) |
| B | Background | 85% | Hot clause adjacency (frequently-referenced clauses) |
| C | Background | 95%+ | Full clause HNSW graph |

Agent can begin clause search at Layer A while remaining layers load. For a 50K clause index, full load takes <100ms.

### COW Branching for Jurisdictions

```
openclaw-base.rvf (global clause library, 50K vectors)
  → rvf derive --mode filter --include "jurisdiction:delaware"
  → openclaw-delaware.rvf (~3MB child, inherits parent's HNSW)

  → rvf derive --mode lora --overlay california-fine-tune.delta
  → openclaw-california.rvf (delta child with jurisdiction-specific behavior)
```

Each jurisdiction variant is a lightweight COW child, not a full copy.

---

## Dossier Integration

### OpenClaw as Planning Cards

```
Workflow: Contract Review Pipeline
  Activity: NDA Review
    Card: "Review mutual NDA with Acme Corp"
      requirements:
        - Check indemnification clause against standard
        - Verify jurisdiction compliance (Delaware)
        - Flag non-standard terms
      planned_files:
        - review-report.md
        - annotated-nda.md
      executor: rvf
      rvf_package: "openclaw-contract-reviewer@0.2.0"
```

### Execution Flow

```
User triggers card build
  → createAssignment (executor: rvf, rvf_package: openclaw-contract-reviewer@0.2.0)
  → 7-step verification (CRYPTO_SEG dual-sig, witness chain, kernel binding)
  → Tier 3 selected (PROFILE_SEG: requires_isolation)
  → rvf launch:
      - KERNEL_SEG boots (no network driver)
      - Mount contract to /work/ via virtio-blk
      - Mount card context to /context/ via virtio-fs (read-only)
  → Agent inside microVM:
      1. INDEX_SEG Layer A loads (70% recall in microseconds)
      2. Read contract from /work/
      3. Query HNSW for similar standard clauses (VEC_SEG + INDEX_SEG)
      4. Read jurisdiction rules from META_SEG
      5. Apply jurisdiction LoRA from OVERLAY_SEG
      6. Generate annotated contract + compliance report
      7. Write outputs to /work/review-report.md, /work/annotated-nda.md
      8. All queries recorded in WITNESS_SEG
  → Host collects via vsock DONE message
  → RunChecks:
      - rvf-signature: package valid
      - rvf-witness: chain unbroken
      - contract-schema: report structure valid
      - clause-coverage: all card requirements addressed
      - citation-validity: clause references resolve to META_SEG entries
  → ApprovalRequest → User reviews legal output
```

### Witness Chain as Legal Audit Trail

Every clause search, annotation, and output generation is recorded in WITNESS_SEG:

```
Entry 1: PROVENANCE — contract document ingested (hash of /work/contract.md)
Entry 2: SEARCH — clause similarity query (query vector hash, top-k results)
Entry 3: SEARCH — precedent lookup (query hash, matched case citations)
Entry 4: COMPUTATION — compliance evaluation (jurisdiction, pass/fail results)
Entry 5: COMPUTATION — report generation (output hash)
```

This chain is tamper-evident (SHAKE-256 linked) and can be presented as evidence that the review was conducted systematically.

---

## WASM Preview (Tier 1)

The WASM_SEG in an OpenClaw `.rvf` enables a **browser-side clause search widget**:

```
Dossier UI (contract review page)
  → Load WASM_SEG (5.5KB tile) from .rvf file
  → Load INDEX_SEG Layer A into WASM memory
  → User types clause search query
  → WASM performs k-NN against clause embeddings
  → Results rendered inline (similar clauses, risk indicators)
  → No server roundtrip; no contract data leaves browser
```

This enables interactive clause exploration before or after the full Tier 3 agent review.

---

## Security Considerations

| Concern | RVF Mitigation |
|---------|---------------|
| Contract confidentiality | KERNEL_SEG without HAS_NETWORKING; no virtio-net driver |
| Legal accuracy | Human-in-the-loop: approval gate before output is used |
| Clause library tampering | CRYPTO_SEG dual-signature; VEC_SEG/INDEX_SEG SEALED flag |
| Audit trail integrity | WITNESS_SEG hash chain; any edit breaks verification |
| Cross-client contamination | Fresh microVM per run; no persistent state |
| Post-quantum safety | ML-DSA-65 dual-signing on package |
| Supply chain (jurisdiction derivation) | FileIdentity chain verification on COW children |

---

## Key Entities

| Entity | Description |
|--------|-------------|
| `ClauseVecSeg` | VEC_SEG containing clause embeddings (fp16) |
| `ClauseIndexSeg` | INDEX_SEG with progressive HNSW over clauses |
| `PrecedentVecSeg` | VEC_SEG containing case law embeddings |
| `JurisdictionOverlay` | OVERLAY_SEG with LoRA deltas per jurisdiction |
| `ReviewReport` | Structured output: annotations, risk flags, clause citations |
| `ComplianceReport` | Pass/fail per regulation with jurisdiction context |
| `ContractCard` | Dossier card with executor=rvf and OpenClaw package |
| `ClauseWasmWidget` | Browser-side WASM_SEG for interactive clause search |

## Related
- [ADR 0011](../adr/0011-rvf-agent-packages.md) — RVF specification
- [rvf-security-reference.md](rvf-security-reference.md) — Security model and witness chains
- [rvf-package-reference.md](rvf-package-reference.md) — Segment format and COW branching
- [rvf-kernel-reference.md](rvf-kernel-reference.md) — Three-tier execution
- [rvf-runtime-reference.md](rvf-runtime-reference.md) — Dossier dispatch integration
- [memory-reference.md](memory-reference.md) — RuVector integration
