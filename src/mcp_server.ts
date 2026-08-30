#!/usr/bin/env node
/**
 * ============================================================================
 * FILE: src/memory/mcp_server.ts
 * RESPONSIBILITY: Modern Model Context Protocol (MCP) High-Level Server over Stdio.
 * EXPOSES: save_fact, search_memory, and get_current_state with Zod schema validation.
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

const memory = new MemoryEngine({
  dbPath: process.env.SQLITE_MEM_PATH || defaultDbPath,
  userName: process.env.MEMORY_USER_NAME || "User",
});

const server = new McpServer({
  name: "sqlite-local-ai-memory",
  version: "1.0.0",
});

// Tool 1: save_fact
server.tool(
  "save_fact",
  "Stores a new fact, preference, or long-term knowledge in memory.",
  {
    fact: z.string().min(3, "El hecho es demasiado corto para guardar.").max(2000).describe("The fact or information to save."),
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
            text: `✅ Hecho registrado exitosamente en memoria: "${fact}"`,
          },
        ],
      };
    } catch (error: any) {
      if (error.name === "AbortError" || signal?.aborted) {
        return {
          content: [{ type: "text", text: "⏹️ Operación cancelada por el cliente MCP." }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `❌ Error registrando hecho: ${error.message}`,
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
  "Searches long-term memory for relevant facts or historical context.",
  {
    query: z.string().min(1, "La consulta no puede estar vacía.").describe("Search terms or topic to recall."),
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
              text: `No se encontraron recuerdos relevantes para: "${query}"`,
            },
          ],
        };
      }

      const formatted = hits
        .map((h, i) => `[${i + 1}] (Score: ${h.score?.toFixed(2)}) ${h.data}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `🔎 Recuerdos encontrados para "${query}":\n\n${formatted}`,
          },
        ],
      };
    } catch (error: any) {
      if (error.name === "AbortError" || signal?.aborted) {
        return {
          content: [{ type: "text", text: "⏹️ Operación cancelada por el cliente MCP." }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `❌ Error buscando en memoria: ${error.message}`,
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
              ? `📋 Estado Actual del Pizarrón (Actualizado: ${dash.updated_at}):\n\n${dash.data}`
              : "📋 Pizarrón vacío.",
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error leyendo estado actual: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

const SHUTDOWN_TIMEOUT_MS = 5000;

async function gracefulShutdown(signal: string) {
  console.error(`\n🛑 [MCP_SERVER] Recibida señal ${signal}. Cerrando servidor y base de datos...`);

  const forceExitTimer = setTimeout(() => {
    console.error("⚠️ [MCP_SERVER] Cierre forzado: timeout de apagado excedido (5s).");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
    await server.close();
    memory.close();
  } catch (err: any) {
    console.error("⚠️ Error durante el apagado:", err.message);
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
  console.error("🚀 Servidor MCP sqlite-local-ai-memory iniciado en Stdio.");
}

main().catch((err) => {
  console.error("❌ Error fatal iniciando servidor MCP:", err);
  process.exit(1);
});
