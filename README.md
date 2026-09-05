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
   Unresolved issues stay safely in the active dashboard incubator (`openCases`). When AutoDream consolidates an open case, it dynamically expands its query window (`getRecentFactsSince`) back to the initial timestamp when the case was opened (`minTs`), delivering **100% of the historical working facts and context** to the LLM to compile the 4-block triage record without semantic loss.

3. **⚖️ Real-Time Semantic Arbiter** *(Powered by Semantic Arbiter Agent)*:  
   Solves vector RAG state blindness. When a new fact enters (e.g., *"Server IP moved to .205"*), the Arbiter evaluates whether it is **Additive** (co-exists with past context) or **Exclusive** (replaces an old state), soft-deleting contradictory records in real time.

4. **🚀 Embedded In-Process Storage (No Dedicated Vector DB Required)**:  
   Zero database infrastructure to deploy. You don't need to spin up heavy Docker containers for Qdrant/Chroma, configure PostgreSQL with `pgvector`, or pay for cloud vector databases like Pinecone. The entire hybrid index (FTS5 BM25 + Int8 vectors) lives inside a single local SQLite file handled by `better-sqlite3` (in safe `TRUNCATE` mode). Reads active dashboard state in **`< 0.1 ms`** and memories in **`< 1.5 ms`**.  
   *(Note: While database operations are local in-process, computing vector embeddings requires an embedder model — either local via Ollama `nomic-embed-text` or via cloud API. If no embedder is configured, search gracefully degrades to pure keyword FTS5).*

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

// 1. Save a new fact (automatically filtered & audited for collisions)
await memory.save("Production database server is running on IP 10.0.0.50");

// 2. Recall relevant facts instantly (FTS5 + Vector hybrid search)
const facts = await memory.search("Where is the database server hosted?");
console.log(facts); 
// -> [{ id: "...", data: "[TECHNICAL] Production database server is running on IP 10.0.0.50", score: 0.95 }]

// 3. Inspect active project dashboard (instant 0 ms SQLite read)
const dashboard = memory.getDashboard();
console.log(dashboard?.data);
// -> "Active working context and unresolved incubator cases..."

// 4. Asynchronous lifecycle maintenance (AutoDream - run at session end or idle timer)
// await memory.consolidate();
```

---

## 🧩 Cognitive Roles & Model Sizing: Bigger is Not Always Better

You don't need a massive 70B or 120B model to manage long-term memory. In our real-world tests, giant models often underperformed because they chat too much instead of returning clean, machine-readable data.

What this system actually needs is **discipline, not raw parameter size**: models that follow strict instructions, never hallucinate conversational filler, and return 100% valid JSON schemas every time.

The engine divides memory management into specialized roles so you can run cheap, fast models where they shine and save heavy compute:

```text
[User Message]
       │
       ▼
1. GATEKEEPER ───────► Casual chatter? ("hello", "thanks") ──► [YES] ──► DROP (0 cloud cost)
   (Local 1.5B SLM)          │ [NO]
                             ▼
2. NOTARY ───────────► Extract clean facts in 3rd person ────► Requires Strict JSON Schema
                             ▼
3. SEMANTIC ARBITER ─► Check conflicts (Old IP vs. New IP) ──► Requires Relational Logic
                             ▼
4. AUTODREAM ────────► Multi-hour synthesis & open issues ───► Requires Context + Complex Schemas
```

### Role Breakdown

| Role | What it does | What it needs | Default / Recommended | Override Env |
| :--- | :--- | :--- | :--- | :--- |
| **`GATEKEEPER`** | **The Bouncer:** Drops conversational noise ("hello", "thanks", "ok") before touching expensive APIs. | **Ultra-Low:** Simple YES/NO classification. No JSON output, no memory history. Runs easily on low-end CPUs in <1GB RAM. | `ollama/qwen2.5-coder:1.5b` *(or llama3.2:1b)* | `GATEKEEPER_MODEL` |
| **`QUERY_EXPANDER`** | **The Librarian:** Turns vague questions (*"what happened to that server?"*) into sharp search queries using recent conversation context. | **Low-Medium:** Contextual reasoning. **OPTIONAL:** Set to `none` to disable. Disabling provides 0 ms search latency, $0 cost, and zero conversational noise in search tokens. | `gemini/gemini-2.5-flash-lite` *(or `none` to disable)* | `EXPANDER_MODEL` |
| **`NOTARY`** | **The Clerk:** Extracts permanent facts, rules, and preferences into clean JSON. Small local models fail here because they add chat filler (*"Sure! Here are your facts:"*) which breaks JSON parsers. | **Medium:** Strict JSON Mode / Structured Outputs. Distinguishes permanent facts from temporary remarks. | `gemini/gemini-2.5-flash-lite` | `NOTARY_MODEL` |
| **`SEMANTIC_ARBITER`** | **The Auditor:** Compares new facts against old memories. Detects if a fact is *Additive* ("Alice also likes tea") or *Exclusive* ("Server IP moved to .97" replaces ".96"). | **High (Relational Logic):** Must reason whether facts contradict and emit exact UUIDs to soft-delete. Untuned local models struggle with this logic. | `gemini/gemini-2.5-flash-lite` | `ARBITER_MODEL` |
| **`STATE_ORCHESTRATOR`** | **The Historian (AutoDream):** Ingests accumulated working facts and dashboard state from the past 12–24h (typically 1.5k–4k tokens), writes an executive summary, updates the active dashboard, compiles 4-block technical cards, and tracks unresolved incubator cases. | **Very High:** Long context (4k-8k tokens) + complex nested JSON generation without looping or cutting off. | `gemini/gemini-2.5-flash-lite` | `ORCHESTRATOR_MODEL` |
| **`EMBEDDER`** | **The Vectorizer:** Generates 768-dimensional dense vectors for SQLite Int8 scalar quantization. | **Specialized:** 768-dim embeddings with solid cosine geometry. | `ollama/nomic-embed-text` *(Fallback: `gemini-embedding-001`)* | `EMBEDDER_MODEL` |

### 🌐 Universal Model Routing (`PROVIDER/MODEL`)

All model environment variables support the universal `PROVIDER/MODEL` prefix syntax, decoupling your architecture from any single vendor:

* **`gemini/<model>`:** Calls Google Gemini SDK (e.g. `gemini/gemini-2.5-flash-lite`).
* **`ollama/<model>`:** Calls local Ollama service (e.g. `ollama/qwen2.5-coder:1.5b`, `ollama/mistral:7b`).
* **`openai/<model>`:** Calls OpenAI `/v1/chat/completions` (or any custom local server set via `OPENAI_BASE_URL`).
* **`openrouter/<model>`:** Calls OpenRouter API (e.g. `openrouter/anthropic/claude-3.5-haiku`).
* **`none` (Query Expander only):** Completely bypasses the agent for 0 ms search overhead and **literal** search precision.

See [`.env.example`](.env.example) for a ready-to-use configuration template.

* **Run local where it's fast & free:** A tiny 1.5B model (`qwen2.5-coder:1.5b`) plus `nomic-embed-text` running locally in Ollama absorbs 100% of your chit-chat filtering and vector generation. Zero API cost, zero network latency.
* **Use cloud where schema accuracy matters:** Delegating Notary, Arbiter, and AutoDream to `gemini-2.5-flash-lite` guarantees 100% JSON reliability and sharp relational reasoning for pennies a month (less than $0.50/month for normal workloads).

---

## 🔌 Programmatic API Reference

### 🟢 `memory.search(query, limit?, userId?)`
Executes parallel FTS5 BM25 + Int8 Vector search. Returns `MemoryHit[]` containing `data` (canonical fact string), `score`, `source`, and `created_at`.

### 🟢 `memory.save(text, userId?)`
Ingests user input through the 2-Layer Noise Firewall, Notary Fact Extractor, and Real-Time Semantic Arbiter.

### 🟢 `memory.getDashboard(userId?)` -> `{ data: string; memory?: string; updated_at: string } | null`
Instantaneous, zero-cost read of the persistent consolidated dashboard from SQLite (UUID `00000000-0000-0000-0000-000000000000`).
- **Latency:** 0 ms (in-process SQLite query).
- **Cost:** $0 tokens (no LLM call).
- **When to call:** On **every user turn** during prompt assembly to provide the LLM with live working context.

---

### 🟢 `memory.consolidate(userId?)` -> `Promise<AutoDreamResult>`
Runs background memory maintenance (AutoDream). Summarizes recent progress, cleans up outdated notes, saves key technical takeaways, and updates your active project board.

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

## 🌙 The Consolidation Lifecycle (`consolidate` / AutoDream): What, When & How

### 1. What It Does
When users interact with an AI agent, atomic facts accumulate rapidly in SQLite. Without active maintenance, long-term memory suffers from **historical clutter and temporal contradictions** (e.g., discarded setup attempts from Monday conflicting with the actual working setup from Thursday).

`consolidate()` acts as the **cognitive garbage collector and state compressor** (akin to human REM sleep):
1. **Prunes Stale Working Facts:** Identifies which past attempts were discarded and consolidates the surviving truth.
2. **Updates the Persistent Dashboard:** Overwrites the canonical project status at UUID `00000000-0000-0000-0000-000000000000`.
3. **Extracts 4-Block Triage Cards:** Crystallizes architectural decisions, bugfixes, or operational rules into permanent structured records.
4. **Manages the Incubator (`openCases`):** Keeps active blockers live; auto-archives abandoned cases as `[UNRESOLVED_CASE]` when their inactivity TTL expires.

### 2. ⚠️ Critical Invariant: Why It Must NOT Run on Every Turn
Executing `consolidate()` triggers an LLM call to synthesize the recent conversational trajectory (~2–5 seconds and consumes model tokens).
- **During interactive conversation turns:** The host application should **only read** `memory.getDashboard()` (0 ms latency, $0 token cost).
- **`consolidate()` should ONLY be executed asynchronously as a background or lifecycle event.**

---

### 3. Execution Patterns: SDK vs MCP Server

#### A. In SDK / Node.js Module (`memory.consolidate()`)
Depending on your application architecture, use one of these three battle-tested patterns:

* **Pattern 1: Session Teardown / Handover (Standard Chatbots & Scripts)**
  Run upon explicit user exit, session close, or when the user says *"goodbye / wrap up for today"*:
  ```typescript
  // Call once when user concludes session
  await memory.consolidate();
  ```

* **Pattern 2: Inactivity Debounce Timer (Autonomous Agents & WhatsApp Bots)**
  Maintain a rolling 5-minute inactivity timer in your application. Every incoming user message cancels and resets the timer. If 5 minutes elapse without new user interaction, trigger `consolidate()` silently in the background:
  ```typescript
  let idleTimer: NodeJS.Timeout;

  function onUserTurn() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      console.log("Idle threshold reached (5m). Consolidating working state in background...");
      await memory.consolidate();
    }, 5 * 60 * 1000);
  }
  ```

* **Pattern 3: Scheduled Batch / Nightly Cron (High-Throughput Services)**
  Trigger every $N$ turns (e.g. every 20 interactions) or via a scheduled nightly cron job (e.g. at 3:00 AM) to synthesize all daily facts into the dashboard without interrupting user workflows.

---

#### B. In MCP Server Mode (`consolidate` tool)
When running as a Model Context Protocol (MCP) Stdio server for Cursor, Claude Desktop, or Antigravity, the server is passive. Consolidation is initiated by the AI client:

* **Autonomous Tool Invocations:** The client LLM inspects the tool manifest:
  `consolidate: Executes an AutoDream state consolidation cycle...`
  When a user says *"Save our progress"*, *"Wrap up for today"*, or *"Document what we did"*, the LLM autonomously calls the `consolidate` tool.
* **IDE Rules & System Prompts (Recommended):** Add an explicit instruction to your `.cursorrules`, `CLAUDE.md`, or agent system prompt:
  ```markdown
  - Upon completing a major feature, refactoring milestone, or when the user indicates the session is ending, invoke the `consolidate` MCP tool to commit working state into long-term memory.
  ```

---

> [!TIP]
> **Why this matters across multiple days:**  
> In a single chat session, standard memory works just fine. But when working on a project across several days, a basic search easily gets confused by old, discarded ideas (like Monday's failed attempt clashing with Thursday's working fix).
> 
> AutoDream cleans this up behind the scenes—sweeping away dead ends so your bot always knows what is **actually current**.

---

## 🔧 Resilience & Endpoint Robustness

- **URL Auto-Sanitization (`getOllamaApiUrl`):** Automatically strips trailing endpoints (`/api/chat`, `/api/generate`, `/chat`, `/`) to guarantee clean base URL configuration (`http://host:port/api`).
- **Ollama Context Window:** Configured to `num_ctx: 4096` tokens for complex JSON schema processing.
- **Gemini SDK Schema Compliance:** Uses lowercase OpenAPI standard types (`object`, `array`, `string`, `number`) ensuring zero runtime `ReferenceError` crashes.

---

## 🏗️ Architectural Patterns: Pure RAG vs Continuous Agent

Think of `sqlite-local-ai-memory` as a **focused, modular memory engine**. It handles remembering and organizing facts, but stays completely out of your application logic—it never builds your prompts, enforces a chatbot personality, or calls conversational LLMs behind your back:

- **Your Application:** Keeps 100% control over your bot's personality, system prompts, external tools, and message flow.
- **The Memory Engine:** Simply hands you relevant facts and an **optional** project dashboard whenever your bot needs context.

### Concrete Example: How Both Patterns Complement Each Other

Both tools work together, but they answer different questions:
- **`memory.search(query)` looks back at specific facts:** Retrieves exact parameters, IPs, ports, and configuration details from past conversations.
- **`memory.getDashboard()` looks forward at project progress:** Shows what you are actively working on, what is currently blocked, and what to do next.

#### Historical Conversation Context (Database Migration Week)
1. **User:** *"We deployed the PostgreSQL replica container on port 5433 to avoid port collisions with the host Postgres."*
2. **User:** *"The replication user was created as 'rep_user' with credentials encrypted in .env."*
3. **User:** *"The initial 45 GB database dump finished importing with zero errors."*
4. **User:** *"Before this weekend's production cutover, we still need to rebuild the PostGIS spatial indexes and measure replica lag under load."*

*(Later session / next morning)*
- **User Query:** *"Which port and user did we configure for the Postgres replica, and how are we tracking on the migration?"*

---

### Scenario A: Pure Episodic RAG (`search` only)

Ideal for Q&A bots, technical inventory lookups, documentation tools, or CLI utilities where the user queries specific technical facts.

#### 1. Host Application Code
```typescript
// Host performs a cold episodic search targeting the query
const hits = await memory.search("Which port and user did we configure for the Postgres replica, and how are we tracking on the migration?");
```

#### 2. Engine Return Payload (`MemoryHit[]`)
The search engine extracts the exact hard facts with high relevance matching the `MemoryHit` interface:
```json
[
  {
    "id": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
    "score": 0.924,
    "data": "[TECHNICAL] PostgreSQL replica container configured on port 5433 to avoid host collisions.",
    "source": "antigravity",
    "created_at": "2026-09-04T10:15:00.000Z"
  },
  {
    "id": "b2c3d4e5-f6a7-4b6c-9d0e-1f2a3b4c5d6e",
    "score": 0.891,
    "data": "[TECHNICAL] Replication user configured as 'rep_user' for PostgreSQL replica.",
    "source": "antigravity",
    "created_at": "2026-09-04T10:20:00.000Z"
  },
  {
    "id": "c3d4e5f6-a7b8-4c7d-0e1f-2a3b4c5d6e7f",
    "score": 0.812,
    "data": "[OPERATIONAL] Initial 45 GB database dump import completed with zero errors.",
    "source": "antigravity",
    "created_at": "2026-09-04T11:45:00.000Z"
  }
]
```

#### 3. Assembled Host Prompt Injected into the LLM
```text
[SYSTEM PROMPT]
You are a helpful and concise technical assistant.

[RELEVANT RETRIEVED FACTS]
• PostgreSQL replica container configured on port 5433 to avoid host collisions. (Score: 0.92)
• Replication user configured as 'rep_user' for PostgreSQL replica. (Score: 0.89)
• Initial 45 GB database dump import completed with zero errors. (Score: 0.81)

[USER MESSAGE]
Which port and user did we configure for the Postgres replica, and how are we tracking on the migration?
```

#### 4. Resulting LLM Response
> *"The Postgres replica is configured on **port 5433** with the user **`rep_user`**. Regarding migration progress, our latest records confirm that the initial 45 GB database dump was imported successfully with zero errors."*

#### 5. Characteristics
- **Strengths:** Flawless factual accuracy. Delivers the exact parameters (port 5433, user `rep_user`, 45 GB status) with zero hallucination. Ultra-low latency (<50ms) and minimal token consumption.
- **Limitation:** Factual, but unaware of operational project trajectory (blind to the PostGIS index requirement and the weekend cutover deadline).

---

### Scenario B: Continuous Stateful Agent (`search` + `getDashboard`)

Ideal for pair-programming assistants, DevOps copilots, and autonomous bots that drive multi-day projects forward.

#### 1. Host Application Code (Turn Execution)
```typescript
// 1. Query hard technical facts (FTS5 + Cosine Vector)
const hits = await memory.search("Which port and user did we configure for the Postgres replica, and how are we tracking on the migration?");

// 2. Read active dashboard state (instant SQLite read, 0 ms latency, zero token cost)
const dashboard = memory.getDashboard();

// Note: memory.consolidate() should be run asynchronously (session end, cron, or inactivity timer) to maintain this dashboard.
```

#### 2. Engine Return Payload (Facts + Working State)
In addition to the exact factual hits (`MemoryHit[]`) from Scenario A, `memory.getDashboard()` instantly reads the canonical project dashboard from SQLite (0 ms):

```json
{
  "data": "📋 CURRENT WORKING STATE:\n• Project: postgres-replica-migration [Status: INCUBATING]\n  - Target: Production cutover scheduled for this weekend.\n  - Active Blockers: PostGIS spatial indexes must be rebuilt; replica lag unverified under load.\n  - Next Action: Rebuild PostGIS spatial indexes and test replication latency.",
  "updated_at": "2026-09-04T12:00:00.000Z"
}
```
*(Note: The full structured `AutoDreamResult` with `narrativeSummary`, `triageMemory`, and `openCases` was computed and persisted into this dashboard record during the previous background `memory.consolidate()` cycle).*

#### 3. Assembled Host Prompt Injected into the LLM
```text
[SYSTEM PROMPT]
You are a DevOps copilot with persistent working memory.

[RELEVANT RETRIEVED FACTS]
• PostgreSQL replica container configured on port 5433 to avoid host collisions. (Score: 0.92)
• Replication user configured as 'rep_user' for PostgreSQL replica. (Score: 0.89)
• Initial 45 GB database dump import completed with zero errors. (Score: 0.81)

[ACTIVE DASHBOARD & WORK IN PROGRESS]
• Project: "postgres-replica-migration" [Status: INCUBATING]
  - Target: Production cutover scheduled for this weekend.
  - Active Blockers: PostGIS spatial indexes must be rebuilt; replica lag unverified under load.
  - Suggested Next Action: Rebuild PostGIS spatial indexes and test replication latency.

[USER MESSAGE]
Which port and user did we configure for the Postgres replica, and how are we tracking on the migration?
```

#### 4. Resulting LLM Response
> *"The Postgres replica is running on **port 5433** under user **`rep_user`**, and the initial 45 GB dump has been imported.*
> 
> *Regarding our migration trajectory, we are on schedule for the weekend cutover, but we have two active blockers on the board before we can give the green light:*
> 1. *Rebuild and sync the PostGIS spatial indexes.*
> 2. *Benchmark replication lag under load.*
> 
> *Would you like to start rebuilding the PostGIS spatial indexes first?"*

#### 5. Characteristics
- **Strengths:** Retains the exact mathematical precision of the RAG hits, but frames the answer inside the operational reality of the project. Proactively surfaces blockers, reminds the team of the weekend deadline, and proposes the next concrete engineering step.
- **Overhead:** Small additional context cost (dashboard summary + active triage cards).

---

### Pattern Comparison

| Feature | Scenario A: Pure RAG (`search`) | Scenario B: Continuous Agent (`search` + `getDashboard`) |
| :--- | :--- | :--- |
| **Focus** | **Looking back:** Recalls specific details, IPs, ports, and past facts. | **Looking forward:** Recalls exact facts PLUS current progress and next steps. |
| **Turn Assembly** | `memory.search(query)` | `memory.search(query)` + `memory.getDashboard()` |
| **State Maintenance** | None | `memory.consolidate()` (in background / session end) |
| **Response Tone** | Accurate, concise, and purely bounded to historical facts. | Accurate, context-aware, and momentum-driven. |
| **Context Overhead** | Ultra-low (only hit tokens) | Moderate (hits + active working cases) |
| **Best For** | Search APIs, Q&A bots, technical inventory, CLI tools. | Developer copilots, personal AI assistants, live operations. |

---

## 📄 License

[MIT License](LICENSE) — Copyright (c) 2026
