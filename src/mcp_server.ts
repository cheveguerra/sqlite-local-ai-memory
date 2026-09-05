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
  version: "1.3.2",
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
  "Stores a new fact, preference, or technical knowledge directly in memory.",
  {
    fact: z.string().min(3, "Fact is too short to save.").max(2000).describe("The fact or information to save."),
    source: SOURCE_TAG.describe("Source or project tag, e.g. 'TOTALCONNECT', 'SQLITE_MEMORY' (optional, alphanumeric only)."),
  },
  async ({ fact, source }, { signal }) => {
    try {
      if (signal?.aborted) {
        throw new Error("Request aborted by MCP client");
      }
      await memory.saveFact(fact, undefined, { signal, source });
      return {
        content: [
          {
            type: "text",
            text: `✅ Fact successfully saved to memory: "${fact}"`,
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
  "Searches long-term memory for relevant facts or historical context using hybrid FTS5 BM25 + Int8 Vector search.",
  {
    query: z.string().min(1, "Search query cannot be empty.").describe("Search terms or topic to recall."),
    limit: z.number().int().min(1).max(20).optional().default(5).describe("Maximum number of results to return (default: 5, max: 20)."),
  },
  async ({ query, limit }, { signal }) => {
    try {
      if (signal?.aborted) {
        throw new Error("Request aborted by MCP client");
      }
      const hits = await memory.search(query, limit, undefined, { signal });

      if (hits.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No relevant memories found for: "${query}"`,
            },
          ],
        };
      }

      const formatted = hits
        .map((h, i) => `[${i + 1}] (Score: ${(h.score ?? 0).toFixed(2)}) ${h.data}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `🔎 Relevant memories found for "${query}":\n\n${formatted}`,
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

// Tool 3: get_current_state
server.tool(
  "get_current_state",
  "Retrieves the active, current working state summary (Dashboard).",
  {},
  async (_, { signal }) => {
    try {
      if (signal?.aborted) {
        throw new Error("Request aborted by MCP client");
      }
      const dash = memory.getDashboard();
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

// Tool 4: consolidate (AutoDream)
server.tool(
  "consolidate",
  "Runs background memory maintenance (AutoDream): summarizes recent progress, cleans up outdated notes, saves key technical takeaways, and updates the active project board.",
  {
    userId: z.string().optional().describe("User ID to consolidate (optional, default: user_default)."),
    source: SOURCE_TAG.describe("Current project or source being consolidated (e.g. 'TOTALCONNECT'). Preserves items from other projects in dashboard. Alphanumeric only."),
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

      return {
        content: [
          {
            type: "text",
            text: `🌙 AutoDream State Consolidation Complete:\n\n` +
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
