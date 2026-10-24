# 🧠 SQLite Local AI Memory

> **Give your AI assistant a real, permanent memory in 60 seconds.**  
> No monthly database subscriptions. No Docker setup. Just a single private file on your computer.

---

## 🛑 The Problem: Why does your AI keep forgetting?

If you use AI coding assistants or chatbots (Claude Desktop, Cursor, Antigravity, etc.), you already know the frustration:

1. **Total Amnesia:** The moment you close the chat or start a new window, the AI forgets who you are, your tech stack, your server IPs, and your personal preferences.
2. **Copy-Paste Hell:** You have to re-explain the same context over and over, or paste giant text files into every single prompt.
3. **Wasted Money & Sluggish Chats:** Shoving massive chat histories into every prompt burns through your token budget, costs real money, and makes the AI slower and prone to confusion.

---

## ✨ The Solution: A Private Brain in a Single File

**`sqlite-local-ai-memory`** gives your AI assistant a permanent, organized brain stored safely in a single file (`memoria.db`) right on your own machine.

### How it works (In Plain English):

* 📝 **1. The Active Notepad (*What we are doing right now*):**  
  Keeps track of your immediate focus: active tasks, decisions made today, and next steps. When you open a fresh chat tomorrow, your AI instantly knows where you left off.
* 📚 **2. The Knowledge Vault (*Facts that rarely change*):**  
  Stores concrete knowledge—like your server configurations, preferred coding styles, or family rules. When something changes (e.g., an IP changes), it updates the active fact while keeping an audit trail of the past.
* 🌙 **3. Nightly Cleanup / AutoDream (*Keeping the brain tidy*):**  
  Just like the human brain organizes thoughts during sleep, when your AI is idle, it quietly reviews raw notes, merges duplicates, and connects related facts into a clean summary.

---

## ⚡ What Makes This Unique? (The "Secret Sauce")

Unlike simple chat logs or generic vector databases that dump raw text into a black box, this system uses **6 smart cognitive mechanisms** that make your AI truly understand its memory:

### 🌙 1. AutoDream Engine (Sleep-Cycle Memory Cleanup)
Instead of letting thousands of chat messages pile up into an unreadable mess, AutoDream acts like the human brain during REM sleep:
* **Live Dashboard:** Keeps an active summary of what you are building today.
* **Permanent Knowledge:** Automatically distills key technical decisions into compact facts in SQLite.
* **Never Loses Unfinished Work:** If a problem is left open or unresolved, AutoDream safely archives it with an `[UNRESOLVED_CASE]` tag so your AI can resume debugging weeks later without losing historical clues.

### 🐣 2. Open Case Incubator & Dynamic Memory Window
When troubleshooting a complex bug over multiple days, active investigations stay safely in an "incubator". When the AI finally consolidates the case, it doesn't just read the last message—it dynamically rewinds back in time to the exact moment the issue started, giving the AI 100% of the historical context to write the permanent fix.

### ⚖️ 3. Real-Time Contradiction Arbiter (Curing AI "Time Blindness")
Standard vector databases are completely blind to time. If you tell an AI *"My server IP is .100"* and two weeks later say *"We moved the server to .205"*, normal vector search returns both and the AI hallucinates. Our Semantic Arbiter detects state contradictions instantly: it archives the old IP and sets the new IP as active in real time.

### 🚀 4. 100% Embedded Storage (Zero Database Servers)
Zero Docker containers to maintain. You don't need to install Chroma, run PostgreSQL with pgvector, or pay for cloud databases like Pinecone. Everything—keyword indexing and vector math—lives inside a single local SQLite file. It retrieves active notes in under **0.1 ms** and deep memories in under **1.5 ms**.

### 🛡️ 5. Two-Layer Noise Firewall (Chatter Blocker)
Protects your database and API bill from clutter:
* **Layer 1 (Instant Filter, 0 ms):** Discards casual pleasantries (*"hello"*, *"thanks"*, *"sounds good"*) immediately.
* **Layer 2 (Smart Sifter, 10 ms):** Uses a tiny, fast model to drop non-knowledge conversation before invoking larger models.

### 🔎 6. Dual Hybrid Search (Exact Match + Meaning Combined)
Runs two searches simultaneously in parallel:
* **Exact Keyword Search (FTS5):** Finds exact IP addresses, variable names, and error codes in < 0.5 ms.
* **Semantic Vector Search:** Finds concepts even if you use completely different words.  
It blends both results using reciprocal rank scoring to return the exact right answer every time.

### 🛡️ 7. Graceful Offline Fallback (Never Crashes)
If your internet drops or you run without API keys, the system never hangs or crashes. It gracefully falls back to bare-metal mode: your AI can still save facts directly and search everything locally via fast keyword search.

> [!NOTE]
> **Degradation Notice:** While the system operates reliably without an LLM, the real magic and intelligence (AutoDream consolidation, contradiction arbitration, and semantic vector search) come alive when connected to an AI model (Google Gemini or local Ollama).

---

## 🔍 Honest Transparency: What is Local vs Cloud?

We believe in 100% honesty about how your AI memory operates:

* **Your Data & Storage: 100% Local & Private.**  
  All your memories, search indexes, and notes live in a single standard SQLite file on your drive. You never pay for cloud vector databases (no Pinecone, no Qdrant, no monthly SaaS bills).
* **The AI Reasoning Layer (3 Operating Modes):**  
  To organize notes, detect contradictions, and synthesize summaries, the system needs an AI model:
  * 🟢 **Mode 1: Cloud-Assisted (Recommended / Default):** Uses lightweight Google Gemini API. It gives you flawless JSON formatting and deep reasoning for literally pennies (<$0.50 a month for thousands of notes).
  * 🟡 **Mode 2: 100% Offline with Ollama (Private Local AI):** Works out-of-the-box with **Ollama** (`qwen2.5-coder` + `nomic-embed-text`) if you prefer to run entirely offline on your own hardware without sending a single byte to the internet.
  * 🔴 **Mode 3: Pure Bare-Metal Zero-LLM (Not Recommended):** If you provide no API keys and Ollama is not installed, the engine gracefully falls back to raw SQLite FTS5 keyword storage without crashing. **Warning: This mode is not ideal.** Without an LLM, you lose intelligent noise filtering, contradiction arbitration, entity extraction, and AutoDream consolidation. It behaves merely as a fast keyword database rather than an intelligent cognitive brain.

---

## 🚀 Quick Start: Choose Your Scenario

| Feature | Scenario 1: MCP Server (Recommended) | Scenario 2: Direct Node.js Library |
| :--- | :--- | :--- |
| **Best For** | **90% of users:** Cursor, Claude Desktop, VS Code | Developers building custom agents, bots, or backends |
| **Setup Time** | **60 seconds** (Zero coding required) | 5 minutes (Standard `npm install` import) |
| **How it works** | Your AI client talks to memory via stdio tools | In-process native execution with sub-millisecond calls |

---

### 🌟 Scenario 1: As an MCP Tool (Cursor, Claude Desktop, VS Code)

#### 1. Add to your MCP Config (`claude_desktop_config.json` or `.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "sqlite-memory": {
      "command": "npx",
      "args": ["-y", "sqlite-local-ai-memory"],
      "env": {
        "GEMINI_API_KEY": "your-gemini-api-key"
      }
    }
  }
}
```
*(Prefer 100% offline with Ollama? Replace `GEMINI_API_KEY` with `ORCHESTRATOR_MODEL=ollama/qwen2.5:1.5b` and `OLLAMA_HOST=http://localhost:11434`!)*

#### 2. The Secret Sauce: Add this Prompt to your `.cursorrules` or `CLAUDE.md`
To get true autonomous persistent intelligence, paste this instruction into your AI's rules:

> ```markdown
> # Persistent Memory Protocol
> You have access to the `sqlite-memory` MCP server. Follow this operating cycle:
> 
> 1. 🌅 Session Start: On your very first turn, call `get_current_state` silently to load your active working dashboard and tasks.
> 2. 🔎 Memory Recall: Before answering that you don't recall a technical decision or bug, run `search_memory("keywords")`.
> 3. 🔨 Milestone Learning: When you solve a bug or make an architectural decision, call `save_fact` with Causal Syntax:
>    `[TYPE: BUGFIX|ARCHITECTURE] [CAUSE: <symptom>] -> [DECISION: <fix>] -> [EFFECT: <impact>]`
> 4. 🌙 Session Wrap-up: When wrapping up or when the user says goodbye, call `consolidate` to synthesize the dashboard and prune resolved issues.
> ```

---

### 💻 Scenario 2: As a Direct Node.js / TypeScript Library

For developers building standalone agents, CLI tools, or Discord/WhatsApp bots:

```bash
npm install sqlite-local-ai-memory
```

```typescript
import { MemoryEngine } from "sqlite-local-ai-memory";

const memory = new MemoryEngine({
  dbPath: "./agent_memory.db",
  userId: "developer_1"
});

// 1. Cold-start: Load active working state in < 0.1 ms
const dashboard = memory.getDashboard("developer_1");

// 2. Just-in-Time RAG: Search hybrid memory in < 1.5 ms
const hits = await memory.search("PostgreSQL port configuration");

// 3. Save atomic causal facts (anti-collision arbiter built-in)
await memory.saveFact("[BUGFIX] [CAUSE: Port conflict] -> [DECISION: Moved to 5433] -> [EFFECT: Resolved]");

// 4. Maintenance: Run AutoDream cognitive consolidation at close
const result = await memory.consolidate("developer_1", "BACKEND_PROJECT");
```

---

## 🛠️ The 5 Simple Tools your AI Gets

Once connected via MCP, your AI assistant automatically gains these 5 commands:

| Command | What it does in plain words |
| :--- | :--- |
| **`save_fact`** | *"Remember that my PostgreSQL runs on port 5432."* Saves an important fact permanently with automatic deduplication. |
| **`search_memory`** | *"How do we deploy this project?"* Searches your memory vault using hybrid keyword + semantic search in < 2 ms. |
| **`get_current_state`** | *"What was I working on?"* Reads the active project blackboard. *(Note: Requires running `consolidate` at least once so the AI can synthesize the initial dashboard)*. |
| **`get_fact_lineage`** | *"How did this server IP change over time?"* Inspects the complete historical audit trail and past superseded versions of any fact. |
| **`consolidate`** | *"Organize my notes and catch up."* Reviews recent interactions, merges duplicates, archives resolved tasks, and builds the active `currentState` dashboard. |

---

> 🔬 **Need deep technical specs?**  
> For in-depth math on Int8 scalar quantization, Reciprocal Rank Fusion (RRF), benchmark telemetry, and database PRAGMAs, check out the full [Technical Architecture Reference (README_TECHNICAL.md)](README_TECHNICAL.md).

---

## 💬 Frequently Asked Questions (FAQ)

**Q: Where are my files stored?**  
A: In `~/.local-ai-memory/memoria.db` on your computer. You can back it up, copy it, or delete it anytime. It is a standard SQLite file.

**Q: Do I need Docker or complex database software?**  
A: No! Zero Docker containers, zero database servers. It runs directly inside Node.js.

**Q: Is it safe for my privacy?**  
A: Yes. Your database never leaves your machine.

---

## 📄 License

MIT License — Free and open source for everyone.
