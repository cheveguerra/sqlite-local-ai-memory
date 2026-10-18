/**
 * ============================================================================
 * FILE: src/memory/types.ts
 * RESPONSIBILITY: Decoupled TypeScript Interfaces and Types for MemoryEngine.
 * ============================================================================
 */
export const CONFIG_USER = {
    get NAME() {
        return process.env.MEMORY_USER_NAME || process.env.USER_NAME || "User";
    },
    get ID() {
        return process.env.MEMORY_USER_ID || process.env.USER_ID || "user_default";
    },
};
/** Standard vector dimensionality for the hybrid retrieval engine */
export const EMBEDDING_DIM = 768;
