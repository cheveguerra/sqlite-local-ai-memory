/**
 * ============================================================================
 * FILE: src/memory/cognitive_agents.ts
 * RESPONSIBILITY: Decoupled Cognitive Agents (Gatekeeper, Notary, Arbiter, AutoDream).
 * PROMPTS: Production-tested Technical English presets with native multi-lingual support.
 * ============================================================================
 */
import axios from "axios";
import * as crypto from "crypto";
import type { MemoryConfig, AgentModelConfig } from "./types.js";
import { SqliteStore } from "./sqlite_store.js";

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

  public getAgentsMatrix() {
    const ollamaChatEndpoint = `${this.config.ollamaUrl.replace(/\/+$/, "")}/chat`;
    const ollamaEmbedEndpoint = `${this.config.ollamaUrl.replace(/\/+$/, "")}/embed`;

    const porteroModel = process.env.PORTERO_MODEL || "qwen2.5-coder:1.5b";
    const notaryModel = process.env.NOTARY_MODEL || "gemini-2.5-flash-lite";
    const orchestratorModel = process.env.ORCHESTRATOR_MODEL || "gemini-2.5-flash-lite";
    const arbiterModel = process.env.ARBITER_MODEL || "gemini-2.5-flash-lite";

    return {
      PORTERO: {
        desc: "Noise Filter (Portero)",
        schemaKey: "none",
        proveedor: "ollama",
        modelo: porteroModel,
        endpoint: ollamaChatEndpoint,
        opciones: [
          { proveedor: "ollama", modelo: porteroModel, endpoint: ollamaChatEndpoint, timeout: 15000 },
          { proveedor: "gemini", modelo: "gemini-2.5-flash-lite", timeout: 10000 },
        ],
      } as AgentModelConfig,
      BIBLIOTECARIO: {
        desc: "Query Expander (Bibliotecario)",
        schemaKey: "none",
        proveedor: "gemini",
        modelo: "gemini-2.5-flash-lite",
        opciones: [{ proveedor: "gemini", modelo: "gemini-2.5-flash-lite", timeout: 15000 }],
      } as AgentModelConfig,
      DESTILADOR: {
        desc: "Atomic Fact Notary (Destilador)",
        schemaKey: "notary",
        proveedor: "gemini",
        modelo: notaryModel,
        opciones: [{ proveedor: "gemini", modelo: notaryModel, timeout: 30000 }],
      } as AgentModelConfig,
      HISTORIADOR: {
        desc: "Dashboard State Orchestrator (Historiador)",
        schemaKey: "orchestrator",
        proveedor: "gemini",
        modelo: orchestratorModel,
        opciones: [{ proveedor: "gemini", modelo: orchestratorModel, timeout: 30000 }],
      } as AgentModelConfig,
      ARBITRO_SEMANTICO: {
        desc: "State Collision Auditor (Árbitro Semántico)",
        schemaKey: "arbiter",
        proveedor: "gemini",
        modelo: arbiterModel,
        opciones: [
          { proveedor: "gemini", modelo: arbiterModel, timeout: 15000 },
        ],
      } as AgentModelConfig,
      VECTORIZADOR: {
        desc: "Embedding Generator (Vectorizador)",
        schemaKey: "none",
        proveedor: "ollama",
        modelo: "nomic-embed-text",
        endpoint: ollamaEmbedEndpoint,
        opciones: [{ proveedor: "ollama", modelo: "nomic-embed-text", endpoint: ollamaEmbedEndpoint, timeout: 10000 }],
      } as AgentModelConfig,
    };
  }

  public async getEmbedding(text: string, signal?: AbortSignal): Promise<number[]> {
    const matrix = this.getAgentsMatrix();
    const vecConfig = matrix.VECTORIZADOR;
    const endpoint = vecConfig.endpoint || `${this.config.ollamaUrl.replace(/\/+$/, "")}/embeddings`;

    // 1. Intentar Ollama nomic-embed-text local primero
    try {
      const res = await axios.post(endpoint, {
        model: vecConfig.modelo,
        prompt: text,
        input: text,
      }, { timeout: 8000, signal });
      const vec = res.data?.embedding || res.data?.embeddings?.[0] || [];
      if (vec && vec.length === 768) return vec;
    } catch (err: any) {
      if (err.name === "AbortError" || signal?.aborted) throw err;
      console.warn("⚠️ [COGNITIVE] Ollama embedding attempt failed:", err.message);
    }

    // 2. Fallback a Gemini Cloud gemini-embedding-001 (768 dimensiones Matryoshka)
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

  public async ejecutarAgente(
    agenteConfig: AgentModelConfig,
    systemPrompt: string,
    userPrompt: string,
    isJson: boolean = false,
    signal?: AbortSignal
  ): Promise<string> {
    const opciones = agenteConfig.opciones || [agenteConfig];

    for (const config of opciones) {
      const timeoutMs = (config as any).timeout || 60000;
      try {
        if (config.proveedor === "ollama") {
          const payload: any = {
            model: config.modelo,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            stream: false,
            options: { num_ctx: 512 },
          };
          if (isJson) payload.format = "json";

          const res = await axios.post(config.endpoint || `${this.config.ollamaUrl.replace(/\/+$/, "")}/chat`, payload, {
            timeout: timeoutMs,
            signal,
          });
          return res.data.message.content.trim();
        } else if (config.proveedor === "gemini") {
          const genAI = await this.getGenAIClient();
          if (!genAI) continue;
          const model = genAI.getGenerativeModel({
            model: config.modelo,
            systemInstruction: systemPrompt,
          });

          let genConfig: any = {};
          if (isJson) {
            genConfig.responseMimeType = "application/json";
            const schema = this.getResponseSchema(agenteConfig.schemaKey);
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
        }
      } catch (error: any) {
        console.warn(`⚠️ Temporary fallback in Agent [${agenteConfig.desc}] with provider [${config.proveedor}]:`, error.message);
      }
    }
    throw new Error(`All providers failed for ${agenteConfig.desc}`);
  }

  private getResponseSchema(key?: string): any {
    switch (key) {
      case "notary":
        return {
          type: "OBJECT",
          properties: {
            hechos: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  dato: { type: "STRING" },
                  cat: { type: "STRING" },
                },
                required: ["dato", "cat"],
              },
            },
          },
          required: ["hechos"],
        };
      case "orchestrator":
        return {
          type: "OBJECT",
          properties: {
            dashboard: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  id: { type: "STRING" },
                  ts: { type: "NUMBER" },
                  txt: { type: "STRING" },
                },
                required: ["id", "ts", "txt"],
              },
            },
            hechos_actualizados: {
              type: "ARRAY",
              items: { type: "STRING" },
            },
          },
          required: ["dashboard", "hechos_actualizados"],
        };
      case "arbiter":
        return {
          type: "OBJECT",
          properties: {
            replace_index: { type: "NUMBER" },
            reason: { type: "STRING" },
          },
          required: ["replace_index"],
        };
      default:
        return undefined;
    }
  }

  public async contextualizarConsulta(preguntaOriginal: string, historialCorto: string): Promise<string> {
    if (preguntaOriginal.length > 50) return preguntaOriginal;

    const defaultBibliotecario = `You are an Information Retrieval (RAG) expert and key entity extractor.
Your task is to rewrite the user's input to construct an ultra-clean semantic query, preserving and REINFORCING the search with prior conversational context.
The primary user is ${this.config.userName}.
SUPREME RULE: Retain all proper nouns, project names, and technical terms. Output format: "topic + Proper Noun", without possessive pronouns or greetings.`;

    const systemPrompt = this.config.customPrompts?.queryExpanderSystem || this.config.customPrompts?.bibliotecarioSystem || defaultBibliotecario;
    const userPrompt = `[RECENT HISTORY]:\n${historialCorto}\n\n[SHORT QUERY]: "${preguntaOriginal}"`;

    try {
      const res = await this.ejecutarAgente(this.getAgentsMatrix().BIBLIOTECARIO, systemPrompt, userPrompt);
      return res || preguntaOriginal;
    } catch (_) {
      return preguntaOriginal;
    }
  }

  public async inyectarHechoUnificado(
    hecho: string,
    userId: string = this.config.userId,
    idsProtegidos: string[] = [],
    signal?: AbortSignal
  ): Promise<void> {
    const vector = await this.getEmbedding(hecho, signal);
    let coincidencias: Array<{ id: string; payload: { data: string }; score: number }> = [];

    if (vector.length === 768) {
      const rawHits = this.store.searchVectorInt8(vector, 3, userId);
      coincidencias = rawHits.map((h) => ({
        id: h.id,
        payload: { data: h.data },
        score: h.score || 0,
      }));
    } else {
      console.warn(`⚠️ [sqlite-local-ai-memory] Fact saved WITHOUT vector embedding (No active embedder). Precision degrades gracefully to FTS5 BM25 exact search mode until embedder is configured.`);
    }

    const pointId = crypto.randomUUID();
    idsProtegidos.push(pointId);

    let bypassInsert = false;

    if (this.config.semanticArbitrator && coincidencias.length > 0) {
      const systemPrompt = this.config.customPrompts?.semanticArbiterSystem || this.config.customPrompts?.arbitroSystem || `You are a Consistency Auditor for a long-term memory database.
Your task is to evaluate whether a NEW FACT updates or replaces an EXISTING fact (e.g., changes an IP address, changes a service status, or changes an active location) or if it adds new information.
If the NEW FACT replaces or updates an existing state, return replace_index with the numeric 1-based index (1, 2, 3...) of the fact to replace.
If the NEW FACT is additive or new, return replace_index = 0. Return strict JSON: {"replace_index": 0, "reason": "..."}`;

      const userPrompt = `NEW FACT: "${hecho}"\n\nEXISTING FACTS:\n${coincidencias.map((c, i) => `[${i + 1}] ${c.payload.data}`).join("\n")}`;

      try {
        const rawRes = await this.ejecutarAgente(this.getAgentsMatrix().ARBITRO_SEMANTICO, systemPrompt, userPrompt, true, signal);
        const data = JSON.parse(extractJsonPayload(rawRes));
        const idx = typeof data.replace_index === "number" ? data.replace_index : 0;
        if (idx > 0 && idx <= coincidencias.length) {
          const colision = coincidencias[idx - 1];
          if (colision && !idsProtegidos.includes(colision.id)) {
            const ok = this.store.deactivateMemoryFact(colision.id);
            if (!ok) {
              console.error(`❌ [COGNITIVE] Failed to deactivate collided fact ${colision.id}`);
            }
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError" || signal?.aborted) throw err;
        console.warn("⚠️ [COGNITIVE] Semantic Arbiter failed, keeping existing facts:", err.message);
      }
    } else if (!this.config.semanticArbitrator && coincidencias.length > 0 && coincidencias[0].score > 0.95) {
      const ok = this.store.insertMemoryFact(coincidencias[0].id, hecho, userId, vector, "system");
      if (!ok) {
        throw new Error(`Failed to update fact in SQLite: "${hecho.slice(0, 50)}..."`);
      }
      bypassInsert = true;
    }

    if (!bypassInsert) {
      const ok = this.store.insertMemoryFact(pointId, hecho, userId, vector, "system");
      if (!ok) {
        throw new Error(`Failed to insert fact in SQLite: "${hecho.slice(0, 50)}..."`);
      }
    }
  }

  public async guardarMemoria(texto: string, userId: string = this.config.userId, signal?: AbortSignal): Promise<void> {
    const matchMensaje = texto.match(/\[Mensaje a extraer\]: "(.*?)"/);
    const mensajePuro = matchMensaje ? matchMensaje[1].trim().toLowerCase() : texto.trim().toLowerCase();

    const regexBasura = /^[\s]*(hola|hello|hi|hey|ok|okay|okey|thanks|thank you|gracias|jaja|jajaja|simon|simón|va|dale|vale|listo|enterado|enterada|listisimo|listísima|buenas|buenos dias|buenas tardes|good morning|good afternoon|good evening|me parece bien|got it|sounds good|cool|sure|alright|yes|yeah|yep|bye|goodbye)[\s.?!]*$/i;
    if (regexBasura.test(mensajePuro) || mensajePuro.startsWith("simon me") || mensajePuro.startsWith("enterado list")) return;

    const defaultPortero = `Classify the input message into KNOWLEDGE (contains personal facts, preferences, or technical status), TRANSACTIONAL (small talk / empty chatter), or OPERATIONAL. Respond ONLY with the category name.`;
    const promptPortero = this.config.customPrompts?.gatekeeperSystem || this.config.customPrompts?.porteroSystem || defaultPortero;
    
    try {
      const cat = await this.ejecutarAgente(this.getAgentsMatrix().PORTERO, promptPortero, `Message: "${mensajePuro}"`, false, signal);
      if (cat.toUpperCase().includes("TRANSACTIONAL")) return;
    } catch (err: any) {
      if (err.name === "AbortError" || signal?.aborted) throw err;
      console.warn("⚠️ [COGNITIVE] Gatekeeper agent check failed, proceeding to notary:", err.message);
    }

    const defaultNotario = `You are an Atomic Fact Compiler. Your output MUST be strict JSON: {"hechos": [{"dato": "...", "cat": "PERSONAL|TECNICO"}]}.
The primary user is named ${this.config.userName}. Always replace pronouns with the exact user name. Always preserve and extract facts in the exact original language of the user. If the input is a question or inquiry, return {"hechos": []}.`;

    const promptDestilador = this.config.customPrompts?.notarySystem || this.config.customPrompts?.notarioSystem || defaultNotario;

    try {
      const rawRes = await this.ejecutarAgente(this.getAgentsMatrix().DESTILADOR, promptDestilador, `ANALYZE: "${texto}"`, true, signal);
      const jsonParseado = JSON.parse(extractJsonPayload(rawRes));

      if (jsonParseado.hechos && Array.isArray(jsonParseado.hechos)) {
        const idsProtegidos: string[] = [];
        for (const item of jsonParseado.hechos) {
          const hechoFinal = `[${item.cat}] ${item.dato}`;
          await this.inyectarHechoUnificado(hechoFinal, userId, idsProtegidos, signal);
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError" || signal?.aborted) throw e;
      console.error("❌ [COGNITIVE] Error in Notary Agent:", e.message);
    }
  }

  public async runAutoDream(userId: string = this.config.userId): Promise<string> {
    const AHORA = Date.now();
    const TTL_MS = this.config.dashboardTTLHours * 60 * 60 * 1000;

    let dashboardPrevio: Array<{ id: string; ts: number; txt: string }> = [];
    let fechaUltimaConsolidacion = new Date(AHORA - 24 * 60 * 60 * 1000).toISOString();

    const sqliteDash = this.store.getDashboardFact(userId);
    if (sqliteDash && sqliteDash.data) {
      fechaUltimaConsolidacion = sqliteDash.updated_at || fechaUltimaConsolidacion;
      try {
        const parsed = JSON.parse(sqliteDash.data);
        if (Array.isArray(parsed)) dashboardPrevio = parsed;
      } catch (_) {}
    }

    const dashboardVivo = dashboardPrevio.filter((item) => AHORA - item.ts < TTL_MS);
    const hechosPodadosTS = dashboardPrevio.length - dashboardVivo.length;

    const hechosNuevos = this.store.getRecentFactsSince(fechaUltimaConsolidacion, userId);

    if (hechosNuevos.length === 0) {
      if (hechosPodadosTS > 0) {
        const textoVector = dashboardVivo.map((d) => d.txt).join(". ") || "Sin novedades de estado.";
        const vector = await this.getEmbedding(textoVector);
        this.store.saveDashboardFact(JSON.stringify(dashboardVivo), userId, vector);
        return "Poda determinística de Pizarrón aplicada.";
      }
      return "Sin cambios detectados en Pizarrón.";
    }

    const defaultHistoriador = `You are the Active State Orchestrator (Dashboard Compiler). Return strict JSON: {"dashboard": [{"id": "...", "ts": 123, "txt": "..."}], "hechos_actualizados": []}. Always write active state summaries retaining the user's native language.`;
    const systemPrompt = this.config.customPrompts?.stateOrchestratorSystem || this.config.customPrompts?.historiadorSystem || defaultHistoriador;
    const userPrompt = `CURRENT_TIMESTAMP: ${AHORA}\nCURRENT_DASHBOARD: ${JSON.stringify(dashboardVivo)}\nNEW_FACTS: ${JSON.stringify(hechosNuevos)}`;

    try {
      const rawRes = await this.ejecutarAgente(this.getAgentsMatrix().HISTORIADOR, systemPrompt, userPrompt, true);
      const data = JSON.parse(extractJsonPayload(rawRes));

      const textoVector = data.dashboard.map((d: any) => d.txt).join(". ") || "Sin novedades de estado.";
      const vector = await this.getEmbedding(textoVector);

      this.store.saveDashboardFact(JSON.stringify(data.dashboard), userId, vector);

      if (data.hechos_actualizados && Array.isArray(data.hechos_actualizados)) {
        for (const h of data.hechos_actualizados) {
          await this.inyectarHechoUnificado(h, userId);
        }
      }
      return `AutoDream finalizado. Elementos vivos: ${data.dashboard.length}`;
    } catch (e: any) {
      console.error("❌ [AUTODREAM ERROR]:", e.message);
      return "Error en ejecución de AutoDream.";
    }
  }
}
