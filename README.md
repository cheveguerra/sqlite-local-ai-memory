# 🧠 SQLite Local AI Memory

> **Simple, fast, long-term memory for your AI chatbots, agents, and MCP tools.**  
> Give your LLM a persistent memory using a local SQLite file. No complex database servers, no heavy cloud setup, and zero C++ compilation errors. Works everywhere.

---

## 💡 Overview

Most LLM long-term memory frameworks require running complex Docker microservices (Milvus, Qdrant, Weaviate) or paying for cloud APIs (Mem0, Zep). 

**SQLite Local AI Memory** provides a **100% In-Process, Bare-Metal Memory Architecture** designed for TypeScript/Node.js environments. It achieves **sub-2ms retrieval latencies** without external database servers, network IPC roundtrips, or native C++ compilation issues.

---

## ⚡ What Makes This Unique? (The "Secret Sauce")

Unlike basic vector wrappers or chat buffer memory systems, this architecture incorporates 6 specialized cognitive mechanisms driven by dedicated AI agents and bare-metal algorithms:

1. **🌙 AutoDream Dual-Output Engine** *(Powered by State Orchestrator Agent - Gemini / Ollama)*:  
   Operates in the background via time-based pruning (12h TTL) and *Semantic Bumping*. Produces a **Dual Output**:
   - **Active Dashboard:** Live executive summary (`narrativeSummary`) and active working state (`dashboard`).
   - **Long-Term Triage Memory:** High-density 4-block technical facts (`triageMemory`) compiled directly into SQLite.
   - **Unresolved Case Archiving:** If an open case expires from the dashboard without resolution, it is auto-compiled into SQLite as `[UNRESOLVED_CASE]` before pruning, preserving historical diagnostic evidence.

2. **🐣 Open Case Incubator & Dynamic Query Window (Option B)**:  
   Unresolved issues stay safely in the active dashboard incubator (`openCases`). When AutoDream consolidates an open case, it dynamically expands its query window (`getRecentFactsSince`) back to the initial timestamp when the case was opened (`minTs`), delivering **100% of the raw historical conversation context** to the LLM to compile the 4-block triage record without semantic loss.

3. **⚖️ Real-Time Semantic Arbiter** *(Powered by Semantic Arbiter Agent)*:  
   Solves vector RAG state blindness. When a new fact enters (e.g., *"Server IP moved to .205"*), the Arbiter evaluates whether it is **Additive** (co-exists with past context) or **Exclusive** (replaces an old state), soft-deleting contradictory records in real time.

4. **🚀 100% In-Process Shared Kernel Memory** *(Zero LLM required for reads)*:  
   Zero network IPC. Reads active dashboard state in **`< 0.1 ms`** and vector memories in **`< 1.5 ms`** by mapping `better-sqlite3` directly into Linux Kernel shared RAM (`WAL` mode + `256MB mmap`).

5. **🛡️ 2-Layer Noise Firewall**:  
   Protects your database and API bill from clutter:
   - *Layer 1 (Regex, 0 ms):* Intercepts "hello", "thanks", "ok" instantly.
   - *Layer 2 (Local SLM Qwen 1.5B, 10 ms):* Uses a bare-metal mini-model to drop non-knowledge chatter before calling cloud APIs.

6. **🔎 Dual Parallel Hybrid RAG**:  
   Executes exact **SQLite FTS5 BM25** (keyword/IP matching in `< 0.5 ms`) and **Int8 Scalar Quantized Vector Search** (`nomic-embed-text`) in parallel with reciprocal rank scoring.

---

## 💻 Quick Example

```typescript
import { MemoryEngine } from "sqlite-local-ai-memory";

const memory = new MemoryEngine();

// 1. Save a new fact (Automatically filtered & audited for collisions)
await memory.save("Server Proxmox is running on IP 192.168.100.200");

// 2. Recall relevant facts instantly
const facts = await memory.search("Where is Proxmox hosted?");
console.log(facts); 
// -> [{ id: "...", data: "[TECHNICAL] Server Proxmox is running on IP 192.168.100.200", score: 0.95 }]

// 3. Consolidate working state & triage facts (AutoDream)
const result = await memory.consolidate();
console.log(result.narrativeSummary);
console.log(result.triageMemory);
```

---

## 🔌 Programmatic API Reference

### 🟢 `memory.search(query, limit?, userId?)`
Executes parallel FTS5 BM25 + Int8 Vector search. Returns `MemoryHit[]` containing `data` (canonical fact string), `score`, `source`, and `created_at`.

### 🟢 `memory.save(text, userId?)`
Ingests user input through the 2-Layer Noise Firewall, Notary Fact Extractor, and Real-Time Semantic Arbiter.

### 🟢 `memory.consolidate(userId?)` -> `Promise<AutoDreamResult>`
Triggers the AutoDream State Orchestrator. Returns an `AutoDreamResult` object:

```typescript
export interface AutoDreamResult {
  /** Executive narrative summary of active working context */
  narrativeSummary: string;
  /** Active dashboard items currently live in working memory */
  dashboard: DashboardItem[];
  /** Consolidated long-term facts injected into SQLite during this cycle */
  triageMemory: TriageItem[];
  /** Unresolved incubator cases currently in progress */
  openCases: OpenCaseItem[];
  /** Total count of active dashboard items */
  totalActive: number;
  /** Human-readable status message */
  statusMessage: string;
}
```

#### Structured 4-Block Triage Format for Technical Memory:
```text
[TECHNICAL] 
[SYMPTOM]: Error 256X in B4A socket reconnection.
[ROOT_CAUSE]: Premature JobDone event dispatch before stream readiness.
[SOLUTION]: Insert Sleep(0) before resumable sub invocations.
[PREVENTIVE_RULE]: Never ignore resumable sub call order in socket handlers.
```

---

## 🔧 Resilience & Endpoint Robustness

- **URL Auto-Sanitization (`getOllamaApiUrl`):** Automatically strips trailing endpoints (`/api/chat`, `/api/generate`, `/chat`, `/`) to guarantee clean base URL configuration (`http://host:port/api`).
- **Ollama Context Window:** Configured to `num_ctx: 4096` tokens for complex JSON schema processing.
- **Gemini SDK Schema Compliance:** Uses lowercase OpenAPI standard types (`object`, `array`, `string`, `number`) ensuring zero runtime `ReferenceError` crashes.

---

## 📄 License

[MIT License](LICENSE) — Copyright (c) 2026
