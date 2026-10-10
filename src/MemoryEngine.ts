/**
 * ============================================================================
 * FILE: src/memory/MemoryEngine.ts
 * RESPONSIBILITY: Primary Exportable Facade Class (Library + MCP).
 * ============================================================================
 */
import * as fs from "fs";
import * as path from "path";
import os from "os";
import { type MemoryConfig, type MemoryHit, type AutoDreamResult, EMBEDDING_DIM } from "./types.js";
import { SqliteStore } from "./sqlite_store.js";
import { CognitiveAgents } from "./cognitive_agents.js";

/** A single conversation turn stored in the ephemeral ring buffer. */
interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

/** Maximum number of recent turns retained per user in RAM. */
const MAX_RING_BUFFER_TURNS = 10;
const defaultTelemetryPath = path.join(os.homedir(), ".local-ai-memory", "telemetry.jsonl");

/**
 * KeyedMutex: Guarantees deterministic serialization of asynchronous write operations
 * per user ID, eliminating Lost Updates and TOCTOU race conditions.
 */
class KeyedMutex {
  private queues = new Map<string, Promise<void>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    // FIX R3-1.1: store `tail` directly (not a derived .then() promise) so the
    // identity comparison below correctly detects whether we are the last waiter.
    const tail = new Promise<void>((resolve) => (release = resolve));
    this.queues.set(key, tail);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      // Only delete the entry if nobody else enqueued behind us.
      if (this.queues.get(key) === tail) this.queues.delete(key);
    }
  }
}

export class MemoryEngine {
  private store: SqliteStore;
  private agents: CognitiveAgents;
  private userId: string;
  private debug: boolean;
  private telemetry: boolean;
  private telemetryPath: string;
  private telemetryStream?: fs.WriteStream;
  private readonly MAX_TRACKED_USERS = 500;
  private writeMutex = new KeyedMutex();
  private backfillInFlight = new Set<string>();
  /** Ephemeral per-user ring buffer of recent conversation turns (RAM only, never persisted). */
  private turnBuffers = new Map<string, ConversationTurn[]>();

  constructor(config: MemoryConfig = {}) {
    this.userId = config.userId || "user_default";
    this.debug = config.debug !== undefined
      ? config.debug
      : (process.env.MEMORY_DEBUG === "true" || process.env.DEBUG === "true");
    this.telemetry = config.telemetry !== undefined
      ? config.telemetry
      : (process.env.MEMORY_TELEMETRY === "true" || process.env.TELEMETRY === "true");
    this.telemetryPath = config.telemetryPath || process.env.MEMORY_TELEMETRY_PATH || defaultTelemetryPath;
    this.store = new SqliteStore(config.dbPath);
    this.agents = new CognitiveAgents({ ...config, debug: this.debug }, this.store);
    if (this.telemetry) {
      try {
        const targetDir = path.dirname(this.telemetryPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        this.telemetryStream = fs.createWriteStream(this.telemetryPath, { flags: "a" });
        this.telemetryStream.on("error", (err) => {
          console.warn(`⚠️ [MEMORY:TELEMETRY] Stream error, disabling telemetry: ${err.message}`);
          this.telemetry = false;
          this.telemetryStream = undefined;
        });
      } catch (err: any) {
        if (this.debug) {
          console.warn(`⚠️ [MEMORY:TELEMETRY] Failed to initialize telemetry stream: ${err.message}`);
        }
      }
    }
  }

  /**
   * Appends an operational telemetry record to the JSONL log file asynchronously.
   * Fail-safe: Any file system or serialization error is logged and swallowed so it
   * NEVER interferes with the core user query flow.
   */
  private recordTelemetry(payload: Record<string, any>): void {
    if (!this.telemetry || !this.telemetryStream) return;
    try {
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        ...payload,
      }) + "\n";
      this.telemetryStream.write(entry);
    } catch (err: any) {
      if (this.debug) {
        console.warn(`⚠️ [MEMORY:TELEMETRY] Error writing telemetry record: ${err.message}`);
      }
    }
  }

  /**
   * Saves text or conversation input, automatically filtering noise with Gatekeeper
   * and extracting atomic facts using the Notary compiler.
   * 
   * @param text - Input text or conversational dialogue.
   * @param userId - Target user identifier (defaults to configured userId).
   * @param opts - Execution options including optional AbortSignal and subproject `source` tag.
   */
  public async save(
    text: string,
    userId: string = this.userId,
    opts?: { signal?: AbortSignal; source?: string }
  ): Promise<void> {
    return this.writeMutex.run(userId, async () => {
      await this.agents.saveMemory(text, userId, opts?.signal, opts?.source);
      if (this.telemetry) {
        this.recordTelemetry({
          event: "SAVE",
          userId,
          source: opts?.source || "system",
          input_text: text,
        });
      }
    });
  }

  /**
   * Saves a pre-formatted fact directly into memory without running through the Notary compiler.
   * Runs through the Semantic Arbiter to detect collisions or updates against existing state.
   * 
   * @param fact - Direct fact string (e.g. '[TECHNICAL] Database upgraded to v2').
   * @param userId - Target user identifier.
   * @param opts - Execution options including optional AbortSignal and subproject `source` tag.
   */
  public async saveFact(
    fact: string,
    userId: string = this.userId,
    opts?: { signal?: AbortSignal; source?: string }
  ): Promise<void> {
    return this.writeMutex.run(userId, async () => {
      await this.agents.injectUnifiedFact(fact, userId, [], opts?.signal, opts?.source);
      if (this.telemetry) {
        this.recordTelemetry({
          event: "SAVE_FACT",
          userId,
          source: opts?.source || "system",
          fact,
        });
      }
    });
  }

  /**
   * Dual Parallel Hybrid RAG Search (FTS5 BM25 + Int8 Scalar Quantized Cosine Similarity).
   * Automatically invokes QUERY_EXPANDER via Smart Gate when conversational context is present.
   */
  public async search(
    query: string,
    limit: number = 5,
    userId: string = this.userId,
    opts?: { signal?: AbortSignal; history?: string }
  ): Promise<MemoryHit[]> {
    const searchStartTime = Date.now();
    // --- SMART GATE: Activate QUERY_EXPANDER only when conversational context exists ---
    let effectiveQuery = query;
    const ringTurns = this.turnBuffers.get(userId) || [];
    const ringHistory = this.getFormattedHistory(userId);
    const externalHistory = opts?.history || "";
    const availableHistory = ringHistory || externalHistory;

    let expanderInvoked = false;
    let expanderLatencyMs = 0;
    let expanderError: string | null = null;

    if (availableHistory.length > 0) {
      expanderInvoked = true;
      const expanderStart = Date.now();
      try {
        effectiveQuery = await this.agents.contextualizeQuery(query, availableHistory);
      } catch (err: any) {
        expanderError = err.message || String(err);
        if (this.debug) {
          console.error(`⚠️ [MemoryEngine] contextualizeQuery failed, using raw query: ${err.message}`);
        }
        effectiveQuery = query;
      } finally {
        expanderLatencyMs = Date.now() - expanderStart;
      }
    }

    const ftsHits = this.store.searchFTS5(effectiveQuery, limit * 2, userId);
    let queryVec: number[] = [];

    try {
      queryVec = await this.agents.getEmbedding(effectiveQuery, opts?.signal);
    } catch (err: any) {
      if (err.name === "AbortError" || opts?.signal?.aborted) throw err;
      console.warn("⚠️ [MemoryEngine] Embedding generation failed, degrading gracefully to FTS5 exact search:", err.message);
    }

    let vecHits: MemoryHit[] = [];
    if (queryVec.length === EMBEDDING_DIM) {
      vecHits = this.store.searchVectorInt8(queryVec, limit * 2, userId);
      // FIX R2-2: pass `undefined` (not opts?.signal) so backfill survives
      // even if the MCP client cancels the originating search request.
      if (!this.backfillInFlight.has(userId)) {
        this.backfillInFlight.add(userId);
        this.store.backfillMissingVectors((txt) => this.agents.getEmbedding(txt, undefined), userId)
          .catch((err) => console.error("⚠️ [MemoryEngine] Lazy backfill failed in background:", err.message))
          .finally(() => this.backfillInFlight.delete(userId));
      }
    }

    const maxRankAbs = Math.max(...ftsHits.map((h) => Math.abs(h.rank ?? 0)), 1);
    const combinedMap = new Map<string, MemoryHit>();

    for (const h of ftsHits) {
      const normalizedFtsScore = h.rank != null ? Math.abs(h.rank) / maxRankAbs : 0.5;
      combinedMap.set(h.id, { ...h, score: normalizedFtsScore * 0.8 });
    }

    for (const h of vecHits) {
      if (combinedMap.has(h.id)) {
        const prev = combinedMap.get(h.id)!;
        combinedMap.set(h.id, {
          ...prev,
          score: Math.max(prev.score || 0, (h.score || 0) * 0.9) + 0.1,
        });
      } else {
        combinedMap.set(h.id, { ...h, score: (h.score || 0) * 0.9 });
      }
    }

    const unified = Array.from(combinedMap.values());
    unified.sort((a, b) => (b.score || 0) - (a.score || 0));
    const results = unified.slice(0, limit);

    // Deep Telemetry logging
    if (this.telemetry) {
      this.recordTelemetry({
        event: "SEARCH",
        userId,
        raw_query: query,
        effective_query: effectiveQuery,
        smart_gate: {
          expander_invoked: expanderInvoked,
          ring_turns_count: ringTurns.length,
          ring_history_snapshot: ringTurns.map(t => ({ role: t.role, text: t.text })),
          external_history_provided: Boolean(externalHistory),
        },
        expander: {
          latency_ms: expanderLatencyMs,
          error: expanderError,
          disambiguated: effectiveQuery !== query,
        },
        retrieval: {
          total_duration_ms: Date.now() - searchStartTime,
          raw_fts_matches: ftsHits.length,
          raw_vec_matches: vecHits.length,
          returned_hits: results.map(r => ({
            id: r.id,
            score: Number((r.score ?? 0).toFixed(3)),
            data: r.data.length > 120 ? `${r.data.slice(0, 120)}...` : r.data,
            source: r.source,
          })),
        },
      });
    }

    if (this.debug) {
      console.error(`\n🔍 [MEMORY:SEARCH]`);
      console.error(`├─ Query: "${query}" → Effective: "${effectiveQuery}" (User: ${userId})`);
      console.error(`├─ Raw Matches: FTS5 BM25 = ${ftsHits.length} | Vector Cosine = ${vecHits.length}`);
      console.error(`└─ Ranked Results (Top ${results.length}):`);
      if (results.length === 0) {
        console.error(`   (No matching memories found)`);
      } else {
        results.forEach((r, i) => {
          const scoreStr = (r.score ?? 0).toFixed(3);
          const snippet = r.data.length > 90 ? `${r.data.slice(0, 90)}...` : r.data;
          console.error(`   [${i + 1}] [Score: ${scoreStr}] ${snippet}`);
        });
      }
      console.error(`────────────────────────────────────────────────────\n`);
    }

    return results;
  }

  /**
   * Retrieves the current consolidated active working state summary (Dashboard).
   */
  public getDashboard(userId: string = this.userId): { data: string; memory?: string; updated_at: string } | null {
    const dash = this.store.getDashboardFact(userId);
    if (this.debug) {
      console.error(`\n📋 [MEMORY:DASHBOARD]`);
      console.error(`├─ User: ${userId}`);
      console.error(`├─ Updated: ${dash?.updated_at || "Never"}`);
      console.error(`└─ Content:\n${dash?.data || "(Empty dashboard)"}`);
      console.error(`────────────────────────────────────────────────────\n`);
    }
    return dash;
  }

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
  public async consolidate(
    userId: string = this.userId,
    source?: string,
    opts?: { signal?: AbortSignal }
  ): Promise<AutoDreamResult> {
    return this.writeMutex.run(userId, async () => {
      return await this.agents.runAutoDream(userId, source, opts?.signal);
    });
  }

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
  public addTurn(role: "user" | "assistant", text: string, userId: string = this.userId): void {
    let buffer = this.turnBuffers.get(userId);
    if (buffer) {
      this.turnBuffers.delete(userId);
    } else {
      if (this.turnBuffers.size >= this.MAX_TRACKED_USERS) {
        const oldestKey = this.turnBuffers.keys().next().value;
        if (oldestKey !== undefined) this.turnBuffers.delete(oldestKey);
      }
      buffer = [];
    }
    buffer.push({ role, text });
    if (buffer.length > MAX_RING_BUFFER_TURNS) {
      buffer.splice(0, buffer.length - MAX_RING_BUFFER_TURNS);
    }
    this.turnBuffers.set(userId, buffer);
  }

  /**
   * Returns the last N turns formatted as "U: ...\nA: ..." for the QUERY_EXPANDER.
   * Returns empty string if no turns are available.
   */
  private getFormattedHistory(userId: string, maxTurns: number = 5): string {
    const buffer = this.turnBuffers.get(userId);
    if (!buffer || buffer.length === 0) return "";
    const recent = buffer.slice(-maxTurns);
    return recent
      .map((t) => `${t.role === "user" ? "U" : "A"}: ${t.text}`)
      .join("\n");
  }

  /**
   * @deprecated Use addTurn() + search() instead. The smart gate inside search()
   * now calls contextualizeQuery automatically when turns are available.
   */
  public async contextualizeQuery(query: string, shortHistory: string): Promise<string> {
    return await this.agents.contextualizeQuery(query, shortHistory);
  }

  /**
   * Gracefully closes the SQLite database connection.
   */
  public close(): void {
    this.store.close();
    if (this.telemetryStream) {
      this.telemetryStream.end();
    }
  }
}
