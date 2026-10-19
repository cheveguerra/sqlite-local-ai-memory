import { type MemoryConfig, type AgentModelConfig, type AutoDreamResult, type ModelProvider } from "./types.js";
import { SqliteStore } from "./sqlite_store.js";
export interface ParsedModelTarget {
    provider: ModelProvider;
    model: string;
}
export declare function parseModelTarget(raw?: string, defaultProvider?: ModelProvider, defaultModel?: string): ParsedModelTarget | null;
export declare function extractJsonPayload(text: string): string;
export interface DeterministicAnchorResult {
    paths: string[];
    ipsAndEndpoints: string[];
    nodesAndEnvironments: string[];
    dates: string[];
    formattedText: string;
}
/**
 * Extracts hard, deterministic entities (filesystem paths, IPv4/IPv6 addresses,
 * network ports, URLs, cluster nodes/containers, and timestamps) from raw working facts
 * to guarantee zero compression loss during AutoDream state consolidation.
 */
export declare function extractDeterministicAnchor(sources: string[]): DeterministicAnchorResult;
export declare class CognitiveAgents {
    private config;
    private store;
    private genAI;
    constructor(config: MemoryConfig, store: SqliteStore);
    private sanitizeTag;
    private stripLeadingTag;
    private normalizeTriageFact;
    private getGenAIClient;
    private getOllamaApiUrl;
    getAgentsMatrix(): {
        GATEKEEPER: AgentModelConfig;
        QUERY_EXPANDER: AgentModelConfig;
        NOTARY: AgentModelConfig;
        STATE_ORCHESTRATOR: AgentModelConfig;
        SEMANTIC_ARBITER: AgentModelConfig;
        EMBEDDER: AgentModelConfig;
    };
    getEmbedding(text: string, signal?: AbortSignal): Promise<number[]>;
    executeAgent(agentConfig: AgentModelConfig, systemPrompt: string, userPrompt: string, isJson?: boolean, signal?: AbortSignal): Promise<string>;
    private getResponseSchema;
    contextualizeQuery(originalQuery: string, shortHistory: string): Promise<string>;
    /**
     * Directly ingests a unified memory fact into SQLite (FTS5 + Int8 Vector).
     * Automatically performs consistency auditing via Semantic Arbiter if enabled,
     * deactivating superseded facts and tagging the record with its origin source.
     *
     * @param fact - Complete fact string to ingest.
     * @param userId - Target user identifier.
     * @param protectedIds - Array of newly generated UUIDs that should not be superseded in the same batch.
     * @param signal - Optional AbortSignal.
     * @param source - Project or origin identifier (e.g. 'TOTALCONNECT', 'system').
     */
    injectUnifiedFact(fact: string, userId?: string, protectedIds?: string[], signal?: AbortSignal, source?: string, skipArbiter?: boolean): Promise<{
        degraded: boolean;
    }>;
    /**
     * Processes raw text or conversational turns through the cognitive pipeline:
     * Layer 1: Regex chatter filtering.
     * Layer 2: Gatekeeper noise classifier.
     * Layer 3: Notary atomic fact compilation.
     * Layer 4: Semantic Arbiter collision auditing and SQLite persistence with source tagging.
     *
     * @param text - Raw message or conversational turn.
     * @param userId - Target user identifier.
     * @param signal - Optional AbortSignal.
     * @param source - Subproject or client origin label.
     */
    saveMemory(text: string, userId?: string, signal?: AbortSignal, source?: string): Promise<void>;
    /**
     * Orchestrates the AutoDream consolidation cycle:
     * 1. Applies deterministic TTL pruning on working notes.
     * 2. Auto-archives expired unresolved incubator cases into long-term memory.
     * 3. Executes the State Orchestrator agent to generate executive narrative and triage cards.
     * 4. Enforces the Deterministic Cross-Topic Preservation Guardrail: items from other
     *    projects are guaranteed never to be dropped or overwritten.
     * 5. Saves the updated unified dashboard singleton in SQLite under DASHBOARD_UUID.
     *
     * @param userId - Target user identifier.
     * @param currentSource - Subproject or client source triggering consolidation (e.g. 'TOTALCONNECT').
     * @returns AutoDreamResult with executive summary, active dashboard items, and triage cards.
     */
    runAutoDream(userId?: string, currentSource?: string, signal?: AbortSignal): Promise<AutoDreamResult>;
}
//# sourceMappingURL=cognitive_agents.d.ts.map