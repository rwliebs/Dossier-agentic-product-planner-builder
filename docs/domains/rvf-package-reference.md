---
document_id: doc.rvf-package
last_verified: 2026-03-06
tokens_estimate: 850
tags:
  - rvf
  - package
  - segments
  - cow
  - lineage
  - hnsw
anchors:
  - id: contract
    summary: "Single .rvf file with 24 segment types; 64-byte aligned, self-describing"
  - id: manifest
    summary: "MANIFEST_SEG: 4KB Level-1 root at EOF; cold boot 1.6us"
  - id: cow
    summary: "COW branching: cluster-level copy-on-write; 1M-vec parent → 2.5MB child"
  - id: progressive
    summary: "INDEX_SEG: three-tier HNSW loading (70%→85%→95% recall)"
ttl_expires_on: null
---
# RVF Package Format Domain Reference

**Anchors**: [ADR 0011](../adr/0011-rvf-agent-packages.md), [rvf-kernel-reference.md](rvf-kernel-reference.md)

## Contract

### Invariants
- INVARIANT: Every segment begins with 64-byte header; magic 0x52564653 ("RVFS")
- INVARIANT: All segments 64-byte aligned; self-describing with type, flags, hash
- INVARIANT: MANIFEST_SEG required; Level-1 root (4KB) at EOF scan offset
- INVARIANT: Append-only design; incomplete writes ignored on recovery (no WAL needed)

### Boundaries
- ALLOWED: create, ingest, query, derive, compact, freeze, serve, launch, embed-kernel, embed-ebpf
- FORBIDDEN: Modifying frozen segments; executing without MANIFEST_SEG; segments exceeding type-specific size limits

---

## Segment Header Wire Format (64 bytes)

```
Offset  Size  Field              Notes
0x00    4     magic              0x52564653 ("RVFS")
0x04    1     version            Currently 1
0x05    1     seg_type           Type ID (0x01-0x32)
0x06    2     flags              Bitfield (see below)
0x08    8     segment_id         Monotonically increasing
0x10    8     payload_length     Byte count of payload
0x18    8     timestamp_ns       Nanosecond UNIX timestamp
0x20    1     checksum_algo      0=CRC32C, 1=XXH3-128, 2=SHAKE-256
0x21    1     compression        0=none, 1=LZ4, 2=ZSTD
0x22    2     reserved_0         Must be zero
0x24    4     reserved_1         Must be zero
0x28    16    content_hash       First 128 bits of payload hash
0x38    4     uncompressed_len   Original size before compression
0x3C    4     alignment_pad      Padding to 64-byte boundary
```

### Segment Flags (16-bit)

| Bit | Name | Description |
|-----|------|-------------|
| 0 | COMPRESSED | Payload is LZ4 or ZSTD compressed |
| 1 | ENCRYPTED | Payload is encrypted |
| 2 | SIGNED | Has corresponding CRYPTO_SEG entry |
| 3 | SEALED | Immutable; cannot be modified |
| 4 | PARTIAL | Streaming write in progress |
| 5 | TOMBSTONE | Logically deleted |
| 6 | HOT | Temperature-promoted |
| 7 | OVERLAY | Delta data (LoRA, patches) |
| 8 | SNAPSHOT | Full snapshot checkpoint |
| 9 | CHECKPOINT | Rollback point |
| 10 | ATTESTED | Produced inside TEE |
| 11 | HAS_LINEAGE | Carries FileIdentity |

---

## 24 Segment Types

### Data & Indexing

| Code | Name | Description |
|------|------|-------------|
| `0x01` | VEC_SEG | Raw vector embeddings (fp16/fp32/int8/int4/binary) |
| `0x02` | INDEX_SEG | HNSW adjacency with progressive A/B/C routing layers |
| `0x05` | MANIFEST_SEG | Segment directory, epoch state, root manifest |
| `0x06` | QUANT_SEG | Quantization codebooks (scalar/product/binary) |
| `0x07` | META_SEG | Key-value metadata and observation-state |
| `0x08` | HOT_SEG | Temperature-promoted frequently-accessed data |
| `0x0D` | META_IDX_SEG | Inverted indexes for filtered metadata search |

### AI / Models

| Code | Name | Description |
|------|------|-------------|
| `0x03` | OVERLAY_SEG | LoRA adapter deltas and graph overlays |
| `0x09` | SKETCH_SEG | Access sketches, VQE snapshots, quantum state |
| `0x0B` | PROFILE_SEG | Domain profile declarations (agent role, model, tools) |
| `0x30` | TRANSFER_PRIOR | Transfer learning prior distributions |
| `0x31` | POLICY_KERNEL | Thompson Sampling policy state |
| `0x32` | COST_CURVE | Cost/reward curve data for solver |

### Compute

| Code | Name | Description |
|------|------|-------------|
| `0x0E` | KERNEL_SEG | Compressed Linux unikernel (200KB-2MB) |
| `0x0F` | EBPF_SEG | eBPF programs (XDP/TC/socket filter) |
| `0x10` | WASM_SEG | WASM microkernel (5.5KB tile / 46KB control) |

### Security

| Code | Name | Description |
|------|------|-------------|
| `0x04` | JOURNAL_SEG | Mutation log and deletion records |
| `0x0A` | WITNESS_SEG | Tamper-evident audit trails (SHAKE-256 chains) |
| `0x0C` | CRYPTO_SEG | Ed25519/ML-DSA-65/SLH-DSA-128s signatures |

### Branching

| Code | Name | Description |
|------|------|-------------|
| `0x20` | COW_MAP_SEG | Cluster ownership map (local vs parent) |
| `0x21` | REFCOUNT_SEG | Reference counts (rebuildable from COW map) |
| `0x22` | MEMBERSHIP_SEG | Vector visibility bitmap for branches |
| `0x23` | DELTA_SEG | Sparse delta patches and LoRA overlays |

---

## MANIFEST_SEG Structure

### Level 1 Root (4KB at EOF)

| Field | Description |
|-------|-------------|
| Segment directory | Offsets to all segments in file |
| Hotset pointers | Entry points, top layer, centroids, quantization dicts |
| Epoch counter | Generation tracking |
| Vector count | Total vectors in file |
| Dimension | Vector dimensionality |
| Profile ID | Reference to PROFILE_SEG |
| FileIdentity | Lineage (file_id, parent_id, parent_manifest_hash, depth) |
| Security policy hash | Hash of active CRYPTO_SEG entries |

### Level 0 Manifest

Per-segment metadata: type, flags, size, timestamp, compression, checksum, payload hash, uncompressed length.

---

## FileIdentity and Lineage (68 bytes)

| Field | Size | Purpose |
|-------|------|---------|
| `file_id` | 16B | Unique UUID for this file |
| `parent_id` | 16B | Parent's UUID (zero for root files) |
| `parent_manifest_hash` | 32B | SHAKE-256 of parent's Level-0 root |
| `depth` | 4B | Generation depth (0 for root) |

Cryptographic lineage: a child can be verified as legitimately derived from its parent without accessing the parent file.

---

## Progressive HNSW Loading (INDEX_SEG)

| Layer | Load Time | Recall@10 | Content |
|-------|-----------|-----------|---------|
| A | Microseconds | >= 70% | Centroids, partition entry points (from manifest hotset) |
| B | Background | >= 85% | Hot region adjacency (temperature-based) |
| C | Background | >= 95% | Full HNSW graph (complete adjacency lists) |

Queries begin at Layer A immediately. Recall improves as Layers B and C load in background.

---

## COW Branching

### Mechanism

Copy-on-write operates at **cluster granularity** (typically 256KB per cluster):

| Segment | Purpose |
|---------|---------|
| COW_MAP_SEG (0x20) | Bitfield: cluster is local or inherited from parent |
| REFCOUNT_SEG (0x21) | Per-cluster reference counts (rebuildable, no WAL) |
| MEMBERSHIP_SEG (0x22) | Dense bitmap for vector visibility per branch |
| DELTA_SEG (0x23) | Sparse row patches for LoRA overlays |

### Derive Modes

| Mode | CLI | Result |
|------|-----|--------|
| Filter | `rvf derive --mode filter --include "tag"` | Child with subset of parent vectors |
| LoRA | `rvf derive --mode lora --overlay deltas.bin` | Child with fine-tune overlay |
| Snapshot | `rvf derive --mode snapshot` | Frozen point-in-time copy |

### Size Efficiency

- 1M-vector parent (~512MB) + 100 modifications → **~2.5MB child** (~10 clusters)
- Shared HNSW index uses MEMBERSHIP_SEG during traversal: excluded vectors route searches but are never returned

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `rvf create` | Initialize new store with dimension and metric |
| `rvf ingest` | Insert vectors from JSON/CSV/NumPy with IDs |
| `rvf query` | k-NN search with optional metadata filters |
| `rvf delete` | Remove vectors by ID list |
| `rvf status` | Display vector count, dimension, segment list |
| `rvf inspect` | Show detailed segment metadata and headers |
| `rvf compact` | Reclaim space from deleted vectors |
| `rvf derive` | Create child with lineage (Filter/LoRA/Snapshot) |
| `rvf serve` | Start HTTP REST + TCP streaming server |
| `rvf launch` | Boot in QEMU/Firecracker microVM |
| `rvf embed-kernel` | Compile and embed Linux kernel |
| `rvf embed-ebpf` | Compile C to eBPF and embed program |
| `rvf filter` | Apply inclusion/exclusion membership filter |
| `rvf freeze` | Snapshot-freeze current generation |
| `rvf verify-witness` | Validate SHAKE-256 chain integrity |
| `rvf verify-attestation` | Verify KernelBinding + TEE quotes |
| `rvf rebuild-refcounts` | Recompute refcounts from COW map |

All commands support `--json` output.

---

## Published Packages

### Rust Crates (14)

`rvf-types`, `rvf-runtime`, `rvf-crypto`, `rvf-index`, `rvf-segment`, `rvf-manifest`, `rvf-cow`, `rvf-witness`, `rvf-kernel`, `rvf-ebpf`, `rvf-wasm`, `rvf-derive`, `rvf-serve`, `rvf-cli`

### npm Packages (4)

| Package | Description |
|---------|-------------|
| `@ruvector/rvf` | TypeScript SDK (wraps rvf-node) |
| `@ruvector/rvf-node` | Node.js native bindings |
| `@ruvector/rvf-wasm` | Browser/WASM runtime |
| `@ruvector/rvf-mcp-server` | MCP server for Claude Code integration |

### Test Coverage

1,156 passing tests across 46 runnable examples.

---

## Key Entities

| Entity | Description |
|--------|-------------|
| `RvfFile` | Single `.rvf` binary containing all segments |
| `SegmentHeader` | 64-byte self-describing header per segment |
| `ManifestSeg` | Segment directory + hotset + FileIdentity |
| `FileIdentity` | 68-byte lineage record (UUID + parent hash + depth) |
| `IndexSeg` | Progressive HNSW with A/B/C layers |
| `CowBranch` | Child file with COW_MAP + MEMBERSHIP + DELTA segments |

## Related
- [ADR 0011](../adr/0011-rvf-agent-packages.md) — RVF specification
- [rvf-kernel-reference.md](rvf-kernel-reference.md) — Three-tier execution
- [rvf-runtime-reference.md](rvf-runtime-reference.md) — Agent lifecycle
- [rvf-security-reference.md](rvf-security-reference.md) — Witness chains and crypto
- [rvf-openclaw-reference.md](rvf-openclaw-reference.md) — OpenClaw agents
