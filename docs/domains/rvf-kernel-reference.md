---
document_id: doc.rvf-kernel
last_verified: 2026-03-06
tokens_estimate: 900
tags:
  - rvf
  - kernel
  - ebpf
  - wasm
  - microvm
  - three-tier
anchors:
  - id: contract
    summary: "Three-tier execution: WASM (<1ms), eBPF (<20ms), KERNEL_SEG (<125ms)"
  - id: kernel-seg
    summary: "KERNEL_SEG 0x0E: compressed unikernel 200KB-2MB, KernelBinding footer"
  - id: ebpf-seg
    summary: "EBPF_SEG 0x0F: kernel-space vector acceleration, graceful fallback"
  - id: wasm-seg
    summary: "WASM_SEG 0x10: 5.5KB tile microkernel, 46KB control plane"
ttl_expires_on: null
---
# RVF Kernel Domain Reference

**Anchors**: [ADR 0011](../adr/0011-rvf-agent-packages.md), [orchestration-reference.md](orchestration-reference.md)

## Contract

### Invariants
- INVARIANT: KERNEL_SEG bound to manifest via 128-byte KernelBinding footer (SHAKE-256); prevents segment-swap attacks
- INVARIANT: eBPF programs operate acceleration-only; authority boundary stays in guest kernel
- INVARIANT: WASM_SEG requires no host dependencies; runs in browser, Node.js, or edge runtime
- INVARIANT: Tier selection is automatic based on host capabilities and agent PROFILE_SEG

### Boundaries
- ALLOWED: KERNEL_SEG boot via Firecracker/QEMU/TEE; EBPF_SEG attach to XDP/TC/socket; WASM_SEG load in any JS runtime
- FORBIDDEN: KERNEL_SEG exceeding 128 MiB; EBPF_SEG exceeding 16 MiB; modifying kernel binding post-freeze

---

## Three-Tier Execution Model

RVF embeds up to three executable segments in a single `.rvf` file. The host selects the appropriate tier at runtime.

### Tier 1: WASM_SEG (0x10)

| Property | Value |
|----------|-------|
| Tile microkernel | 5.5 KB |
| Control plane | ~46 KB |
| Boot time | <1ms |
| Environment | Browser tab, Node.js, edge compute, Deno |
| Dependencies | None |

**Roles** (via `WasmRole` enum):
- `Interpreter` — Execute agent logic in sandboxed WASM
- `Microkernel` — Minimal query runtime (in-memory vector store, k-NN search)
- `Solver` — Optimization/cost-curve evaluation

**Capabilities**:
- Full store API with segment inspection
- Cryptographic verification (SHAKE-256, witness chains)
- Metadata filtering with boolean expressions
- Progressive HNSW index navigation

**Use in Dossier**: Preview and lightweight search agents. An OpenClaw clause-search widget in the Dossier UI loads the WASM_SEG directly — no microVM needed.

### Tier 2: EBPF_SEG (0x0F)

| Property | Value |
|----------|-------|
| Program size | 10-50 KB |
| Boot time | <20ms |
| Environment | Linux kernel (requires BPF support) |
| Attach points | XDP ingress, socket RX, TC hook |

**Segment fields**:

| Field | Size | Description |
|-------|------|-------------|
| Header | 64B | Standard RVFS segment header |
| `program_type` | 1B | XDP, socket filter, or traffic control |
| `attach_point` | 1B | XDP ingress, socket RX, TC hook |
| `max_dimension` | 2B | Maximum supported vector dimensionality |
| `btf_present` | 1B | BTF metadata flag |

**Three eBPF programs** (compiled from C):
1. **Distance computation** — cosine, Euclidean, hamming in ring 0
2. **Metadata filtering** — equality, range, bitmap inclusion
3. **Request routing** — load balancing across agent replicas

**Graceful fallback**: If eBPF attachment fails (no BPF support, permission denied), the `.rvf` file remains fully functional — queries fall back to userspace computation.

**Use in Dossier**: Accelerated vector search for agents with large indices. When Dossier dispatches an agent on a Linux host with BPF support, the eBPF programs activate automatically for sub-millisecond clause similarity search.

### Tier 3: KERNEL_SEG (0x0E)

| Property | Value |
|----------|-------|
| Kernel size | 200KB - 2MB compressed |
| Boot time | <125ms |
| Environment | Firecracker, Cloud Hypervisor, QEMU, TEE (SGX/SEV-SNP/TDX) |
| Initramfs | cpio/newc with bootloader |

**Segment fields**:

| Field | Size | Description |
|-------|------|-------------|
| Header | 64B | Standard RVFS segment header |
| `arch` | 1B | x86_64, aarch64, riscv64, arm |
| `kernel_type` | 1B | Linux, Hermit, MicroVM |
| `flags` | 2B | HAS_QUERY_API, HAS_NETWORKING, HAS_SSH |
| `api_port` | 2B | RVF query server TCP port |

**Payload contents**:
- Compressed bzImage (or Hermit unikernel)
- cpio/newc initramfs with init bootstrap
- Embedded manifest snapshot (agent config available at boot)
- SHA3-256 integrity checksum

**KernelBinding footer** (128 bytes):
- SHAKE-256 hash of the MANIFEST_SEG
- Prevents segment-swap attacks: a kernel extracted from one `.rvf` cannot boot with another file's manifest

**Use in Dossier**: Full isolated agent execution. The OpenClaw contract reviewer boots with `network = none` (no virtio-net in kernel), processes sensitive contract documents, and writes results to the host-mounted workdir via virtio-vsock.

---

## Tier Selection Logic

```
Host inspects PROFILE_SEG from .rvf file:

if agent.requires_filesystem || agent.requires_isolation:
    if host.has_kvm:
        → Tier 3: rvf launch (KERNEL_SEG via Firecracker)
    elif host.has_qemu:
        → Tier 3: rvf launch (KERNEL_SEG via QEMU TCG)
    else:
        → REJECT: insufficient isolation capability

elif agent.benefits_from_acceleration && host.has_bpf:
    → Tier 2: attach EBPF_SEG for kernel-space vector ops
    + Tier 1: WASM_SEG for agent logic

else:
    → Tier 1: WASM_SEG only (browser/Node.js)
```

---

## Boot Sequences

### KERNEL_SEG Boot (Tier 3)

```
rvf launch agent.rvf
  → Extract KERNEL_SEG payload
  → Verify KernelBinding: SHAKE-256(MANIFEST_SEG) == footer.manifest_hash
  → Configure VMM:
      - vCPUs, memory from PROFILE_SEG [resources]
      - virtio-blk: rootfs from .rvf segments
      - virtio-vsock: host↔guest communication
      - virtio-net: ONLY if PROFILE_SEG declares network != none
  → Direct boot: bzImage + initramfs
  → Kernel init:
      1. Mount rootfs from virtio-blk
      2. Load HNSW from INDEX_SEG (progressive: Layer A immediate)
      3. Open vsock to host
      4. Receive task payload
      5. Execute agent logic
      6. Write outputs to /work/ mount
      7. Send completion via vsock
  → VMM collects exit code + outputs
  → MicroVM terminated
```

### EBPF_SEG Boot (Tier 2)

```
Host process loads .rvf:
  → Extract EBPF_SEG program bytecode
  → Check BTF availability
  → Attach to XDP/TC/socket hook
  → Programs now accelerate vector ops in kernel space
  → Agent logic runs in userspace (WASM_SEG or host process)
  → On agent completion: detach eBPF programs
```

### WASM_SEG Boot (Tier 1)

```
Host loads .rvf:
  → Extract WASM_SEG bytecode
  → Instantiate in wasmtime/browser/Node.js
  → Load INDEX_SEG via WASM memory (progressive)
  → Agent responds to queries immediately (Layer A: 70% recall)
  → Background: Layers B/C load for 95%+ recall
```

---

## Performance Targets

| Metric | Target | Source |
|--------|--------|--------|
| Cold boot (4KB manifest) | 1.6 microseconds | RVF spec |
| WASM instantiation | <1ms | Tier 1 |
| eBPF attach | <20ms | Tier 2 |
| Kernel boot (Firecracker) | <125ms | Tier 3 |
| First query recall (Layer A) | >= 70% | Progressive HNSW |
| Full recall (Layer C) | >= 95% | Progressive HNSW |
| COW branch (10K vectors) | 2.6ms | COW spec |

---

## Key Entities

| Entity | Description |
|--------|-------------|
| `KernelSeg` | Compressed unikernel with KernelBinding footer |
| `EbpfSeg` | eBPF bytecode for kernel-space acceleration |
| `WasmSeg` | WASM microkernel (tile or control plane) |
| `KernelBinding` | 128-byte cryptographic tie between kernel and manifest |
| `TierSelector` | Logic that chooses Tier 1/2/3 based on host + profile |
| `BootSequence` | Per-tier initialization from segment to running agent |

## Related
- [ADR 0011](../adr/0011-rvf-agent-packages.md) — RVF specification
- [rvf-package-reference.md](rvf-package-reference.md) — Segment format and composition
- [rvf-runtime-reference.md](rvf-runtime-reference.md) — Agent lifecycle
- [rvf-security-reference.md](rvf-security-reference.md) — Witness chains and attestation
