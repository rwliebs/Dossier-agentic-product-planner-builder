---
document_id: doc.rvf-security
last_verified: 2026-03-06
tokens_estimate: 800
tags:
  - rvf
  - security
  - witness
  - crypto
  - attestation
  - post-quantum
anchors:
  - id: contract
    summary: "Every segment signable; every operation hash-chained; every derived file linked to parent"
  - id: witness
    summary: "WITNESS_SEG 0x0A: 73-byte SHAKE-256 entries; tamper breaks all subsequent"
  - id: crypto
    summary: "CRYPTO_SEG 0x0C: Ed25519 + ML-DSA-65 dual-signing; post-quantum ready"
  - id: kernel-binding
    summary: "128-byte footer: SHAKE-256(manifest) ties kernel to agent"
ttl_expires_on: null
---
# RVF Security Domain Reference

**Anchors**: [ADR 0011](../adr/0011-rvf-agent-packages.md), [rvf-kernel-reference.md](rvf-kernel-reference.md)

## Contract

### Invariants
- INVARIANT: Every segment individually signable via CRYPTO_SEG
- INVARIANT: Every operation hash-chained into WITNESS_SEG; modifying any byte breaks all subsequent verification
- INVARIANT: Every derived file carries FileIdentity with cryptographic link to parent
- INVARIANT: 7-step fail-closed verification before execution (hash, signature, TEE measurement)
- INVARIANT: KERNEL_SEG bound to MANIFEST_SEG via 128-byte KernelBinding footer

### Boundaries
- ALLOWED: Sign, verify, attest, audit witness chain, verify lineage, dual-sign (Ed25519 + ML-DSA-65)
- FORBIDDEN: Booting unsigned packages in production; bypassing witness chain; executing kernel without binding verification

---

## Witness Chains (WITNESS_SEG 0x0A)

Tamper-evident audit trails via SHAKE-256 hash-chaining. Each entry: 73 bytes.

| Field | Size | Description |
|-------|------|-------------|
| `prev_hash` | 32B | SHAKE-256-256 of previous entry (zero for genesis) |
| `action_hash` | 32B | SHAKE-256-256 of witnessed action/data |
| `timestamp_ns` | 8B | Nanosecond UNIX timestamp |
| `witness_type` | 1B | Event discriminator |

### Witness Types

| Code | Name | Description |
|------|------|-------------|
| `0x01` | PROVENANCE | Data origin record |
| `0x02` | COMPUTATION | Operation record (query, ingest, transform) |
| `0x03` | SEARCH | Query audit (what was searched, results returned) |
| `0x04` | DELETION | Removal audit |
| `0x05-0x08` | TEE_ATTESTATION | SGX/SEV-SNP/TDX/ARM CCA quotes |
| `0x09` | LINEAGE_DERIVE | Child creation event |
| `0x0A` | LINEAGE_MERGE | Branch merge event |
| `0x0B` | LINEAGE_TRANSFORM | In-place transformation |
| `0x0E` | CLUSTER_COW | Cluster copy-on-write event |
| `0x0F` | CLUSTER_DELTA | Delta patch application |

### Tamper Detection

Modifying any byte in any entry invalidates all subsequent entries in the chain. No external signing infrastructure required — the chain is self-verifying.

```
rvf verify-witness agent.rvf
  → Read WITNESS_SEG entries sequentially
  → For each entry: SHAKE-256(entry[i-1]) == entry[i].prev_hash
  → Any mismatch: FAIL at entry index, report tampered range
```

---

## Cryptographic Signing (CRYPTO_SEG 0x0C)

### Segment Fields

| Field | Size | Description |
|-------|------|-------------|
| Header | 64B | Standard RVFS segment header |
| `key_count` | 2B | Number of keys/signatures stored |
| `algo_primary` | 1B | Primary algorithm |
| `algo_secondary` | 1B | Secondary algorithm (dual-signing) |
| `key_binding_present` | 1B | TEE key binding flag |

### Supported Algorithms

| Algorithm | ID | Signature Size | Purpose |
|-----------|----|----|---------|
| Ed25519 | 0 | 64B | Classical NIST EdDSA |
| ML-DSA-65 | 1 | 2,420B | Post-quantum lattice (FIPS 204) |
| SLH-DSA-128s | 2 | 2,144B | Post-quantum stateless hash (FIPS 205) |

### Dual-Signing

Files signed with both Ed25519 and ML-DSA-65 remain verifiable after quantum computers compromise classical cryptography. The dual-sign approach:

```
sign(file):
  manifest_hash = SHAKE-256(MANIFEST_SEG)
  sig_classical = Ed25519.sign(manifest_hash, ed_key)
  sig_pq = ML-DSA-65.sign(manifest_hash, ml_key)
  CRYPTO_SEG.store(sig_classical, sig_pq)

verify(file):
  manifest_hash = SHAKE-256(MANIFEST_SEG)
  ok_classical = Ed25519.verify(manifest_hash, sig_classical, ed_pub)
  ok_pq = ML-DSA-65.verify(manifest_hash, sig_pq, ml_pub)
  return ok_classical AND ok_pq
```

---

## KernelBinding (128 bytes)

Appended as a footer to KERNEL_SEG, this cryptographically ties the kernel to its agent manifest:

```
KernelBinding {
  manifest_hash: [u8; 32],    // SHAKE-256 of MANIFEST_SEG
  kernel_hash: [u8; 32],      // SHAKE-256 of kernel payload
  timestamp_ns: u64,          // When binding was created
  reserved: [u8; 48],         // Future use (TEE measurement slots)
}
```

**Prevents segment-swap attacks**: A kernel extracted from one `.rvf` file cannot boot with another file's manifest. The host verifies `SHAKE-256(MANIFEST_SEG) == binding.manifest_hash` before boot.

```
rvf verify-attestation agent.rvf
  → Extract KERNEL_SEG footer (last 128 bytes)
  → Compute SHAKE-256(MANIFEST_SEG)
  → Compare against footer.manifest_hash
  → If TEE quotes present: verify against platform measurements
  → Any mismatch: REJECT
```

---

## TEE Attestation

For agents running in Trusted Execution Environments:

| TEE | Witness Type | Measurement |
|-----|-------------|-------------|
| Intel SGX | `0x05` | MRENCLAVE + MRSIGNER |
| AMD SEV-SNP | `0x06` | Platform report |
| Intel TDX | `0x07` | TD report |
| ARM CCA | `0x08` | Realm measurement |

Attestation records are stored in WITNESS_SEG alongside the kernel binding, creating a hardware-rooted trust chain from silicon to agent output.

---

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Tampered package | CRYPTO_SEG dual-signature verification |
| Segment-swap attack | KernelBinding footer binds kernel↔manifest |
| Supply chain attack on parent | FileIdentity chain verification (parent_manifest_hash) |
| Retroactive log modification | WITNESS_SEG hash chain; any edit breaks all subsequent |
| Quantum signature forgery | ML-DSA-65 post-quantum dual-signing |
| Network exfiltration | KERNEL_SEG without virtio-net driver (not iptables — kernel-level) |
| Resource exhaustion | VMM-enforced cgroup limits from PROFILE_SEG |
| Agent lateral movement | Separate microVMs; no shared mounts; vsock host-only |

### Authority Boundary Isolation

| Component | Authority | Rationale |
|-----------|-----------|-----------|
| Guest kernel (KERNEL_SEG) | Auth + audit | Owns identity, signing, witness chains |
| eBPF programs (EBPF_SEG) | Acceleration only | Distance math, filtering — no auth decisions |
| WASM runtime (WASM_SEG) | Query + verify | Can read and verify but not modify sealed segments |

---

## 7-Step Fail-Closed Verification

Before any execution, the host runs:

1. **Segment integrity**: Verify content_hash in each segment header
2. **Manifest consistency**: Level-1 root offsets match actual segment positions
3. **Signature verification**: CRYPTO_SEG Ed25519 + ML-DSA-65 against trust store
4. **Witness chain**: WITNESS_SEG hash chain unbroken
5. **Kernel binding**: SHAKE-256(MANIFEST_SEG) matches KernelBinding footer
6. **Lineage**: FileIdentity.parent_manifest_hash valid (if derived file)
7. **TEE measurement**: Platform attestation report matches (if TEE environment)

Any step failure → **REJECT**. No partial execution.

---

## Key Entities

| Entity | Description |
|--------|-------------|
| `WitnessSeg` | Hash-chained audit trail (73-byte entries) |
| `CryptoSeg` | Signatures + sealed keys (Ed25519, ML-DSA-65, SLH-DSA-128s) |
| `KernelBinding` | 128-byte footer tying kernel to manifest |
| `FileIdentity` | 68-byte lineage record (UUID + parent hash + depth) |
| `TeeAttestation` | Hardware measurement record (SGX/SEV-SNP/TDX/CCA) |
| `VerificationPipeline` | 7-step fail-closed verification before execution |

## Related
- [ADR 0011](../adr/0011-rvf-agent-packages.md) — RVF specification
- [rvf-kernel-reference.md](rvf-kernel-reference.md) — Kernel binding and boot
- [rvf-package-reference.md](rvf-package-reference.md) — Segment format
- [rvf-runtime-reference.md](rvf-runtime-reference.md) — Execution lifecycle
- [rvf-openclaw-reference.md](rvf-openclaw-reference.md) — OpenClaw security requirements
