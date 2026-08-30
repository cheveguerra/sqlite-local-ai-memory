# 🧠 sqlite-local-ai-memory

> **100% In-Process Bare-Metal Hybrid Memory Engine & MCP Server for LLMs (SQLite WAL + FTS5 + Int8 Quantized Vectors).**

`sqlite-local-ai-memory` is a zero-latency, local-first memory solution designed for autonomous AI agents, WhatsApp/Telegram bots, and local LLM assistants. It functions as both a standalone **MCP (Model Context Protocol) Server** and an **in-process TypeScript library**.

---

## ⚡ Highlights

* **🚀 Zero External Heavy Services:** Operates 100% in-process with SQLite (WAL mode + 256MB mmap). Zero Docker containers required.
* **🔍 Hybrid RAG Pipeline:** Multi-stage rank fusion combining SQLite FTS5 BM25 keyword search and cosine similarity over Int8 quantized vectors.
* **🔌 Native MCP Server (Stdio):** Plug-and-play integration with Claude Desktop, Cursor, VSCode Cline, and Roo Code via Model Context Protocol.
* **🛡️ Smart Fast-Path Noise Firewall:** Filters conversational chatter (`"ok"`, `"thanks"`, `"hola"`) in 0ms without consuming LLM API tokens.
* **🧠 Multi-Provider AI Fallback:** Autonomous failover between local Ollama (`qwen2.5-coder`, `nomic-embed-text`) and Cloud AI (`gemini-2.5-flash-lite`, `gemini-embedding-001`).
* **⚖️ Semantic Collision Auditor:** Detects state conflicts (e.g., updated user locations or status) and applies soft-deletes to obsolete facts automatically.

---

## 📦 Installation

```bash
npm install sqlite-local-ai-memory
```

---

## 🛠️ Usage as MCP Server

Add to your MCP Client configuration (e.g., `claude_desktop_config.json` or `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "local-ai-memory": {
      "command": "npx",
      "args": ["-y", "sqlite-local-ai-memory"],
      "env": {
        "GEMINI_API_KEY": "YOUR_GEMINI_API_KEY",
        "OLLAMA_URL": "http://localhost:11434"
      }
    }
  }
}
```

### Exposed MCP Tools

1. **`save_fact`**: Analyzes, filters, and stores atomic knowledge into memory.
2. **`search_memory`**: Performs hybrid search across past memories.
3. **`get_current_state`**: Retrieves the active, consolidated state dashboard.

---

## 💻 Programmatic TypeScript Library Usage

```typescript
import { MemoryEngine } from "sqlite-local-ai-memory";

const memory = new MemoryEngine({
  dbPath: "./memoria.db",
  userName: "Alice",
  ollamaUrl: "http://localhost:11434",
  geminiApiKey: process.env.GEMINI_API_KEY,
});

// 1. Ingest Fact
await memory.save("User prefers dark mode in code editors.");

// 2. Hybrid RAG Search
const results = await memory.search("editor preferences", 3);
console.log(results);

// 3. Close Store
memory.close();
```

---

## 📄 License

[MIT License](LICENSE)
