/**
 * ============================================================================
 * FILE: src/memory/sqlite_store.ts
 * RESPONSIBILITY: Bare-Metal In-Process SQLite Persistence Engine.
 * INTEGRATION: FTS5 BM25 exact matching + Int8 Quantized Vector Cosine (<1.5ms).
 *
 * JOURNAL MODE (SQLITE_JOURNAL_MODE env var, default: TRUNCATE):
 *   - TRUNCATE (default): safe for network/NFS/cloud-mounted disks where WAL
 *     shared-memory files (-shm/-wal) can cause corruption. mmap is disabled.
 *   - WAL: best for local SSD/NVMe — activates 256MB mmap and concurrent reads.
 *     Use only when the database file lives on a local filesystem.
 * ============================================================================
 */
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { type MemoryHit, EMBEDDING_DIM } from "./types.js";

const LOCAL_FALLBACK_PATH = "./memoria.db";
export const DASHBOARD_UUID = "00000000-0000-0000-0000-000000000000";

export class SqliteStore {
  private db: DatabaseType;
  private dbPath: string;

  constructor(targetPath?: string) {
    this.dbPath = targetPath || this.resolveDatabasePath();
    this.db = this.initDatabase(this.dbPath);
  }

  private resolveDatabasePath(): string {
    const envPath = process.env.SQLITE_MEM_PATH;
    if (envPath && fs.existsSync(path.dirname(envPath))) return envPath;
    return LOCAL_FALLBACK_PATH;
  }

  private initDatabase(dbPath: string): DatabaseType {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const journalMode = (process.env.SQLITE_JOURNAL_MODE || "TRUNCATE").toUpperCase();
    const busyTimeout = parseInt(process.env.SQLITE_BUSY_TIMEOUT || "5000", 10);

    const db = new Database(dbPath, { timeout: busyTimeout });
    db.pragma(`busy_timeout = ${busyTimeout}`);
    try {
      // FIX R3-1.2: better-sqlite3 returns an Array of row objects, not a plain object.
      const rows = db.pragma("journal_mode") as Array<{ journal_mode: string }>;
      const currentMode = rows?.[0]?.journal_mode?.toUpperCase() || "";
      if (currentMode !== journalMode) {
        db.pragma(`journal_mode = ${journalMode}`);
      }
    } catch (err: any) {
      console.warn("⚠️ [SQLITE_STORE] Could not verify/set journal_mode:", err.message);
    }
    db.pragma("synchronous = NORMAL");
    if (journalMode === "WAL") {
      db.pragma("mmap_size = 268435456");
    } else {
      db.pragma("mmap_size = 0");
      if (journalMode !== "TRUNCATE") {
        // TRUNCATE is the intentional default — only warn for unexpected modes.
        console.warn(
          `⚠️ [SQLITE_STORE] journal_mode=${journalMode} + synchronous=NORMAL: ` +
          `mmap disabled. For local SSD/NVMe use SQLITE_JOURNAL_MODE=WAL.`
        );
      }
    }

    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS recuerdos_fts USING fts5(
        point_id UNINDEXED,
        user_id UNINDEXED,
        data,
        source,
        created_at UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 1'
      );

      CREATE TABLE IF NOT EXISTS recuerdos_vectores (
        point_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        data TEXT NOT NULL,
        source TEXT DEFAULT 'system',
        created_at TEXT NOT NULL,
        vector_blob BLOB
      );

      CREATE INDEX IF NOT EXISTS idx_recuerdos_user_id ON recuerdos_vectores (user_id);
      CREATE INDEX IF NOT EXISTS idx_recuerdos_source ON recuerdos_vectores (source);
      CREATE INDEX IF NOT EXISTS idx_recuerdos_created_at ON recuerdos_vectores (created_at);
    `);

    return db;
  }

  public quantizeVectorInt8(vec: number[]): Buffer {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    const scale = norm > 0 ? 1.0 / norm : 1.0;

    const buf = Buffer.alloc(vec.length);
    for (let i = 0; i < vec.length; i++) {
      const normalized = vec[i] * scale;
      const val = Math.max(-127, Math.min(127, Math.round(normalized * 127.0)));
      buf.writeInt8(val, i);
    }
    return buf;
  }

  public cosineSimilarityInt8(queryVec: number[], blob: Buffer): number {
    if (!blob || blob.length !== queryVec.length) return 0;
    let dotProduct = 0;
    let normQ = 0;
    let normB = 0;

    for (let i = 0; i < queryVec.length; i++) {
      const q = queryVec[i];
      const b = blob.readInt8(i) / 127.0;
      dotProduct += q * b;
      normQ += q * q;
      normB += b * b;
    }

    if (normQ === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normQ) * Math.sqrt(normB));
  }

  public searchFTS5(query: string, limit: number = 10, userId?: string): MemoryHit[] {
    try {
      const sanitized = query.replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, " ").trim();
      const cleanWords = sanitized
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 1);

      if (cleanWords.length === 0) return [];

      const ftsQuery = cleanWords.map((w) => `"${w}"*`).join(" OR ");

      let rows: any[];
      if (userId) {
        const stmt = this.db.prepare(`
          SELECT point_id as id, user_id, data, source, created_at, rank
          FROM recuerdos_fts
          WHERE recuerdos_fts MATCH ? AND user_id = ?
          ORDER BY rank LIMIT ?
        `);
        rows = stmt.all(ftsQuery, userId, limit);
      } else {
        const stmt = this.db.prepare(`
          SELECT point_id as id, user_id, data, source, created_at, rank
          FROM recuerdos_fts
          WHERE recuerdos_fts MATCH ?
          ORDER BY rank LIMIT ?
        `);
        rows = stmt.all(ftsQuery, limit);
      }

      return rows.map((r) => ({
        id: String(r.id),
        user_id: String(r.user_id),
        data: String(r.data),
        memory: String(r.data),
        source: String(r.source),
        created_at: String(r.created_at),
        rank: typeof r.rank === "number" ? r.rank : undefined,
      }));
    } catch (error: any) {
      console.error("[SQLITE_STORE] Error in FTS5 search:", error.message);
      return [];
    }
  }

  public searchVectorInt8(queryVec: number[], limit: number = 10, userId?: string): MemoryHit[] {
    try {
      let rows: any[];
      if (userId) {
        const stmt = this.db.prepare(`
          SELECT point_id as id, user_id, data, source, created_at, vector_blob
          FROM recuerdos_vectores
          WHERE vector_blob IS NOT NULL AND user_id = ?
        `);
        rows = stmt.all(userId);
      } else {
        const stmt = this.db.prepare(`
          SELECT point_id as id, user_id, data, source, created_at, vector_blob
          FROM recuerdos_vectores
          WHERE vector_blob IS NOT NULL
        `);
        rows = stmt.all();
      }

      const scored: MemoryHit[] = [];
      for (const r of rows) {
        if (r.vector_blob && Buffer.isBuffer(r.vector_blob)) {
          const score = this.cosineSimilarityInt8(queryVec, r.vector_blob);
          scored.push({
            id: String(r.id),
            user_id: String(r.user_id),
            data: String(r.data),
            memory: String(r.data),
            source: String(r.source),
            created_at: String(r.created_at),
            score,
          });
        }
      }

      scored.sort((a, b) => (b.score || 0) - (a.score || 0));
      return scored.slice(0, limit);
    } catch (error: any) {
      console.error("[SQLITE_STORE] Error in Int8 vector search:", error.message);
      return [];
    }
  }

  public insertMemoryFact(
    id: string,
    data: string,
    userId: string = "user_default",
    vector?: number[],
    source: string = "system"
  ): boolean {
    try {
      const now = new Date().toISOString();
      const vectorBlob = vector && vector.length === EMBEDDING_DIM ? this.quantizeVectorInt8(vector) : null;

      const insertFts = this.db.prepare(`
        INSERT OR REPLACE INTO recuerdos_fts (point_id, user_id, data, source, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertVec = this.db.prepare(`
        INSERT OR REPLACE INTO recuerdos_vectores (point_id, user_id, data, source, created_at, vector_blob)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      this.db.transaction(() => {
        insertFts.run(id, userId, data.trim(), source, now);
        insertVec.run(id, userId, data.trim(), source, now, vectorBlob);
      })();

      return true;
    } catch (error: any) {
      console.error("[SQLITE_STORE] Error inserting fact:", error.message);
      return false;
    }
  }

  public deactivateMemoryFact(id: string): boolean {
    try {
      const deleteFts = this.db.prepare("DELETE FROM recuerdos_fts WHERE point_id = ?");
      const updateVec = this.db.prepare("UPDATE recuerdos_vectores SET vector_blob = NULL, source = 'inactive' WHERE point_id = ?");

      this.db.transaction(() => {
        deleteFts.run(id);
        updateVec.run(id);
      })();

      return true;
    } catch (error: any) {
      console.error("[SQLITE_STORE] Error deactivating fact:", error.message);
      return false;
    }
  }

  public getDashboardFact(userId: string = "user_default"): { data: string; memory?: string; updated_at: string } | null {
    try {
      const row: any = this.db.prepare(`
        SELECT data, created_at as updated_at
        FROM recuerdos_vectores
        WHERE point_id = ? AND user_id = ?
      `).get(DASHBOARD_UUID, userId);

      if (row && row.data) {
        return {
          data: String(row.data),
          memory: String(row.data),
          updated_at: String(row.updated_at || "")
        };
      }
    } catch (error: any) {
      console.error("[SQLITE_STORE] Error reading Dashboard:", error.message);
    }
    return null;
  }

  public saveDashboardFact(dashboardJson: string, userId: string = "user_default", vector?: number[]): boolean {
    try {
      const now = new Date().toISOString();
      const vectorBlob = vector && vector.length === EMBEDDING_DIM ? this.quantizeVectorInt8(vector) : null;

      this.db.prepare(`
        INSERT OR REPLACE INTO recuerdos_vectores (point_id, user_id, data, source, created_at, vector_blob)
        VALUES (?, ?, ?, 'lo_ultimo', ?, ?)
      `).run(DASHBOARD_UUID, userId, dashboardJson, now, vectorBlob);

      return true;
    } catch (error: any) {
      console.error("[SQLITE_STORE] Error saving Dashboard:", error.message);
      return false;
    }
  }

  /**
   * Retrieves recent memory facts created on or after the specified timestamp.
   * Excludes the Dashboard global singleton record (DASHBOARD_UUID).
   * 
   * @param sinceIso - ISO 8601 timestamp string marking the start of the consolidation window.
   * @param userId - Target user identifier (defaults to 'user_default').
   * @param sourceFilter - Optional case-insensitive source label filter (e.g. 'TOTALCONNECT').
   * @returns Array of objects containing the fact text (`data`) and its origin (`source`).
   */
  public getRecentFactsSince(
    sinceIso: string,
    userId: string = "user_default",
    sourceFilter?: string
  ): Array<{ data: string; source: string }> {
    try {
      let query = `
        SELECT data, source
        FROM recuerdos_vectores
        WHERE user_id = ? AND point_id != ?
          AND created_at >= ?
      `;
      const params: any[] = [userId, DASHBOARD_UUID, sinceIso];
      if (sourceFilter) {
        query += ` AND UPPER(source) = ?`;
        params.push(sourceFilter.toUpperCase());
      }
      query += ` ORDER BY created_at ASC`;
      const rows = this.db.prepare(query).all(...params);

      return rows.map((r: any) => ({
        data: String(r.data),
        source: String(r.source || "system"),
      }));
    } catch (error: any) {
      console.error("[SQLITE_STORE] Error retrieving recent facts:", error.message);
      return [];
    }
  }

  public async backfillMissingVectors(getEmbeddingFn: (text: string) => Promise<number[]>, userId: string = "user_default"): Promise<number> {
    try {
      const rows: any[] = this.db.prepare(`
        SELECT point_id, data
        FROM recuerdos_vectores
        WHERE user_id = ? AND vector_blob IS NULL AND source != 'inactive' AND point_id != ?
        LIMIT 25
      `).all(userId, DASHBOARD_UUID);

      if (rows.length === 0) return 0;

      let backfilled = 0;
      for (const r of rows) {
        const vec = await getEmbeddingFn(String(r.data));
        if (vec && vec.length === EMBEDDING_DIM) {
          const blob = this.quantizeVectorInt8(vec);
          this.db.prepare(`
            UPDATE recuerdos_vectores SET vector_blob = ? WHERE point_id = ?
          `).run(blob, String(r.point_id));
          backfilled++;
        }
      }
      if (backfilled > 0) {
        console.error(`✨ [LAZY_BACKFILL] Generated Int8 vector embeddings for ${backfilled} past un-vectorized facts.`);
      }
      return backfilled;
    } catch (e: any) {
      return 0;
    }
  }

  public close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
