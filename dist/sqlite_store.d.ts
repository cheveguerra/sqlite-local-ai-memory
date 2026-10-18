import { type MemoryHit } from "./types.js";
export declare const DASHBOARD_UUID = "00000000-0000-0000-0000-000000000000";
export declare class SqliteStore {
    private db;
    private dbPath;
    constructor(targetPath?: string);
    private expandHome;
    private resolveDatabasePath;
    private initDatabase;
    quantizeVectorInt8(vec: number[]): Buffer;
    cosineSimilarityInt8(queryVec: number[], blob: Buffer): number;
    /** Static stopword set for ES/EN — filters common words that dilute FTS5 BM25 ranking. */
    private static readonly STOPWORDS;
    searchFTS5(query: string, limit?: number, userId?: string): MemoryHit[];
    searchVectorInt8(queryVec: number[], limit?: number, userId?: string): MemoryHit[];
    insertMemoryFact(id: string, data: string, userId?: string, vector?: number[], source?: string): boolean;
    deactivateMemoryFact(id: string): boolean;
    getDashboardFact(userId?: string): {
        data: string;
        memory?: string;
        updated_at: string;
    } | null;
    saveDashboardFact(dashboardJson: string, userId?: string, vector?: number[]): boolean;
    /**
     * Retrieves recent memory facts created on or after the specified timestamp.
     * Excludes the Dashboard global singleton record (DASHBOARD_UUID).
     *
     * @param sinceIso - ISO 8601 timestamp string marking the start of the consolidation window.
     * @param userId - Target user identifier (defaults to 'user_default').
     * @param sourceFilter - Optional case-insensitive source label filter (e.g. 'TOTALCONNECT').
     * @returns Array of objects containing the fact text (`data`) and its origin (`source`).
     */
    getRecentFactsSince(sinceIso: string, userId?: string, sourceFilter?: string): Array<{
        data: string;
        source: string;
    }>;
    backfillMissingVectors(getEmbeddingFn: (text: string) => Promise<number[]>, userId?: string): Promise<number>;
    close(): void;
}
//# sourceMappingURL=sqlite_store.d.ts.map