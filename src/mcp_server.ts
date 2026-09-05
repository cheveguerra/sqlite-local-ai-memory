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
  version: "1.2.0",
});

// Tool 1: save_fact
server.tool(
  "save_fact",
  "Stores a new fact, preference, or technical knowledge directly in memory.",
  {
    fact: z.string().min(3, "Fact is too short to save.").max(2000).describe("The fact or information to save."),
  },
  async ({ fact }, { signal }) => {
    try {
      if (signal?.aborted) {
        throw new Error("Request aborted by MCP client");
      }
      await memory.saveFact(fact, undefined, { signal });
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
            text: `❌ Error saving fact: ${error.message}`,
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
            text: `❌ Error searching memory: ${error.message}`,
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
            text: `❌ Error reading active working state: ${error.message}`,
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
  },
  async ({ userId }, { signal }) => {
    try {
      if (signal?.aborted) {
        throw new Error("Request aborted by MCP client");
      }
      const result = await memory.consolidate(userId);

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
            text: `❌ Error during AutoDream consolidation: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

const SHUTDOWN_TIMEOUT_MS = 5000;

async function gracefulShutdown(signal: string) {
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
  } finally {
    clearTimeout(forceExitTimer);
    process.exit(0);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  console.error("💥 [MCP_SERVER] uncaughtException:", err);
  gracefulShutdown("uncaughtException");
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
