# ADR 0010: WYR Rust Application with RuVector

- Status: Accepted
- Date: 2026-03-06

## Context

Dossier's intelligence layer uses RuVector for pattern matching, embeddings, and neural routing. The current RuVector implementation is JavaScript/WASM-based (`ruvector@0.2.11` on npm). A native Rust implementation provides:

1. A proving ground for RuVector's core algorithms (HNSW, cosine similarity, preference vectors) in native Rust, validating the same logic that powers the `rvf-index` and `rvf-runtime` crates in the ruvector ecosystem.
2. A cross-platform Tauri 2.x desktop application demonstrating native Rust + web frontend integration.
3. A performance baseline for comparing native vs WASM execution of vector operations.
4. The foundational Rust crate (`wyr-ruvector`) that can evolve into or be replaced by `rvf-index` when Dossier adopts the RVF package format (see ADR 0011).

The "Would You Rather" (WYR) game presents binary choices and uses HNSW similarity search, exponential moving average preference learning, and multi-signal scoring to generate increasingly personalized questions.

## Decision

Build a Rust-native WYR application (`wyr/`) within the Dossier monorepo as a Cargo workspace with three crates and a Tauri desktop frontend.

### Core Components

| Crate | Purpose | Key Types |
|-------|---------|-----------|
| **`wyr-ruvector`** | Native Rust RuVector primitives | `Vector`, `HnswIndex`, `cosine_similarity`, `euclidean_distance` |
| **`wyr-core`** | Game domain logic | `GameEngine`, `Question`, `PreferenceModel`, `Category`, `Choice` |
| **`wyr-app`** | Tauri 2.x desktop app | Tauri commands (`get_question`, `submit_answer`, `get_stats`, `get_progress`) + HTML/CSS/JS frontend |

### Architecture

```
wyr/
  Cargo.toml             (workspace: 3 members, resolver 2)
  wyr-ruvector/          (HNSW, vector ops, similarity)
    src/
      vector.rs          (Vector: new, zeros, norm, normalize, add, scale)
      similarity.rs      (cosine_similarity, euclidean_distance)
      hnsw.rs            (HnswIndex: insert, search, greedy_closest, search_layer)
  wyr-core/              (game engine, preference learning)
    src/
      question.rs        (Question, Category [8 types], Choice, seed_questions [16])
      preference.rs      (PreferenceModel: EMA profile, HNSW history, category stats)
      engine.rs          (GameEngine: next_question scoring, answer tracking)
  wyr-app/               (Tauri desktop app)
    src/
      commands.rs        (AppState, Tauri commands with Mutex<GameEngine>)
      lib.rs             (Tauri builder with managed state)
      main.rs            (entry point)
    frontend/
      index.html         (gradient UI, side-by-side options, progress bar, results)
    tauri.conf.json      (window config, bundle config)
    icons/               (icon.ico, icon.png)
```

### Key Design Choices

1. **HNSW in Rust**: Hierarchical navigable small-world graph with configurable M (neighbors per layer) and ef_construction. Random level assignment via `ml = 1/ln(M)`. Greedy closest + ef-search at each layer. This mirrors the INDEX_SEG progressive structure in the RVF format.

2. **Preference learning**: Each user choice updates an 8-dimensional preference vector (one-hot per category) via exponential moving average. Question scoring combines relevance (cosine similarity to profile, 40%), novelty (distance from previously-answered questions in HNSW, 35%), and category balance (25%).

3. **Tauri 2.x desktop**: Rust backend holds `Mutex<GameEngine>` in Tauri managed state. Four commands exposed to the JS frontend via `#[tauri::command]`. Web frontend uses vanilla HTML/CSS/JS with `window.__TAURI__.core.invoke()`. Keyboard support (A/Left, B/Right, Q/Esc).

4. **Offline-first**: No external API calls for core gameplay. 16 seed questions across 8 categories. Optional Claude integration for dynamic question generation is a future extension.

5. **Alignment with ruvector ecosystem**: `wyr-ruvector`'s `Vector` and `HnswIndex` use the same algorithms as `rvf-index` (HNSW with cosine/euclidean metric). Preference vectors use the same normalization. This ensures that migrating to `rvf-*` crates or producing `.rvf` files is a natural evolution.

### Implementation Status

| Metric | Value |
|--------|-------|
| Tests passing | 17 (10 ruvector + 7 core) |
| Clippy warnings | 0 |
| Build status | Clean (`cargo build` + `cargo test`) |
| Dependencies | rand, serde, serde_json, tauri 2.x, crossterm (transitive) |
| Seed questions | 16 across 8 categories |
| HNSW config | M=16, ef_construction=64 (preference model) / 200 (tests) |

### Integration Points

| Integration | Direction | Mechanism |
|-------------|-----------|-----------|
| **RVF export** | wyr → .rvf | Preference HNSW + vectors can be serialized into VEC_SEG + INDEX_SEG segments (ADR 0011) |
| **Dossier embeddings** | Shared format | Same dimensionality and cosine normalization as `@ruvector/rvf` |
| **agentdb** | wyr-ruvector → agentdb | Native HNSW implementation validates the same algorithm used by `agentdb@3` via `ruvector` |
| **Performance benchmarks** | Native vs WASM | Same HNSW M/ef params; compare insert/search latency and recall@10 |
| **MCP tools** | wyr → Claude Code | Preference profile could be exposed as MCP resource via `@ruvector/rvf-mcp-server` |

## Consequences

- Validates RuVector HNSW and cosine similarity in native Rust with real usage patterns.
- Establishes the Rust workspace and build infrastructure (`cargo test`, `cargo clippy`) needed for future RVF crate integration (ADR 0011).
- Tauri 2.x demonstrates the Rust-backend + web-frontend pattern for future Dossier desktop tools.
- 17 passing tests provide regression coverage for vector operations and game logic.
- The wyr-app is self-contained — it does not affect existing Next.js builds or package.json.

## Alternatives Considered

- **Keep RuVector JS-only**: Misses native performance validation and the Rust workspace foundation needed for ADR 0011.
- **Standalone repo**: Loses monorepo integration, shared CI, and the path to `.rvf` production within Dossier.
- **Python implementation**: Rust provides better performance for vector ops and aligns with the ruvector crate ecosystem (14 Rust crates).
- **CLI/TUI only (ratatui)**: Built initially but replaced with Tauri for richer UI and cross-platform desktop distribution.

## Related

- [ADR 0011](./0011-rvf-agent-packages.md) — RVF package format that builds on the native Rust primitives from this workspace
- [memory-reference.md](../domains/memory-reference.md) — Dossier's WASM-based RuVector memory layer
