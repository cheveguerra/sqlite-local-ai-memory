/**
 * ============================================================================
 * FILE: src/memory/cognitive_agents.ts
 * RESPONSIBILITY: Decoupled Cognitive Agents (Gatekeeper, Notary, Arbiter, AutoDream).
 * PROMPTS: Production-tested Technical English presets with native multi-lingual support.
 * ============================================================================
 */
import axios from "axios";
import * as crypto from "crypto";
import type { MemoryConfig, AgentModelConfig, AutoDreamResult, TriageItem, OpenCaseItem, DashboardItem, ModelProvider, AgentSchemaKey } from "./types.js";
import { SqliteStore } from "./sqlite_store.js";

export interface ParsedModelTarget {
  provider: ModelProvider;
  model: string;
}

export function parseModelTarget(
  raw?: string,
  defaultProvider: ModelProvider = "gemini",
  defaultModel: string = "gemini-2.5-flash-lite"
): ParsedModelTarget | null {
  if (raw === undefined) {
    return { provider: defaultProvider, model: defaultModel };
  }
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "none" || trimmed.toLowerCase() === "disabled" || trimmed.toLowerCase() === "off") {
    return null;
  }
  if (trimmed.includes("/")) {
    const idx = trimmed.indexOf("/");
    const providerStr = trimmed.slice(0, idx).toLowerCase();
    const model = trimmed.slice(idx + 1);
    let provider: ModelProvider = defaultProvider;
    if (providerStr === "ollama" || providerStr === "gemini" || providerStr === "openrouter" || providerStr === "openai") {
      provider = providerStr;
    }
    return { provider, model };
  }
  if (trimmed.toLowerCase().startsWith("gemini")) {
    return { provider: "gemini", model: trimmed };
  }
  if (trimmed.includes(":") || defaultProvider === "ollama") {
    return { provider: "ollama", model: trimmed };
  }
  return { provider: defaultProvider, model: trimmed };
}

export function extractJsonPayload(text: string): string {
  if (!text) return "";
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }
  const firstBrace = text.search(/[\{\[]/);
  const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }
  return text.trim();
}

export class CognitiveAgents {
  private config: Required<MemoryConfig>;
  private store: SqliteStore;
  private genAI: any = null;

  constructor(config: MemoryConfig, store: SqliteStore) {
    this.config = {
      dbPath: config.dbPath || process.env.SQLITE_MEM_PATH || "./memoria.db",
      userName: config.userName || process.env.MEMORY_USER_NAME || "User",
      userId: config.userId || process.env.MEMORY_USER_ID || "user_default",
      ollamaUrl: config.ollamaUrl || process.env.OLLAMA_URL || process.env.OLLAMA_HOST || "http://localhost:11434",
      geminiApiKey: config.geminiApiKey !== undefined ? config.geminiApiKey : (process.env.GEMINI_API_KEY || ""),
      openRouterApiKey: config.openRouterApiKey || process.env.OPENROUTER_API_KEY || "",
      semanticArbitrator: config.semanticArbitrator !== false,
      dashboardTTLHours: config.dashboardTTLHours || 12,
      customPrompts: config.customPrompts || {},
      debug: config.debug !== undefined ? config.debug : (process.env.MEMORY_DEBUG === "true" || process.env.DEBUG === "true"),
    };
    this.store = store;
  }

  private async getGenAIClient(): Promise<any> {
    if (this.genAI) return this.genAI;
    if (this.config.geminiApiKey) {
      try {
        const mod = await import("@google/generative-ai");
        this.genAI = new mod.GoogleGenerativeAI(this.config.geminiApiKey);
        return this.genAI;
      } catch (err: any) {
        console.warn("⚠️ @google/generative-ai package not available. Falling back to local Ollama.");
      }
    }
    return null;
  }

  private getOllamaApiUrl(): string {
    let raw = (this.config.ollamaUrl || process.env.OLLAMA_URL || process.env.OLLAMA_HOST || "http://localhost:11434")
      .trim()
      .replace(/\/+$/, "");
    raw = raw.replace(/\/(api\/)?(chat|generate|embed)$/i, "");
    return raw.endsWith("/api") ? raw : `${raw}/api`;
  }

  public getAgentsMatrix() {
    const apiUrl = this.getOllamaApiUrl();
    const ollamaChatEndpoint = `${apiUrl}/chat`;
    const ollamaEmbedEndpoint = `${apiUrl}/embed`;

    const gatekeeperTarget = parseModelTarget(process.env.GATEKEEPER_MODEL || process.env.PORTERO_MODEL, "ollama", "qwen2.5-coder:1.5b");
    const expanderTarget = parseModelTarget(process.env.EXPANDER_MODEL ?? process.env.LIBRARIAN_MODEL, "gemini", "gemini-2.5-flash-lite");
    const notaryTarget = parseModelTarget(process.env.NOTARY_MODEL, "gemini", "gemini-2.5-flash-lite");
    const orchestratorTarget = parseModelTarget(process.env.ORCHESTRATOR_MODEL, "gemini", "gemini-2.5-flash-lite");
    const arbiterTarget = parseModelTarget(process.env.ARBITER_MODEL, "gemini", "gemini-2.5-flash-lite");
    const embedderTarget = parseModelTarget(process.env.EMBEDDER_MODEL, "ollama", "nomic-embed-text");

    const createConfig = (
      desc: string,
      schemaKey: AgentSchemaKey,
      target: ParsedModelTarget | null,
      defaultTimeout: number
    ): AgentModelConfig | null => {
      if (!target) return null;
      const endpoint = target.provider === "ollama" ? ollamaChatEndpoint : undefined;
      return {
        desc,
        schemaKey,
        provider: target.provider,
        model: target.model,
        endpoint,
        options: [
          { provider: target.provider, model: target.model, endpoint, timeout: defaultTimeout },
        ],
      };
    };

    const GATEKEEPER: AgentModelConfig = createConfig("Noise Filter (Gatekeeper)", "none", gatekeeperTarget, 15000) || {
      desc: "Noise Filter (Gatekeeper)",
      schemaKey: "none",
      provider: "ollama",
      model: "qwen2.5-coder:1.5b",
      endpoint: ollamaChatEndpoint,
      options: [{ provider: "ollama", model: "qwen2.5-coder:1.5b", endpoint: ollamaChatEndpoint, timeout: 15000 }],
    };

    const QUERY_EXPANDER: AgentModelConfig | null = createConfig("Query Expander (Librarian)", "none", expanderTarget, 15000);

    const NOTARY: AgentModelConfig = createConfig("Atomic Fact Notary", "notary", notaryTarget, 30000) || {
      desc: "Atomic Fact Notary",
      schemaKey: "notary",
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
      options: [{ provider: "gemini", model: "gemini-2.5-flash-lite", timeout: 30000 }],
    };

    const STATE_ORCHESTRATOR: AgentModelConfig = createConfig("Dashboard State Orchestrator", "orchestrator", orchestratorTarget, 30000) || {
      desc: "Dashboard State Orchestrator",
      schemaKey: "orchestrator",
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
      options: [{ provider: "gemini", model: "gemini-2.5-flash-lite", timeout: 30000 }],
    };

    const SEMANTIC_ARBITER: AgentModelConfig = createConfig("State Collision Auditor (Semantic Arbiter)", "arbiter", arbiterTarget, 15000) || {
      desc: "State Collision Auditor (Semantic Arbiter)",
      schemaKey: "arbiter",
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
      options: [{ provider: "gemini", model: "gemini-2.5-flash-lite", timeout: 15000 }],
    };

    const EMBEDDER: AgentModelConfig = {
      desc: "Embedding Generator",
      schemaKey: "none",
      provider: embedderTarget?.provider || "ollama",
      model: embedderTarget?.model || "nomic-embed-text",
      endpoint: embedderTarget?.provider === "ollama" ? ollamaEmbedEndpoint : undefined,
      options: [{
        provider: embedderTarget?.provider || "ollama",
        model: embedderTarget?.model || "nomic-embed-text",
        endpoint: embedderTarget?.provider === "ollama" ? ollamaEmbedEndpoint : undefined,
        timeout: 10000,
      }],
    };

    return {
      GATEKEEPER,
      QUERY_EXPANDER,
      NOTARY,
      STATE_ORCHESTRATOR,
      SEMANTIC_ARBITER,
      EMBEDDER,
    };
  }

  public async getEmbedding(text: string, signal?: AbortSignal): Promise<number[]> {
    const matrix = this.getAgentsMatrix();
    const vecConfig = matrix.EMBEDDER;
    const endpoint = vecConfig.endpoint || `${this.getOllamaApiUrl()}/embed`;

    // 1. Try local Ollama nomic-embed-text first
    try {
      const res = await axios.post(endpoint, {
        model: vecConfig.model,
        prompt: text,
        input: text,
      }, { timeout: 8000, signal });
      const vec = res.data?.embedding || res.data?.embeddings?.[0] || [];
      if (vec && vec.length === 768) return vec;
    } catch (err: any) {
      if (err.name === "AbortError" || signal?.aborted) throw err;
      console.warn("⚠️ [COGNITIVE] Ollama embedding attempt failed:", err.message);
    }

    // 2. Fallback to Gemini Cloud gemini-embedding-001 (768 Matryoshka dimensions)
    if (this.genAI) {
      try {
        const embedModel = this.genAI.getGenerativeModel({ model: "gemini-embedding-001" });
        const res = await embedModel.embedContent({
          content: { role: "user", parts: [{ text }] },
          outputDimensionality: 768,
        } as any);
        const vec = res.embedding?.values || [];
        if (vec && vec.length >= 768) return vec.slice(0, 768);
      } catch (err: any) {
        console.warn("⚠️ [COGNITIVE] Gemini embedding generation failed:", err.message);
      }
    }

    console.warn("⚠️ [COGNITIVE] Embedding generation failed across all providers.");
    return [];
  }

  public async executeAgent(
    agentConfig: AgentModelConfig,
    systemPrompt: string,
    userPrompt: string,
    isJson: boolean = false,
    signal?: AbortSignal
  ): Promise<string> {
    const optionsList = agentConfig.options || [agentConfig];

    for (const config of optionsList) {
      const timeoutMs = (config as any).timeout || 60000;
      try {
        if (config.provider === "ollama") {
          const payload: any = {
            model: config.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            stream: false,
            options: { num_ctx: 4096 },
          };
          if (isJson) payload.format = "json";

          const res = await axios.post(config.endpoint || `${this.getOllamaApiUrl()}/chat`, payload, {
            timeout: timeoutMs,
            signal,
          });
          return res.data.message.content.trim();
        } else if (config.provider === "gemini") {
          const genAI = await this.getGenAIClient();
          if (!genAI) continue;
          const model = genAI.getGenerativeModel({
            model: config.model,
            systemInstruction: systemPrompt,
          });

          let genConfig: any = {};
          if (isJson) {
            genConfig.responseMimeType = "application/json";
            const schema = this.getResponseSchema(agentConfig.schemaKey);
            if (schema) genConfig.responseSchema = schema;
          }

          const res = await model.generateContent(
            {
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              generationConfig: genConfig,
            },
            { signal, timeout: timeoutMs } as any
          );
          return res.response.text().trim();
        } else if (config.provider === "openrouter" || config.provider === "openai") {
          const isOpenRouter = config.provider === "openrouter";
          const apiKey = isOpenRouter
            ? (this.config.openRouterApiKey || process.env.OPENROUTER_API_KEY)
            : (process.env.OPENAI_API_KEY || this.config.openRouterApiKey);
          const defaultEndpoint = isOpenRouter
            ? "https://openrouter.ai/api/v1/chat/completions"
            : (process.env.OPENAI_BASE_URL ? `${process.env.OPENAI_BASE_URL.replace(/\/+$/, "")}/chat/completions` : "https://api.openai.com/v1/chat/completions");
          const endpoint = config.endpoint || defaultEndpoint;

          const payload: any = {
            model: config.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          };
          if (isJson) {
            payload.response_format = { type: "json_object" };
          }

          const res = await axios.post(endpoint, payload, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            timeout: timeoutMs,
            signal,
          });
          return (res.data?.choices?.[0]?.message?.content || "").trim();
        }
      } catch (error: any) {
        console.warn(`⚠️ Temporary fallback in Agent [${agentConfig.desc}] with provider [${config.provider}]:`, error.message);
      }
    }
    throw new Error(`All providers failed for ${agentConfig.desc}`);
  }



  private getResponseSchema(key?: string): any {
    switch (key) {
      case "notary":
        return {
          type: "object",
          properties: {
            facts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  fact: { type: "string" },
                  category: { type: "string" },
                },
                required: ["fact", "category"],
              },
            },
          },
          required: ["facts"],
        };
      case "orchestrator":
        return {
          type: "object",
          properties: {
            narrative_summary: { type: "string" },
            dashboard: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  ts: { type: "number" },
                  txt: { type: "string" },
                },
                required: ["id", "ts", "txt"],
              },
            },
            triage_memory: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  fact: { type: "string" },
                },
                required: ["type", "fact"],
              },
            },
            open_cases: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  incident: { type: "string" },
                },
                required: ["id", "incident"],
              },
            },
          },
          required: ["narrative_summary", "dashboard", "triage_memory", "open_cases"],
        };
      case "arbiter":
        return {
          type: "object",
          properties: {
            replace_index: { type: "number" },
            reason: { type: "string" },
          },
          required: ["replace_index"],
        };
      default:
        return undefined;
    }
  }

  public async contextualizeQuery(originalQuery: string, shortHistory: string): Promise<string> {
    const expanderAgent = this.getAgentsMatrix().QUERY_EXPANDER;
    if (!expanderAgent) {
      if (this.config.debug) {
        console.error(`🔎 [MEMORY:EXPANDER] Bypassed (Disabled) -> Literal query: "${originalQuery}" (0 ms)`);
      }
      return originalQuery;
    }
    if (originalQuery.length > 50) {
      if (this.config.debug) {
        console.error(`🔎 [MEMORY:EXPANDER] Bypassed (Query > 50 chars) -> Literal query: "${originalQuery}" (0 ms)`);
      }
      return originalQuery;
    }

    const defaultLibrarian = `You are an Information Retrieval (RAG) expert and key entity extractor.
Your task is to rewrite the user's input to construct an ultra-clean semantic query, preserving and REINFORCING the search with prior conversational context.
The primary user is ${this.config.userName}.
SUPREME RULE: Retain all proper nouns, project names, and technical terms. Output format: "topic + Proper Noun", without possessive pronouns or greetings.`;

    const systemPrompt = this.config.customPrompts?.queryExpanderSystem || this.config.customPrompts?.bibliotecarioSystem || defaultLibrarian;
    const userPrompt = `[RECENT HISTORY]:\n${shortHistory}\n\n[SHORT QUERY]: "${originalQuery}"`;

    try {
      const res = await this.executeAgent(expanderAgent, systemPrompt, userPrompt);
      const finalQuery = res || originalQuery;
      if (this.config.debug) {
        console.error(`🔎 [MEMORY:EXPANDER] Original: "${originalQuery}" -> Expanded: "${finalQuery}"`);
      }
      return finalQuery;
    } catch (_) {
      if (this.config.debug) {
        console.error(`🔎 [MEMORY:EXPANDER] Fallback to raw query on error: "${originalQuery}"`);
      }
      return originalQuery;
    }
  }



  public async injectUnifiedFact(
    fact: string,
    userId: string = this.config.userId,
    protectedIds: string[] = [],
    signal?: AbortSignal
  ): Promise<void> {
    const vector = await this.getEmbedding(fact, signal);
    let matches: Array<{ id: string; payload: { data: string }; score: number }> = [];

    if (vector.length === 768) {
      const rawHits = this.store.searchVectorInt8(vector, 3, userId);
      matches = rawHits.map((h) => ({
        id: h.id,
        payload: { data: h.data },
        score: h.score || 0,
      }));
    } else {
      console.warn(`⚠️ [sqlite-local-ai-memory] Fact saved WITHOUT vector embedding (No active embedder). Precision degrades gracefully to FTS5 BM25 exact search mode until embedder is configured.`);
    }

    const pointId = crypto.randomUUID();
    protectedIds.push(pointId);

    let bypassInsert = false;

    if (this.config.semanticArbitrator && matches.length > 0) {
      const systemPrompt = this.config.customPrompts?.semanticArbiterSystem || this.config.customPrompts?.arbitroSystem || `You are a Consistency Auditor for a long-term memory database.
Your task is to evaluate whether a NEW FACT updates or replaces an EXISTING fact (e.g., changes an IP address, changes a service status, or changes an active location) or if it adds new information.
If the NEW FACT replaces or updates an existing state, return replace_index with the numeric 1-based index (1, 2, 3...) of the fact to replace.
If the NEW FACT is additive or new, return replace_index = 0. Return strict JSON: {"replace_index": 0, "reason": "..."}`;

      const userPrompt = `NEW FACT: "${fact}"\n\nEXISTING FACTS:\n${matches.map((c, i) => `[${i + 1}] ${c.payload.data}`).join("\n")}`;

      try {
        const rawRes = await this.executeAgent(this.getAgentsMatrix().SEMANTIC_ARBITER, systemPrompt, userPrompt, true, signal);
        const data = JSON.parse(extractJsonPayload(rawRes));
        const idx = typeof data.replace_index === "number" ? data.replace_index : 0;
        if (idx > 0 && idx <= matches.length) {
          const collision = matches[idx - 1];
          if (collision && !protectedIds.includes(collision.id)) {
            const ok = this.store.deactivateMemoryFact(collision.id);
            if (ok) {
              if (this.config.debug) {
                console.error(`⚖️ [MEMORY:ARBITER] Conflict detected: Replaced fact (UUID: ${collision.id}) "${collision.payload.data}" with new fact: "${fact}"`);
              }
            } else {
              console.error(`❌ [COGNITIVE] Failed to deactivate collided fact ${collision.id}`);
            }
          }
        } else {
          if (this.config.debug) {
            console.error(`⚖️ [MEMORY:ARBITER] Additive fact verified (No collision): "${fact}"`);
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError" || signal?.aborted) throw err;
        console.warn("⚠️ [COGNITIVE] Semantic Arbiter failed, keeping existing facts:", err.message);
      }
    } else if (!this.config.semanticArbitrator && matches.length > 0 && matches[0].score > 0.95) {
      const ok = this.store.insertMemoryFact(matches[0].id, fact, userId, vector, "system");
      if (!ok) {
        throw new Error(`Failed to update fact in SQLite: "${fact.slice(0, 50)}..."`);
      }
      bypassInsert = true;
    }

    if (!bypassInsert) {
      const ok = this.store.insertMemoryFact(pointId, fact, userId, vector, "system");
      if (!ok) {
        throw new Error(`Failed to insert fact in SQLite: "${fact.slice(0, 50)}..."`);
      }
    }
  }



  public async saveMemory(text: string, userId: string = this.config.userId, signal?: AbortSignal): Promise<void> {
    const messageMatch = text.match(/\[Mensaje a extraer\]: "(.*?)"/) || text.match(/\[Message to extract\]: "(.*?)"/);
    const pureMessage = messageMatch ? messageMatch[1].trim().toLowerCase() : text.trim().toLowerCase();

    const junkRegex = /^[\s]*(hola|hello|hi|hey|ok|okay|okey|thanks|thank you|gracias|jaja|jajaja|simon|simón|va|dale|vale|listo|enterado|enterada|listisimo|listísima|buenas|buenos dias|buenas tardes|good morning|good afternoon|good evening|me parece bien|got it|sounds good|cool|sure|alright|yes|yeah|yep|bye|goodbye)[\s.?!]*$/i;
    if (junkRegex.test(pureMessage) || pureMessage.startsWith("simon me") || pureMessage.startsWith("enterado list")) {
      if (this.config.debug) {
        console.error(`🧹 [MEMORY:GATEKEEPER] Dropped as empty chatter by Layer 1 (Regex): "${pureMessage}"`);
      }
      return;
    }

    const defaultGatekeeper = `Classify the input message into KNOWLEDGE (contains personal facts, preferences, or technical status), TRANSACTIONAL (small talk / empty chatter), or OPERATIONAL. Respond ONLY with the category name.`;
    const gatekeeperPrompt = this.config.customPrompts?.gatekeeperSystem || this.config.customPrompts?.porteroSystem || defaultGatekeeper;
    
    try {
      const cat = await this.executeAgent(this.getAgentsMatrix().GATEKEEPER, gatekeeperPrompt, `Message: "${pureMessage}"`, false, signal);
      if (cat.toUpperCase().includes("TRANSACTIONAL")) {
        if (this.config.debug) {
          console.error(`🧹 [MEMORY:GATEKEEPER] Dropped as TRANSACTIONAL chatter by Layer 2 SLM: "${pureMessage}" (Category: ${cat.trim()})`);
        }
        return;
      }
      if (this.config.debug) {
        console.error(`🛡️ [MEMORY:GATEKEEPER] Passed Layer 2 SLM check (Category: ${cat.trim()}) for: "${pureMessage}"`);
      }
    } catch (err: any) {
      if (err.name === "AbortError" || signal?.aborted) throw err;
      console.warn("⚠️ [COGNITIVE] Gatekeeper agent check failed, proceeding to notary:", err.message);
    }

    const defaultNotary = `You are an Atomic Fact Compiler. Your output MUST be strict JSON: {"facts": [{"fact": "...", "category": "PERSONAL|TECHNICAL"}]}.
The primary user is named ${this.config.userName}. Always replace pronouns with the exact user name. Always preserve and extract facts in the exact original language of the user. If the input is a question or inquiry, return {"facts": []}.`;

    const notaryPrompt = this.config.customPrompts?.notarySystem || this.config.customPrompts?.notarioSystem || defaultNotary;

    try {
      const rawRes = await this.executeAgent(this.getAgentsMatrix().NOTARY, notaryPrompt, `ANALYZE: "${text}"`, true, signal);
      const parsedJson = JSON.parse(extractJsonPayload(rawRes));

      const factsList = parsedJson.facts || parsedJson.hechos;
      if (factsList && Array.isArray(factsList)) {
        if (this.config.debug) {
          console.error(`📝 [MEMORY:NOTARY] Extracted ${factsList.length} atomic fact(s):`);
          factsList.forEach((f: any) => console.error(`   • [${f.category || f.cat || "GENERAL"}] ${f.fact || f.dato || ""}`));
        }
        const protectedIds: string[] = [];
        for (const item of factsList) {
          const category = item.category || item.cat || "GENERAL";
          const factText = item.fact || item.dato || "";
          if (factText) {
            const finalFact = `[${category}] ${factText}`;
            await this.injectUnifiedFact(finalFact, userId, protectedIds, signal);
          }
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError" || signal?.aborted) throw e;
      console.error("❌ [COGNITIVE] Error in Notary Agent:", e.message);
    }
  }



  public async runAutoDream(userId: string = this.config.userId): Promise<AutoDreamResult> {
    const NOW = Date.now();
    const TTL_MS = this.config.dashboardTTLHours * 60 * 60 * 1000;

    let previousDashboard: Array<DashboardItem> = [];
    let lastConsolidationDate = new Date(NOW - 24 * 60 * 60 * 1000).toISOString();

    const sqliteDash = this.store.getDashboardFact(userId);
    if (sqliteDash && sqliteDash.data) {
      lastConsolidationDate = sqliteDash.updated_at || lastConsolidationDate;
      try {
        const parsed = JSON.parse(sqliteDash.data);
        if (Array.isArray(parsed)) previousDashboard = parsed;
      } catch (_) {}
    }

    const activeDashboard = previousDashboard.filter((item) => NOW - item.ts < TTL_MS);
    const expiredItems = previousDashboard.filter((item) => NOW - item.ts >= TTL_MS);
    const prunedFactsCount = expiredItems.length;

    // Auto-archive expired unresolved incubator cases into long-term memory
    for (const item of expiredItems) {
      if (item.txt.includes("[INCUBATOR/OPEN_CASE]")) {
        const rawIncident = item.txt.replace("[INCUBATOR/OPEN_CASE]", "").trim();
        const unresolvedFact = `[TECHNICAL] [UNRESOLVED_CASE] [SYMPTOM]: ${rawIncident} [STATUS]: Unresolved due to inactivity after TTL expiration.`;
        await this.injectUnifiedFact(unresolvedFact, userId);
      }
    }

    // Option B: Calculate dynamic consolidation window based on active open cases in dashboard
    let effectiveConsolidationDate = lastConsolidationDate;
    const openCaseItems = activeDashboard.filter((item) => item.txt.includes("[INCUBATOR/OPEN_CASE]"));
    if (openCaseItems.length > 0) {
      const minTs = Math.min(...openCaseItems.map((item) => item.ts));
      if (!isNaN(minTs) && minTs > 0) {
        effectiveConsolidationDate = new Date(minTs).toISOString();
      }
    }

    const newFacts = this.store.getRecentFactsSince(effectiveConsolidationDate, userId);

    if (newFacts.length === 0) {
      if (prunedFactsCount > 0) {
        const vectorText = activeDashboard.map((d) => d.txt).join(". ") || "No active state updates.";
        const vector = await this.getEmbedding(vectorText);
        this.store.saveDashboardFact(JSON.stringify(activeDashboard), userId, vector);
        return {
          narrativeSummary: "Deterministic dashboard pruning applied due to TTL expiration.",
          dashboard: activeDashboard,
          triageMemory: [],
          openCases: [],
          totalActive: activeDashboard.length,
          statusMessage: "Deterministic dashboard TTL pruning applied.",
        };
      }
      return {
        narrativeSummary: "No changes or new facts detected.",
        dashboard: activeDashboard,
        triageMemory: [],
        openCases: [],
        totalActive: activeDashboard.length,
        statusMessage: "No changes detected in working dashboard.",
      };
    }

    const defaultOrchestrator = `You are the Active State Orchestrator and Long-Term Memory Compiler (AutoDream).
Your task is to analyze recent facts and current working state, producing a strict JSON response with dual outputs:
1. "narrative_summary": A clear executive summary of active working context for the user's dashboard.
2. "dashboard": Array of active working items {"id": string, "ts": number, "txt": string}.
3. "triage_memory": Array of consolidated facts to inject into long-term memory:
   CRITICAL REQUIREMENT FOR TRIAGE FACTS:
   - Maximum Information Density: Include specific technical details, exact error codes, file paths, parameters, software versions, and concrete values. NEVER use vague summaries like "fixed issue" or "updated config".
   - Zero Semantic Loss: Retain full technical context and exact cause-effect reasoning without diluting information.
   - Formats:
     * Technical bugfixes/solutions: format "fact" as "[SYMPTOM]: <Exact error/symptom> [ROOT_CAUSE]: <Exact root cause> [SOLUTION]: <Concrete fix applied> [PREVENTIVE_RULE]: <Rule to avoid regressions>"
     * Unresolved cases: format "fact" as "[TECHNICAL] [UNRESOLVED_CASE] [SYMPTOM]: <Exact symptom> [DIAGNOSIS_ATTEMPTED]: <Attempted fixes> [STATUS]: Unresolved due to inactivity"
     * User preferences: format "fact" as "[PERSONAL] [PREFERENCE] <Specific detailed user preference>"
     * Project decisions: format "fact" as "[DEVELOPMENT] [ProjectName] <Specific milestone or architecture decision>"
4. "open_cases": Array of {"id": string, "incident": string} for unresolved diagnostics/investigations. Keep unresolved cases in dashboard ONLY; do NOT place them in triage_memory until resolved.
   CRITICAL FOR OPEN CASES: "incident" MUST store the detailed initial symptom, error codes, affected file paths, and context from NEW_FACTS so that when a solution is reached in a future AutoDream cycle, the complete 4-block triage record can be assembled without losing past context.

Return strict JSON matching schema. Retain primary user's native language.`;

    const systemPrompt = this.config.customPrompts?.stateOrchestratorSystem || this.config.customPrompts?.historiadorSystem || defaultOrchestrator;
    const userPrompt = `CURRENT_TIMESTAMP: ${NOW}\nCURRENT_DASHBOARD: ${JSON.stringify(activeDashboard)}\nNEW_FACTS: ${JSON.stringify(newFacts)}`;

    try {
      const rawRes = await this.executeAgent(this.getAgentsMatrix().STATE_ORCHESTRATOR, systemPrompt, userPrompt, true);
      const data = JSON.parse(extractJsonPayload(rawRes));

      const narrativeSummary: string = data.narrative_summary || data.resumen_narrativo || "AutoDream consolidated.";
      const newDashboard: DashboardItem[] = Array.isArray(data.dashboard) ? data.dashboard : activeDashboard;
      
      const rawTriage = data.triage_memory || data.triaje_memoria || [];
      const triageList: TriageItem[] = Array.isArray(rawTriage)
        ? rawTriage.map((t: any) => ({
            type: (t.type || t.tipo || "TECHNICAL").toUpperCase() as any,
            fact: t.fact || t.dato || "",
          }))
        : [];

      const rawCases = data.open_cases || data.casos_abiertos || [];
      const openCasesList: OpenCaseItem[] = Array.isArray(rawCases)
        ? rawCases.map((c: any) => ({
            id: c.id || crypto.randomUUID(),
            incident: c.incident || c.incidente || "",
          }))
        : [];

      // Incubator: integrate open cases into active dashboard if not already present
      for (const openCase of openCasesList) {
        if (openCase && openCase.incident && !newDashboard.some((d) => d.txt.includes(openCase.incident))) {
          newDashboard.push({
            id: openCase.id || crypto.randomUUID(),
            ts: NOW,
            txt: `[INCUBATOR/OPEN_CASE] ${openCase.incident}`,
          });
        }
      }

      const vectorText = newDashboard.map((d: any) => d.txt).join(". ") || narrativeSummary;
      const vector = await this.getEmbedding(vectorText);

      this.store.saveDashboardFact(JSON.stringify(newDashboard), userId, vector);

      // Consolidated Atomic Fact Ingestion (Only resolved triage items)
      for (const item of triageList) {
        if (item && item.fact) {
          const prefix = item.type ? `[${item.type}] ` : "";
          const finalFact = item.fact.startsWith("[") ? item.fact : `${prefix}${item.fact}`;
          await this.injectUnifiedFact(finalFact, userId);
        }
      }

      if (this.config.debug) {
        console.error(`\n🌙 [MEMORY:AUTODREAM]`);
        console.error(`├─ Input Facts Analyzed: ${newFacts.length} fact(s) since ${effectiveConsolidationDate}`);
        console.error(`├─ Active Incubator Cases: ${openCasesList.length} incident(s)`);
        console.error(`├─ Executive Narrative Summary:\n│  "${narrativeSummary}"`);
        console.error(`├─ Active Dashboard (${newDashboard.length} items):`);
        if (newDashboard.length === 0) {
          console.error(`│  (Empty dashboard)`);
        } else {
          newDashboard.forEach((d, i) => {
            console.error(`│  [${i + 1}] ${d.txt}`);
          });
        }
        console.error(`└─ Triage Cards Generated (${triageList.length} items):`);
        if (triageList.length === 0) {
          console.error(`   (No permanent triage cards created in this cycle)`);
        } else {
          triageList.forEach((t, i) => {
            console.error(`   [Card ${i + 1} - ${t.type}]`);
            console.error(`   ${t.fact}`);
          });
        }
        console.error(`────────────────────────────────────────────────────\n`);
      }

      return {
        narrativeSummary,
        dashboard: newDashboard,
        triageMemory: triageList,
        openCases: openCasesList,
        totalActive: newDashboard.length,
        statusMessage: `AutoDream completed successfully. Active dashboard items: ${newDashboard.length}, Consolidated facts: ${triageList.length}`,
      };
    } catch (e: any) {
      console.error("❌ [AUTODREAM ERROR]:", e.message);
      return {
        narrativeSummary: "Error during AutoDream consolidation.",
        dashboard: activeDashboard,
        triageMemory: [],
        openCases: [],
        totalActive: activeDashboard.length,
        statusMessage: `AutoDream execution error: ${e.message}`,
      };
    }
  }
}
