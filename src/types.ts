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

/** Standard vector dimensionality for the hybrid retrieval engine */
export const EMBEDDING_DIM = 768;

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
  /** Enable detailed multi-stage console debugging logs (default: false, env: MEMORY_DEBUG) */
  debug?: boolean;
  /** Default source tag for facts inserted during this session (e.g. 'TOTALCONNECT', 'SQLITE_MEMORY') */
  defaultSource?: string;
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
  fact: string;
  category: string;
}

/**
 * Represents a single active state item in the unified global dashboard.
 */
export interface DashboardItem {
  /** Unique UUID identifying this working state item */
  id: string;
  /** Unix epoch timestamp (ms) when this item was recorded or updated */
  ts: number;
  /** Content text, prefixed by [PROJECT_TAG] or [INCUBATOR/OPEN_CASE:PROJECT_TAG] */
  txt: string;
  /** Subproject or client origin (e.g. 'TOTALCONNECT', 'SQLITE_MEMORY') for cross-topic preservation */
  source?: string;
}

export interface TriageItem {
  type: "TECHNICAL" | "PERSONAL" | "MILESTONES";
  fact: string;
}

/**
 * Represents an unresolved technical incident or investigation in the Incubator.
 */
export interface OpenCaseItem {
  /** Unique UUID identifying this open investigation case */
  id: string;
  /** Incident description with technical symptoms, error codes, and impacted paths */
  incident: string;
  /** Originating project or client source */
  source?: string;
  /** ISO timestamp when the case was first registered */
  created_at?: string;
}

export interface AutoDreamResult {
  narrativeSummary: string;
  dashboard: DashboardItem[];
  triageMemory: TriageItem[];
  openCases: OpenCaseItem[];
  totalActive: number;
  statusMessage: string;
}

export type AgentSchemaKey = "notary" | "orchestrator" | "arbiter" | "none";

export type ModelProvider = "ollama" | "gemini" | "openrouter" | "openai";

export interface AgentModelConfig {
  desc: string;
  schemaKey?: AgentSchemaKey;
  provider: ModelProvider;
  model: string;
  endpoint?: string | null;
  options?: Array<{
    provider: ModelProvider;
    model: string;
    endpoint?: string;
    timeout?: number;
  }>;
}
