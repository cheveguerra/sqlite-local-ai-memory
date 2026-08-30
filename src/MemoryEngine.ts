/**
 * ============================================================================
 * FILE: src/memory/MemoryEngine.ts
 * RESPONSIBILITY: Primary Exportable Facade Class (Library + MCP).
 * ============================================================================
 */
import type { MemoryConfig, MemoryHit } from "./types.js";
import { SqliteStore } from "./sqlite_store.js";
import { CognitiveAgents } from "./cognitive_agents.js";

export class MemoryEngine {
  private store: SqliteStore;
  private agents: CognitiveAgents;
  private userId: string;

  constructor(config: MemoryConfig = {}) {
    this.userId = config.userId || "user_default";
    this.store = new SqliteStore(config.dbPath);
    this.agents = new CognitiveAgents(config, this.store);
  }

  /**
   * Saves text or conversation input, automatically extracting atomic facts.
   */
  public async save(text: string, userId: string = this.userId, opts?: { signal?: AbortSignal }): Promise<void> {
    await this.agents.guardarMemoria(text, userId, opts?.signal);
  }

  /**
   * Saves a pre-formatted fact directly without running through the Notary compiler.
   */
  public async saveFact(fact: string, userId: string = this.userId, opts?: { signal?: AbortSignal }): Promise<void> {
    await this.agents.inyectarHechoUnificado(fact, userId, [], opts?.signal);
  }

  /**
   * Dual Parallel Hybrid RAG Search (FTS5 BM25 + Int8 Scalar Quantized Cosine Similarity).
   */
  public async search(
    query: string,
    limit: number = 5,
    userId: string = this.userId,
    opts?: { signal?: AbortSignal }
  ): Promise<MemoryHit[]> {
    const ftsHits = this.store.searchFTS5(query, limit * 2, userId);
    let queryVec: number[] = [];

    try {
      queryVec = await this.agents.getEmbedding(query, opts?.signal);
    } catch (err: any) {
      if (err.name === "AbortError" || opts?.signal?.aborted) throw err;
      console.warn("⚠️ [MemoryEngine] Embedding generation failed, degrading gracefully to FTS5 exact search:", err.message);
    }

    let vecHits: MemoryHit[] = [];
    if (queryVec.length === 768) {
      vecHits = this.store.searchVectorInt8(queryVec, limit * 2, userId);
      // Trigger lazy backfill for facts that were saved without vectors
      this.store.backfillMissingVectors((txt) => this.agents.getEmbedding(txt, opts?.signal), userId)
        .catch((err) => console.error("⚠️ [MemoryEngine] Lazy backfill failed in background:", err.message));
    }

    const maxRankAbs = Math.max(...ftsHits.map((h) => Math.abs(h.rank ?? 0)), 1);
    const mapaCombinado = new Map<string, MemoryHit>();

    for (const h of ftsHits) {
      const normalizedFtsScore = h.rank != null ? Math.abs(h.rank) / maxRankAbs : 0.5;
      mapaCombinado.set(h.id, { ...h, score: normalizedFtsScore * 0.8 });
    }

    for (const h of vecHits) {
      if (mapaCombinado.has(h.id)) {
        const prev = mapaCombinado.get(h.id)!;
        mapaCombinado.set(h.id, {
          ...prev,
          score: Math.max(prev.score || 0, (h.score || 0) * 0.9) + 0.1,
        });
      } else {
        mapaCombinado.set(h.id, { ...h, score: (h.score || 0) * 0.9 });
      }
    }

    const unificados = Array.from(mapaCombinado.values());
    unificados.sort((a, b) => (b.score || 0) - (a.score || 0));

    return unificados.slice(0, limit);
  }

  /**
   * Retrieves the current consolidated active working state summary (Dashboard).
   */
  public getDashboard(userId: string = this.userId): { data: string; updated_at: string } | null {
    return this.store.getDashboardFact(userId);
  }

  /**
   * Executes the AutoDream cognitive pruning and state consolidation cycle.
   */
  public async consolidate(userId: string = this.userId): Promise<string> {
    return await this.agents.runAutoDream(userId);
  }

  /**
   * Rewrites a short user query by reinforcing context from recent conversation history.
   */
  public async contextualizeQuery(query: string, shortHistory: string): Promise<string> {
    return await this.agents.contextualizarConsulta(query, shortHistory);
  }

  /**
   * Gracefully closes the SQLite WAL/mmap database connection.
   */
  public close(): void {
    this.store.close();
  }
}
