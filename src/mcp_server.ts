#!/usr/bin/env node
/**
 * ============================================================================
 * FILE: src/memory/mcp_server.ts
 * RESPONSIBILITY: Modern Model Context Protocol (MCP) High-Level Server over Stdio.
 * EXPOSES: save_fact, search_memory, get_current_state, and consolidate (AutoDream).
 * INCLUDES: Graceful Shutdown (SIGINT/SIGTERM) and Stdio stream protection.
 * ============================================================================
 */
import os from "os";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MemoryEngine } from "./MemoryEngine.js";

const defaultDbPath = path.join(os.homedir(), ".local-ai-memory", "memoria.db");
const isDebug = process.argv.includes("--debug") || process.env.MEMORY_DEBUG === "true" || process.env.DEBUG === "true";

const memory = new MemoryEngine({
  dbPath: process.env.SQLITE_MEM_PATH || defaultDbPath,
  userName: process.env.MEMORY_USER_NAME || "User",
  userId: process.env.MEMORY_USER_ID || "user_default",
  debug: isDebug,
});

const server = new McpServer({
  name: "sqlite-local-ai-memory",
  version: "1.5.0",
});

function safeErrorMessage(error: any, fallbackContext: string): string {
  if (!error) return `Error during ${fallbackContext}.`;
  let msg = typeof error.message === "string" ? error.message : String(error);
  // FIX R3-1.7: redact all known API key formats to prevent credential leakage.
  msg = msg.replace(/AIzaSy[A-Za-z0-9_-]{33}/g, "AIzaSy***");        // Gemini
  msg = msg.replace(/\bsk-or-[A-Za-z0-9_-]+/g, "sk-or-***");          // OpenRouter
  msg = msg.replace(/\bsk-[A-Za-z0-9_-]{20,}/g, "sk-***");            // OpenAI
  msg = msg.replace(/Bearer\s+[A-Za-z0-9_.\-]+/gi, "Bearer ***");      // Generic Bearer
  const firstLine = msg.split("\n")[0].trim();
  return firstLine || `Error during ${fallbackContext}.`;
}

// FIX R3-1.4: source must be alphanumeric + underscore/dash only (max 64 chars).
// Prevents bracket injection that could corrupt the tag-parsing regex in runAutoDream.
const SOURCE_TAG = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "source must be alphanumeric (A-Z, 0-9, _ or -), max 64 characters.")
  .optional();

// Tool 1: save_fact
server.tool(
  "save_fact",
  "Persists an atomic fact, preference, or technical rule into long-term memory with automatic semantic deduplication and vector indexing (append-only write). Use for immediate logging; for search use 'search_memory', for evolution audits use 'get_fact_lineage', and for batch synthesis use 'consolidate'. Returns the assigned fact UUID and status.",
  {
    fact: z.string().min(3, "Fact is too short to save.").max(2000).describe("The concise fact, technical decision, architecture rule, or user preference to store (e.g. 'PostgreSQL runs on port 5432 with peer authentication'). Must be self-contained and clear without pronouns."),
    userId: z.string().optional().describe("User or agent namespace to scope the memory. Defaults to 'user_default' when omitted."),
    source: SOURCE_TAG.describe("Project or subsystem tag (e.g. 'HOMELAB', 'AUDIOBOOK', 'TOTALCONNECT'). Alphanumeric and underscores only. Used to partition and filter project memories."),
  },
  async ({ fact, userId, source }, { signal }) => {
    try {
      if (signal?.aborted) {
        throw new Error("Request aborted by MCP client");
      }
      const res = await memory.saveFact(fact, userId, { signal, source });
      const warningText = res?.degraded
        ? `\n\n⚠️ WARNING: No active LLM/Embedding provider configured or reachable (Ollama at http://localhost:11434 or GEMINI_API_KEY). Fact saved in RAW text mode and indexed in SQLite FTS5 BM25. Semantic precision is severely degraded until an embedding model is configured.`
        : "";
      return {
        content: [
          {
            type: "text",
            text: `✅ Fact successfully saved to memory: "${fact}"${warningText}`,
          },
        ],
      };
    } catch (error: any) {
      if (error.name === "AbortError" || signal?.aborted) {
        return {
          content: [{ type: "text", text: "⏹️ Operation aborted by MCP client." }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `❌ Error saving fact: ${safeErrorMessage(error, "save_fact")}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 2: search_memory
server.tool(
  "search_memory",
  "Searches long-term memory using hybrid FTS5 BM25 lexical and vector cosine similarity with RRF ranking (read-only). Supports Point-in-Time queries via 'as_of'. Use for factual lookup and technical recall. For active high-level board use 'get_current_state'; for fact revisions use 'get_fact_lineage'. Returns ranked list of scored memory items.",
  {
    query: z.string().min(1, "Search query cannot be empty.").describe("Search keywords, error messages, concepts, or questions (e.g. 'Proxmox vzdump backup schedule', 'auth token expiration'). Avoid conversational filler."),
    limit: z.number().int().min(1).max(20).optional().default(5).describe("Maximum number of ranked results to return (1-20). Defaults to 5 when omitted."),
    userId: z.string().optional().describe("User or agent namespace to search within. Defaults to 'user_default' when omitted."),
    history: z.string().max(4000).optional().describe("Recent conversation dialogue (e.g. 'User: ... \nAssistant: ...'). When provided, the internal Query Expander resolves ambiguous pronouns and conversational context into explicit search terms."),
    as_of: z.string().optional().describe("ISO 8601 timestamp (e.g. '2026-10-15T12:00:00Z') or date ('2026-10-15') for Point-in-Time retrospective queries. Returns only facts that were active and not yet superseded at that specific moment."),
  },
  async ({ query, limit, userId, history, as_of }, { signal }) => {
    try {
      if (signal?.aborted) {
        throw new Error("Request aborted by MCP client");
      }
      const hits = await memory.search(query, limit, userId, { signal, history, asOf: as_of });

      if (hits.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No relevant memories found for: "${query}"${as_of ? ` (as of ${as_of})` : ""}`,
            },
          ],
        };
      }

      const formatted = hits
        .map((h, i) => {
          const temporal = h.valid_to ? ` [Superado el ${h.valid_to}]` : "";
          return `[${i + 1}] (Score: ${(h.score ?? 0).toFixed(2)})${temporal} ${h.data}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `🔎 Relevant memories found for "${query}"${as_of ? ` (as of ${as_of})` : ""}:\n\n${formatted}`,
          },
        ],
      };
    } catch (error: any) {
      if (error.name === "AbortError" || signal?.aborted) {
        return {
          content: [{ type: "text", text: "⏹️ Operation aborted by MCP client." }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `❌ Error searching memory: ${safeErrorMessage(error, "search_memory")}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 3: get_fact_lineage (Point-in-Time evolutionary history)
// ---------------------------------------------------------------------------
server.tool(
  "get_fact_lineage",
  "Traces the full evolutionary history and supersede chain of a fact by its UUID (read-only). Use when auditing how or why a rule changed, or resolving conflicting facts. Obtain the UUID via 'search_memory'. Returns chronological revisions and rationale.",
  {
    point_id: z.string().describe("The exact UUID of the memory fact to trace (e.g. 'cc0675f1-4274-4854-9eac-4e85beadea05'). Obtainable from 'search_memory' results."),
  },
  async ({ point_id }, { signal }) => {
    try {
      if (signal?.aborted) {
        throw new Error("Request aborted by MCP client");
      }
      const lineage = memory.getFactLineage(point_id);
      if (lineage.length === 0) {
        return {
          content: [{ type: "text", text: `Fact ${point_id} not found.` }],
        };
      }
      const formatted = lineage
        .map((node, i) => {
          const status = node.valid_to ? `[SUPERSEDED on ${node.valid_to}]` : "[ACTIVE / CURRENT]";
          const reason = node.supersede_reason ? ` (Reason: ${node.supersede_reason})` : "";
          return `Step ${i + 1}: ${status}${reason}\n  ID: ${node.id}\n  Fact: "${node.data}"\n  Valid: ${node.valid_from || node.created_at} -> ${node.valid_to || "present"}`;
        })
        .join("\n\n");

      return {
        content: [{ type: "text", text: `📜 Fact Lineage for ${point_id}:\n\n${formatted}` }],
      };
    } catch (error: any) {
      if (error.name === "AbortError" || signal?.aborted) {
        return {
          content: [{ type: "text", text: "⏹️ Operation aborted by MCP client." }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `❌ Error tracing fact lineage: ${safeErrorMessage(error, "get_fact_lineage")}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 4: get_current_state
server.tool(
  "get_current_state",
  "Retrieves the active executive working dashboard, active project focus, and recent milestones (read-only). Use during session bootstrap or task switching for high-level orientation. Do NOT use for granular fact searches (use 'search_memory'). Returns formatted markdown dashboard.",
  {
    userId: z.string().optional().describe("User or agent namespace whose active dashboard to read. Defaults to 'user_default' when omitted."),
  },
  async ({ userId }, { signal }) => {
    try {
      if (signal?.aborted) {
        throw new Error("Request aborted by MCP client");
      }
      const dash = memory.getDashboard(userId);
      return {
        content: [
          {
            type: "text",
            text: dash
              ? `📋 Active Working Dashboard (Updated: ${dash.updated_at}):\n\n${dash.data}`
              : "📋 Working dashboard is empty.",
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error reading active working state: ${safeErrorMessage(error, "get_current_state")}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool 5: consolidate (AutoDream)
server.tool(
  "consolidate",
  "Executes cognitive memory maintenance (AutoDream): synthesizes progress, archives obsolete notes, and updates the project dashboard (batch write). Call only at session close or after major milestones, NOT on every turn. Preserves other projects' cards. Returns triage summary report.",
  {
    userId: z.string().optional().describe("User or agent namespace to consolidate. Defaults to 'user_default' when omitted."),
    source: SOURCE_TAG.describe("Project or subsystem tag to consolidate (e.g. 'HOMELAB', 'AUDIOBOOK', 'TOTALCONNECT'). Preserves items belonging to other project tags in the dashboard. Alphanumeric and underscores only."),
  },
  async ({ userId, source }, { signal }) => {
    try {
      if (signal?.aborted) {
        throw new Error("Request aborted by MCP client");
      }
      const result = await memory.consolidate(userId, source, { signal });

      const triageSection = result.triageMemory && result.triageMemory.length > 0
        ? `\n\n📦 Injected Triage Cards (${result.triageMemory.length}):\n` +
          result.triageMemory.map((t, i) => `[Card ${i + 1} - ${t.type}]\n${t.fact}`).join("\n\n")
        : "";

      const fallbackWarning = result.narrativeSummary.includes("[FALLBACK")
        ? `⚠️ WARNING: AutoDream operated in FALLBACK MODE (no LLM configured or reachable). This mode is rudimentary: it only appends recent facts with basic FIFO bounding. Semantic deduplication, cause-root triage, and narrative synthesis are unavailable without an active LLM.\n\n`
        : "";

      return {
        content: [
          {
            type: "text",
            text: `${fallbackWarning}🌙 AutoDream State Consolidation Complete:\n\n` +
              `• Executive Summary:\n"${result.narrativeSummary}"\n\n` +
              `• Active Dashboard Items: ${result.totalActive}\n` +
              `• Consolidated Facts Injected: ${result.triageMemory.length}\n` +
              `• Unresolved Incubator Cases: ${result.openCases.length}\n` +
              `• Status: ${result.statusMessage}` + triageSection,
          },
        ],
      };
    } catch (error: any) {
      if (error.name === "AbortError" || signal?.aborted) {
        return {
          content: [{ type: "text", text: "⏹️ Operation aborted by MCP client." }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `❌ Error during AutoDream consolidation: ${safeErrorMessage(error, "consolidate")}`,
          },
        ],
        isError: true,
      };
    }
  }
);

const SHUTDOWN_TIMEOUT_MS = 5000;
let isShuttingDown = false;

// FIX R3-1.5: Accept exitCode so supervisors (systemd, pm2, Docker) can distinguish
// clean shutdowns (0) from crashes (1). Escalate if an error occurs during shutdown itself.
async function gracefulShutdown(signal: string, exitCode: number = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.error(`\n🛑 [MCP_SERVER] Received ${signal} signal. Gracefully closing server and database...`);

  const forceExitTimer = setTimeout(() => {
    console.error("⚠️ [MCP_SERVER] Forced exit: shutdown timeout exceeded (5s).");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
    await server.close();
    memory.close();
  } catch (err: any) {
    console.error("⚠️ [MCP_SERVER] Error during shutdown:", err.message);
    exitCode = exitCode === 0 ? 1 : exitCode; // escalate clean->error, keep crash code
  } finally {
    clearTimeout(forceExitTimer);
    process.exit(exitCode);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT", 0));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM", 0));

process.on("uncaughtException", (err) => {
  console.error("💥 [MCP_SERVER] uncaughtException:", err);
  gracefulShutdown("uncaughtException", 1); // exit 1 so supervisors know this was a crash
});

process.on("unhandledRejection", (reason) => {
  console.error("💥 [MCP_SERVER] unhandledRejection:", reason);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 sqlite-local-ai-memory MCP server running on stdio.");
}

main().catch((err) => {
  console.error("❌ [MCP_SERVER] Fatal error starting server:", err);
  process.exit(1);
});
