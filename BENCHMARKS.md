# Production Benchmarks & Telemetry: sqlite-local-ai-memory (v1.4.2)

> **Real-World Validation:** Unlike synthetic benchmarks that measure vector cosine operations in isolated loops, the following metrics were captured **in a 24/7 production environment** running as the cognitive memory engine for an autonomous WhatsApp assistant (**Maria Corsini**) and technical engineering agents (**Antigravity AGY**).

---

## 1. Executive Summary

| Metric | Measured Result | Operational Impact |
| :--- | :--- | :--- |
| **Idle RAM Footprint** | **0.00 MB** (In-Process SQLite) | Eliminates dedicated memory daemons (saved +3.2 GB RAM vs Qdrant/Chroma). |
| **Historical Production Lifespan** | **5+ Months** (Apr 2026 – Present) | Zero corruption, zero index drift under XFS/Linux storage. |
| **Active Fact Database Size** | **15,904 Int8 Vectors** (7,858 FTS5 docs) | Instant warm boot (<15 ms), 4.6 MB total database file on disk. |
| **Production Retrieval Hit Rate** | **97.6%** ($\ge 0.60$ Relevance) | 164 of 168 real-world conversational user queries found relevant facts. |
| **Top-Tier Retrieval Accuracy** | **94.6%** ($\ge 0.80$ Relevance) | Overwhelming majority of matches had high semantic alignment. |
| **Blank Queries (0 Hits)** | **0.0% (0 / 168)** | Zero missed retrievals across 14 consecutive days of dialogue. |
| **Average End-to-End Latency** | **989 ms** (Dual RAG + Smart Gate) | Full disambiguation via SLM + Int8 vector math + SQLite ranking. |
| **Raw SQLite Search Latency** | **< 2.1 ms** (FTS5 BM25 + Vector scan) | Sub-millisecond lookup when query is pre-computed. |

---

## 2. Resource Consumption: Bare-Metal SQLite vs. Traditional Vector DBs

Memory and CPU profiles measured on an Intel Core i7-4770 (Haswell) with 16 GB DDR3 RAM running Debian 12 / Proxmox VE:

```
[Memory Footprint in Production (Idle / Standby)]

Qdrant Container (mem0 cluster):
████████████████████████████████████████ 3,250 MB (Rust/gRPC daemon)

ChromaDB / Milvus Standalone:
██████████████████████████              2,100 MB (Python/C++ runtime)

sqlite-local-ai-memory:
▏ 0 MB (Zero RAM at rest; Kernel Page Cache on-demand)
```

### Architectural Highlights:
* **TRUNCATE Journal Mode:** Prevents SMB/CIFS and multi-process POSIX lock corruption while reducing inode allocation overhead by 100% compared to `DELETE` mode.
* **Int8 Scalar Quantization:** 768-dimensional float32 embeddings (3,072 bytes per vector) are quantized to 8-bit signed integers (-127 to +127), reducing vector storage to **768 bytes** (a 75% memory compression) with $<1.5\%$ degradation in recall.
* **Native In-Process Execution:** Zero network serialization, zero HTTP/gRPC overhead, zero Docker bridges.

---

## 3. Two-Week Deep Telemetry Audit (WhatsApp Production)

* **Logging Mechanism:** Append-only JSONL event stream (`memory_telemetry.jsonl`) instrumented directly inside the `MemoryEngine` facade.
* **Period Audited:** September 9, 2026 – September 22, 2026 (14 continuous days).
* **Total Operations Processed:** **929 memory events**.
  * `SAVE_FACT` (Deterministic atomic facts): **488**
  * `SAVE` (Conversational compilation & noise filtering): **273**
  * `SEARCH` (Live conversational RAG retrievals): **168**

### Retrieval Score Distribution (168 Queries)

```
Score >= 0.80 (Excellent): ███████████████████████████████████ 159 (94.6%)
Score >= 0.70 (High):      █████████████████████████████████████ 160 (95.2%)
Score >= 0.60 (Relevant):  ██████████████████████████████████████ 164 (97.6%)
Score < 0.60 (Discarded):  █ 4 (2.4%)
Zero Matches (0 hits):     0 (0.0%)
```

* **Mean Top Relevance Score:** **0.832 / 1.000**
* **Average Hits Returned per Query:** **4.8 facts**

---

## 4. The Smart Gate & Conversational Ring Buffer Benchmark

Standard vector databases fail in conversational interfaces when users speak naturally using pronouns, short confirmations, or fragmented questions. `sqlite-local-ai-memory` embeds an ephemeral RAM ring buffer (FIFO 10 turns) coupled with an automatic **Smart Gate**:

* **Smart Gate Invocation Rate:** **95.8% (161 / 168 queries)**.
* **Autonomous Disambiguation Success:** **90.5% (152 / 168 queries)**.

### Real Production Disambiguation Samples:

| User Input in WhatsApp | Smart Gate Disambiguation | Final Retrieval Score |
| :--- | :--- | :--- |
| *"De la 45 tenemos algo?"* | `alarmas Sucursal 0045` | **0.615** (Exact store status) |
| *"Mmm revisa si alguna se reporto sin luz (AC)"* | `alarmas sin luz AC` | **0.800** (Power failure log) |
| *"y desarmadas? alguna?"* | `sucursal desarmada` | **0.900** (Security events) |
| *"te regreso algo?"* | `estado de la sucursal 0045 a las 00:34` | **0.880** (Incident report) |

---

## 5. Historical Robustness: 5 Months at Scale

From the central unified database (`memoria.db`):
* **15,904 Vector Entries** accumulated since April 24, 2026.
* **7,858 BM25 Indexed Documents** in `recuerdos_fts`.
* **Zero instances of `SQLITE_CORRUPT`** across unexpected power cuts, reboot cycles, or multi-client concurrent access (Node.js + Python + CLI).
