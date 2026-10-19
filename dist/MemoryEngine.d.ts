import { type MemoryConfig, type MemoryHit, type FactLineageNode, type AutoDreamResult } from "./types.js";
export declare class MemoryEngine {
    private store;
    private agents;
    private userId;
    private debug;
    private telemetry;
    private telemetryPath;
    private telemetryStream?;
    private readonly MAX_TRACKED_USERS;
    private writeMutex;
    private backfillInFlight;
    /** Ephemeral per-user ring buffer of recent conversation turns (RAM only, never persisted). */
    private turnBuffers;
    constructor(config?: MemoryConfig);
    /**
     * Appends an operational telemetry record to the JSONL log file asynchronously.
     * Fail-safe: Any file system or serialization error is logged and swallowed so it
     * NEVER interferes with the core user query flow.
     */
    private recordTelemetry;
    /**
     * Saves text or conversation input, automatically filtering noise with Gatekeeper
     * and extracting atomic facts using the Notary compiler.
     *
     * @param text - Input text or conversational dialogue.
     * @param userId - Target user identifier (defaults to configured userId).
     * @param opts - Execution options including optional AbortSignal and subproject `source` tag.
     */
    save(text: string, userId?: string, opts?: {
        signal?: AbortSignal;
        source?: string;
    }): Promise<void>;
    /**
     * Saves a pre-formatted fact directly into memory without running through the Notary compiler.
     * Runs through the Semantic Arbiter to detect collisions or updates against existing state.
     *
     * @param fact - Direct fact string (e.g. '[TECHNICAL] Database upgraded to v2').
     * @param userId - Target user identifier.
     * @param opts - Execution options including optional AbortSignal and subproject `source` tag.
     */
    saveFact(fact: string, userId?: string, opts?: {
        signal?: AbortSignal;
        source?: string;
    }): Promise<{
        degraded: boolean;
    }>;
    /**
     * Dual Parallel Hybrid RAG Search (FTS5 BM25 + Int8 Scalar Quantized Cosine Similarity).
     * Automatically invokes QUERY_EXPANDER via Smart Gate when conversational context is present.
     */
    search(query: string, limit?: number, userId?: string, opts?: {
        signal?: AbortSignal;
        history?: string;
        asOf?: string;
    }): Promise<MemoryHit[]>;
    /**
     * Retrieves the current consolidated active working state summary (Dashboard).
     */
    getDashboard(userId?: string): {
        data: string;
        memory?: string;
        updated_at: string;
    } | null;
    /**
     * Executes the AutoDream cognitive pruning and state consolidation cycle.
     * Analyzes recent facts, prunes TTL-expired working notes, graduates resolved
     * incubator cases into long-term memory, and produces a unified executive narrative.
     *
     * @param userId - Target user identifier.
     * @param source - Optional subproject or source being consolidated (e.g. 'TOTALCONNECT').
     *                 When provided, guarantees deterministic cross-topic preservation of other projects.
     * @returns AutoDreamResult containing executive narrative, active dashboard, and triage facts.
     */
    consolidate(userId?: string, source?: string, opts?: {
        signal?: AbortSignal;
    }): Promise<AutoDreamResult>;
    /**
     * Registers a conversation turn in the ephemeral ring buffer.
     * This provides the QUERY_EXPANDER with recent conversational context
     * to resolve ambiguous queries (pronouns, references, ellipsis).
     * Turns are stored in RAM only and never written to SQLite.
     *
     * @param role - "user" or "assistant"
     * @param text - The message content
     * @param userId - Target user identifier (defaults to configured userId)
     */
    addTurn(role: "user" | "assistant", text: string, userId?: string): void;
    /**
     * Returns the last N turns formatted as "U: ...\nA: ..." for the QUERY_EXPANDER.
     * Returns empty string if no turns are available.
     */
    private getFormattedHistory;
    /**
     * @deprecated Use addTurn() + search() instead. The smart gate inside search()
     * now calls contextualizeQuery automatically when turns are available.
     */
    contextualizeQuery(query: string, shortHistory: string): Promise<string>;
    /**
     * Retrieves the evolutionary Point-in-Time history and replacement lineage of a fact.
     */
    getFactLineage(pointId: string): FactLineageNode[];
    /**
     * Gracefully closes the SQLite database connection.
     */
    close(): void;
}
//# sourceMappingURL=MemoryEngine.d.ts.map