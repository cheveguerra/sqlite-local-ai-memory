/**
 * ============================================================================
 * FILE: src/memory/types.ts
 * RESPONSIBILITY: Decoupled TypeScript Interfaces and Types for MemoryEngine.
 * ============================================================================
 */

export const CONFIG_USER = {
  NAME: "User",
  ID: "user_default",
};

export interface ExecutionOptions {
  signal?: AbortSignal;
}

export interface CustomPrompts {
  /** Override system prompt for the Gatekeeper (Noise Firewall Agent) */
  porteroSystem?: string;
  gatekeeperSystem?: string;

  /** Override system prompt for the Query Expander (Bibliotecario Agent) */
  bibliotecarioSystem?: string;
  queryExpanderSystem?: string;

  /** Override system prompt for the Atomic Fact Compiler (Notary Agent) */
  notarioSystem?: string;
  notarySystem?: string;

  /** Override system prompt for the Semantic Arbiter (Collision Auditor Agent) */
  arbitroSystem?: string;
  semanticArbiterSystem?: string;

  /** Override system prompt for the State Orchestrator (AutoDream Compiler Agent) */
  historiadorSystem?: string;
  stateOrchestratorSystem?: string;
}

export interface MemoryConfig {
  /** Path to local SQLite database file (default: './memoria.db') */
  dbPath?: string;
  /** Primary user display name for contextualization (default: 'User') */
  userName?: string;
  /** Primary user ID in database (default: 'user_default') */
  userId?: string;
  /** Base URL for local Ollama service (default: 'http://localhost:11434') */
  ollamaUrl?: string;
  /** Optional Google Gemini API Key for Cloud AI agents and embeddings */
  geminiApiKey?: string;
  /** Optional OpenRouter API Key for fallback LLM routing */
  openRouterApiKey?: string;
  /** Enable or disable real-time Semantic Arbiter anti-collision auditing (default: true) */
  semanticArbitrator?: boolean;
  /** Time-to-live in hours for active Dashboard working state items (default: 12) */
  dashboardTTLHours?: number;
  /** Optional custom system prompt overrides for fine-tuning cognitive agent behavior */
  customPrompts?: CustomPrompts;
}

export interface MemoryHit {
  id: string;
  user_id: string;
  data: string;
  source: string;
  created_at: string;
  updated_at?: string;
  score?: number;
  rank?: number;
  memory?: string;
}

export interface AtomicFact {
  dato: string;
  cat: string;
}

export interface DashboardItem {
  id: string;
  ts: number;
  txt: string;
}

export type AgentSchemaKey = "notary" | "orchestrator" | "arbiter" | "none";

export interface AgentModelConfig {
  desc: string;
  schemaKey?: AgentSchemaKey;
  proveedor: "ollama" | "gemini" | "openrouter";
  modelo: string;
  endpoint?: string | null;
  opciones?: Array<{
    proveedor: "ollama" | "gemini" | "openrouter";
    modelo: string;
    endpoint?: string;
    timeout?: number;
  }>;
}
