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
import * as fs from "fs";
import * as path from "path";
import os from "os";
import { EMBEDDING_DIM } from "./types.js";
const LOCAL_FALLBACK_PATH = path.join(os.homedir(), ".local-ai-memory", "memoria.db");
export const DASHBOARD_UUID = "00000000-0000-0000-0000-000000000000";
export class SqliteStore {
    db;
    dbPath;
    constructor(targetPath) {
        const rawPath = targetPath || process.env.SQLITE_MEM_PATH;
        this.dbPath = this.resolveDatabasePath(rawPath);
        this.db = this.initDatabase(this.dbPath);
    }
    expandHome(filepath) {
        const trimmed = filepath.trim();
        if (trimmed === "~")
            return os.homedir();
        if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
            return path.join(os.homedir(), trimmed.slice(2));
        }
        return trimmed;
    }
    resolveDatabasePath(customPath) {
        if (!customPath)
            return LOCAL_FALLBACK_PATH;
        const expandedPath = this.expandHome(customPath);
        try {
            const dir = path.dirname(expandedPath);
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir, { recursive: true });
            return expandedPath;
        }
        catch (err) {
            console.error(`⚠️ [SQLITE_STORE] Database path "${expandedPath}" unusable (${err.message}). ` +
                `Falling back to: ${LOCAL_FALLBACK_PATH}`);
            return LOCAL_FALLBACK_PATH;
        }
    }
    initDatabase(dbPath) {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        const journalMode = (process.env.SQLITE_JOURNAL_MODE || "TRUNCATE").toUpperCase();
        const busyTimeout = parseInt(process.env.SQLITE_BUSY_TIMEOUT || "5000", 10);
        const db = new Database(dbPath, { timeout: busyTimeout });
        db.pragma(`busy_timeout = ${busyTimeout}`);
        try {
            // FIX R3-1.2: better-sqlite3 returns an Array of row objects, not a plain object.
            const rows = db.pragma("journal_mode");
            const currentMode = rows?.[0]?.journal_mode?.toUpperCase() || "";
            if (currentMode !== journalMode) {
                db.pragma(`journal_mode = ${journalMode}`);
            }
        }
        catch (err) {
            console.error("⚠️ [SQLITE_STORE] Could not verify/set journal_mode:", err.message);
        }
        db.pragma("synchronous = NORMAL");
        if (journalMode === "WAL") {
            db.pragma("mmap_size = 268435456");
        }
        else {
            db.pragma("mmap_size = 0");
            if (journalMode !== "TRUNCATE") {
                // TRUNCATE is the intentional default — only warn for unexpected modes.
                console.error(`⚠️ [SQLITE_STORE] journal_mode=${journalMode} + synchronous=NORMAL: ` +
                    `mmap disabled. For local SSD/NVMe use SQLITE_JOURNAL_MODE=WAL.`);
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
        point_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        data TEXT NOT NULL,
        source TEXT DEFAULT 'system',
        created_at TEXT NOT NULL,
        vector_blob BLOB,
        valid_from TEXT,
        valid_to TEXT,
        superseded_by TEXT,
        supersede_reason TEXT,
        PRIMARY KEY (point_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_recuerdos_user_id ON recuerdos_vectores (user_id);
      CREATE INDEX IF NOT EXISTS idx_recuerdos_source ON recuerdos_vectores (source);
      CREATE INDEX IF NOT EXISTS idx_recuerdos_created_at ON recuerdos_vectores (created_at);
      CREATE INDEX IF NOT EXISTS idx_recuerdos_activos ON recuerdos_vectores (point_id, valid_from) WHERE valid_to IS NULL;
    `);
        // Migration: ensure Point-in-Time columns exist in existing databases
        try {
            const cols = db.pragma("table_info(recuerdos_vectores)");
            const colNames = new Set(cols.map((c) => c.name));
            if (!colNames.has("valid_from")) {
                db.exec("ALTER TABLE recuerdos_vectores ADD COLUMN valid_from TEXT;");
                db.exec("UPDATE recuerdos_vectores SET valid_from = created_at WHERE valid_from IS NULL;");
            }
            if (!colNames.has("valid_to")) {
                db.exec("ALTER TABLE recuerdos_vectores ADD COLUMN valid_to TEXT;");
            }
            if (!colNames.has("superseded_by")) {
                db.exec("ALTER TABLE recuerdos_vectores ADD COLUMN superseded_by TEXT;");
            }
            if (!colNames.has("supersede_reason")) {
                db.exec("ALTER TABLE recuerdos_vectores ADD COLUMN supersede_reason TEXT;");
            }
            db.exec("CREATE INDEX IF NOT EXISTS idx_recuerdos_activos ON recuerdos_vectores (point_id, valid_from) WHERE valid_to IS NULL;");
        }
        catch (e) {
            console.error("⚠️ [SQLITE_STORE] Point-in-Time migration note:", e.message);
        }
        return db;
    }
    quantizeVectorInt8(vec) {
        let norm = 0;
        for (let i = 0; i < vec.length; i++)
            norm += vec[i] * vec[i];
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
    cosineSimilarityInt8(queryVec, blob) {
        if (!blob || blob.length !== queryVec.length)
            return 0;
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
        if (normQ === 0 || normB === 0)
            return 0;
        return dotProduct / (Math.sqrt(normQ) * Math.sqrt(normB));
    }
    /** Static stopword set for ES/EN — filters common words that dilute FTS5 BM25 ranking. */
    static STOPWORDS = new Set([
        // Spanish
        "de", "la", "el", "en", "que", "es", "lo", "un", "una", "las", "los",
        "del", "al", "por", "con", "para", "se", "su", "sus", "le", "les",
        "ya", "me", "te", "mi", "tu", "nos", "como", "pero", "mas", "ese",
        "esa", "eso", "esta", "este", "esto", "son", "fue", "ser", "hay",
        "si", "no", "muy", "sin", "sobre", "entre", "cuando", "donde",
        "desde", "hasta", "era", "han", "sido", "tiene", "puede",
        "tambien", "otro", "otra", "otros", "cada", "todo", "toda", "todos",
        // English
        "the", "is", "at", "which", "on", "a", "an", "and", "or", "but",
        "in", "with", "for", "to", "of", "it", "its", "was", "are", "be",
        "has", "had", "have", "do", "does", "did", "not", "this", "that",
        "from", "by", "as", "into", "can", "will", "just", "about", "also",
        "been", "would", "should", "could", "than", "then", "them", "they",
        "their", "there", "what", "when", "how", "who", "all", "some",
    ]);
    searchFTS5(query, limit = 10, userId, asOf) {
        try {
            const sanitized = query.replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, " ").trim();
            const cleanWords = sanitized
                .split(/\s+/)
                .map((w) => w.trim())
                .filter((w) => w.length > 1 && !SqliteStore.STOPWORDS.has(w.toLowerCase()));
            if (cleanWords.length === 0)
                return [];
            const ftsQuery = cleanWords.map((w) => `"${w}"*`).join(" OR ");
            const asOfParam = asOf ? new Date(asOf).toISOString() : null;
            let rows;
            if (userId) {
                const stmt = this.db.prepare(`
          SELECT f.point_id as id, f.user_id, f.data, f.source, f.created_at, f.rank,
                 v.valid_from, v.valid_to, v.superseded_by, v.supersede_reason
          FROM recuerdos_fts f
          JOIN recuerdos_vectores v ON f.point_id = v.point_id AND f.user_id = v.user_id
          WHERE recuerdos_fts MATCH ? AND f.user_id = ?
            AND (
              (? IS NULL AND v.valid_to IS NULL)
              OR
              (? IS NOT NULL AND v.valid_from <= ? AND (v.valid_to IS NULL OR v.valid_to > ?))
            )
          ORDER BY f.rank LIMIT ?
        `);
                rows = stmt.all(ftsQuery, userId, asOfParam, asOfParam, asOfParam, asOfParam, limit);
            }
            else {
                const stmt = this.db.prepare(`
          SELECT f.point_id as id, f.user_id, f.data, f.source, f.created_at, f.rank,
                 v.valid_from, v.valid_to, v.superseded_by, v.supersede_reason
          FROM recuerdos_fts f
          JOIN recuerdos_vectores v ON f.point_id = v.point_id AND f.user_id = v.user_id
          WHERE recuerdos_fts MATCH ?
            AND (
              (? IS NULL AND v.valid_to IS NULL)
              OR
              (? IS NOT NULL AND v.valid_from <= ? AND (v.valid_to IS NULL OR v.valid_to > ?))
            )
          ORDER BY f.rank LIMIT ?
        `);
                rows = stmt.all(ftsQuery, asOfParam, asOfParam, asOfParam, asOfParam, limit);
            }
            return rows.map((r) => ({
                id: String(r.id),
                user_id: String(r.user_id),
                data: String(r.data),
                memory: String(r.data),
                source: String(r.source),
                created_at: String(r.created_at),
                rank: typeof r.rank === "number" ? r.rank : undefined,
                valid_from: r.valid_from ? String(r.valid_from) : undefined,
                valid_to: r.valid_to ? String(r.valid_to) : null,
                superseded_by: r.superseded_by ? String(r.superseded_by) : null,
                supersede_reason: r.supersede_reason ? String(r.supersede_reason) : null,
            }));
        }
        catch (error) {
            console.error("[SQLITE_STORE] Error in FTS5 search:", error.message);
            return [];
        }
    }
    searchVectorInt8(queryVec, limit = 10, userId, asOf) {
        try {
            let rows;
            const asOfParam = asOf ? new Date(asOf).toISOString() : null;
            if (userId) {
                const stmt = this.db.prepare(`
          SELECT point_id as id, user_id, data, source, created_at, vector_blob,
                 valid_from, valid_to, superseded_by, supersede_reason
          FROM recuerdos_vectores
          WHERE vector_blob IS NOT NULL
            AND point_id != ?
            AND user_id = ?
            AND (
              (? IS NULL AND valid_to IS NULL)
              OR
              (? IS NOT NULL AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?))
            )
          ORDER BY created_at DESC
          LIMIT 5000
        `);
                rows = stmt.all(DASHBOARD_UUID, userId, asOfParam, asOfParam, asOfParam, asOfParam);
                if (rows.length >= 5000) {
                    console.error(`⚠️ [SQLITE_STORE] Vector scan hit the 5000-row safety limit for user [${userId}]. Consider enabling ANN indexing for better scalability.`);
                }
            }
            else {
                const stmt = this.db.prepare(`
          SELECT point_id as id, user_id, data, source, created_at, vector_blob,
                 valid_from, valid_to, superseded_by, supersede_reason
          FROM recuerdos_vectores
          WHERE vector_blob IS NOT NULL
            AND point_id != ?
            AND (
              (? IS NULL AND valid_to IS NULL)
              OR
              (? IS NOT NULL AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?))
            )
          ORDER BY created_at DESC
          LIMIT 5000
        `);
                rows = stmt.all(DASHBOARD_UUID, asOfParam, asOfParam, asOfParam, asOfParam);
                if (rows.length >= 5000) {
                    console.error(`⚠️ [SQLITE_STORE] Vector scan hit the 5000-row safety limit. Consider enabling ANN indexing for better scalability.`);
                }
            }
            const scored = [];
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
                        valid_from: r.valid_from ? String(r.valid_from) : undefined,
                        valid_to: r.valid_to ? String(r.valid_to) : null,
                        superseded_by: r.superseded_by ? String(r.superseded_by) : null,
                        supersede_reason: r.supersede_reason ? String(r.supersede_reason) : null,
                    });
                }
            }
            scored.sort((a, b) => (b.score || 0) - (a.score || 0));
            return scored.slice(0, limit);
        }
        catch (error) {
            console.error("[SQLITE_STORE] Error in Int8 vector search:", error.message);
            return [];
        }
    }
    insertMemoryFact(id, data, userId = "user_default", vector, source = "system") {
        try {
            const now = new Date().toISOString();
            const vectorBlob = vector && vector.length === EMBEDDING_DIM ? this.quantizeVectorInt8(vector) : null;
            const targetUser = userId || "user_default";
            const deleteFts = this.db.prepare(`DELETE FROM recuerdos_fts WHERE point_id = ?`);
            const insertFts = this.db.prepare(`
        INSERT INTO recuerdos_fts (point_id, user_id, data, source, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
            const insertVec = this.db.prepare(`
        INSERT OR REPLACE INTO recuerdos_vectores (point_id, user_id, data, source, created_at, vector_blob, valid_from, valid_to, superseded_by, supersede_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
      `);
            this.db.transaction(() => {
                deleteFts.run(id);
                insertFts.run(id, targetUser, data.trim(), source, now);
                insertVec.run(id, targetUser, data.trim(), source, now, vectorBlob, now);
            })();
            return true;
        }
        catch (error) {
            console.error("[SQLITE_STORE] Error inserting fact:", error.message);
            return false;
        }
    }
    deactivateMemoryFact(id, reason = "manual_deactivation") {
        if (id === DASHBOARD_UUID)
            return false;
        try {
            const now = new Date().toISOString();
            const updateVec = this.db.prepare(`
        UPDATE recuerdos_vectores 
        SET valid_to = ?, supersede_reason = ?, source = 'inactive'
        WHERE point_id = ?
      `);
            updateVec.run(now, reason, id);
            return true;
        }
        catch (error) {
            console.error("[SQLITE_STORE] Error deactivating fact:", error.message);
            return false;
        }
    }
    supersedeMemoryFact(oldId, newId, reason) {
        if (oldId === DASHBOARD_UUID)
            return false;
        try {
            const now = new Date().toISOString();
            const updateVec = this.db.prepare(`
        UPDATE recuerdos_vectores 
        SET valid_to = ?, superseded_by = ?, supersede_reason = ?
        WHERE point_id = ?
      `);
            updateVec.run(now, newId, reason || null, oldId);
            return true;
        }
        catch (error) {
            console.error("[SQLITE_STORE] Error superseding fact:", error.message);
            return false;
        }
    }
    getFactLineage(pointId) {
        try {
            const current = this.db.prepare(`
        SELECT point_id as id, user_id, data, source, created_at, valid_from, valid_to, superseded_by, supersede_reason
        FROM recuerdos_vectores
        WHERE point_id = ?
      `).get(pointId);
            if (!current)
                return [];
            const chain = [
                {
                    id: String(current.id),
                    user_id: String(current.user_id),
                    data: String(current.data),
                    source: String(current.source),
                    created_at: String(current.created_at),
                    valid_from: current.valid_from ? String(current.valid_from) : current.created_at,
                    valid_to: current.valid_to ? String(current.valid_to) : null,
                    superseded_by: current.superseded_by ? String(current.superseded_by) : null,
                    supersede_reason: current.supersede_reason ? String(current.supersede_reason) : null,
                },
            ];
            // Walk backward: facts that this fact superseded
            let prevId = pointId;
            while (true) {
                const prev = this.db.prepare(`
          SELECT point_id as id, user_id, data, source, created_at, valid_from, valid_to, superseded_by, supersede_reason
          FROM recuerdos_vectores
          WHERE superseded_by = ?
        `).get(prevId);
                if (!prev)
                    break;
                chain.unshift({
                    id: String(prev.id),
                    user_id: String(prev.user_id),
                    data: String(prev.data),
                    source: String(prev.source),
                    created_at: String(prev.created_at),
                    valid_from: prev.valid_from ? String(prev.valid_from) : prev.created_at,
                    valid_to: prev.valid_to ? String(prev.valid_to) : null,
                    superseded_by: prev.superseded_by ? String(prev.superseded_by) : null,
                    supersede_reason: prev.supersede_reason ? String(prev.supersede_reason) : null,
                });
                prevId = prev.id;
            }
            // Walk forward: facts that superseded this fact
            let nextId = current.superseded_by;
            while (nextId) {
                const next = this.db.prepare(`
          SELECT point_id as id, user_id, data, source, created_at, valid_from, valid_to, superseded_by, supersede_reason
          FROM recuerdos_vectores
          WHERE point_id = ?
        `).get(nextId);
                if (!next)
                    break;
                chain.push({
                    id: String(next.id),
                    user_id: String(next.user_id),
                    data: String(next.data),
                    source: String(next.source),
                    created_at: String(next.created_at),
                    valid_from: next.valid_from ? String(next.valid_from) : next.created_at,
                    valid_to: next.valid_to ? String(next.valid_to) : null,
                    superseded_by: next.superseded_by ? String(next.superseded_by) : null,
                    supersede_reason: next.supersede_reason ? String(next.supersede_reason) : null,
                });
                nextId = next.superseded_by;
            }
            return chain;
        }
        catch (error) {
            console.error("[SQLITE_STORE] Error fetching fact lineage:", error.message);
            return [];
        }
    }
    getDashboardFact(userId = "user_default") {
        try {
            const row = this.db.prepare(`
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
        }
        catch (error) {
            console.error("[SQLITE_STORE] Error reading Dashboard:", error.message);
        }
        return null;
    }
    saveDashboardFact(dashboardJson, userId = "user_default", vector) {
        try {
            const now = new Date().toISOString();
            const vectorBlob = vector && vector.length === EMBEDDING_DIM ? this.quantizeVectorInt8(vector) : null;
            this.db.prepare(`
        INSERT OR REPLACE INTO recuerdos_vectores (point_id, user_id, data, source, created_at, vector_blob)
        VALUES (?, ?, ?, 'lo_ultimo', ?, ?)
      `).run(DASHBOARD_UUID, userId, dashboardJson, now, vectorBlob);
            return true;
        }
        catch (error) {
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
    getRecentFactsSince(sinceIso, userId = "user_default", sourceFilter) {
        try {
            let query = `
        SELECT data, source
        FROM recuerdos_vectores
        WHERE user_id = ? AND point_id != ?
          AND created_at >= ?
          AND source != 'inactive'
      `;
            const params = [userId, DASHBOARD_UUID, sinceIso];
            if (sourceFilter) {
                query += ` AND UPPER(source) = ?`;
                params.push(sourceFilter.toUpperCase());
            }
            query += ` ORDER BY created_at ASC`;
            const rows = this.db.prepare(query).all(...params);
            return rows.map((r) => ({
                data: String(r.data),
                source: String(r.source || "system"),
            }));
        }
        catch (error) {
            console.error("[SQLITE_STORE] Error retrieving recent facts:", error.message);
            return [];
        }
    }
    async backfillMissingVectors(getEmbeddingFn, userId = "user_default") {
        try {
            const rows = this.db.prepare(`
        SELECT point_id, data
        FROM recuerdos_vectores
        WHERE user_id = ? AND vector_blob IS NULL AND source != 'inactive' AND point_id != ?
        LIMIT 25
      `).all(userId, DASHBOARD_UUID);
            if (rows.length === 0)
                return 0;
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
        }
        catch (e) {
            return 0;
        }
    }
    close() {
        if (this.db) {
            this.db.close();
        }
    }
}
