# Contexto del Proyecto: sqlite-local-ai-memory

## 1. Estado y Versión
- **Versión:** 1.2.0 (Lista para publicación NPM / GitHub)
- **Foco Activo:** Motor de memoria atómica local con salida dual AutoDream, Incubadora de casos abiertos y RAG Híbrido (FTS5 BM25 + Vectores Int8).
- **Naturaleza:** Biblioteca Node.js / TypeScript y Servidor MCP desacoplado 100% en inglés técnico.

## 2. Mapa de Componentes y Módulos
- **`MemoryEngine.ts`:** Fachada principal exportable (`save`, `saveFact`, `search`, `getDashboard`, `consolidate`, `contextualizeQuery`).
- **`sqlite_store.ts`:** Motor SQLite bare-metal (WAL + mmap 256MB). FTS5 BM25 + similitud coseno Int8 cuantizada en memoria.
- **`cognitive_agents.ts`:** Matriz de agentes de IA (`GATEKEEPER`, `QUERY_EXPANDER`, `NOTARY`, `STATE_ORCHESTRATOR`, `SEMANTIC_ARBITER`, `EMBEDDER`) con AutoDream dual y fallback multi-proveedor (Ollama / Gemini).
- **`mcp_server.ts`:** Servidor MCP estándar (Stdio) con herramientas `save_fact`, `search_memory`, `get_current_state` y esquemas Zod.
- **`types.ts`:** Tipos e interfaces públicas (`MemoryConfig`, `AutoDreamResult`, `TriageItem`, `OpenCaseItem`, `MemoryHit`).
- **`stress_test.ts` / `multi_env_mcp_test.ts` / `test_autodream_dual.ts`:** Suite de pruebas de integración y estrés.

## 3. Persistencia y Base de Datos
- **Almacenamiento:** SQLite local (`memoria.db`).
- **Tablas:**
  - `recuerdos_fts`: Tabla virtual FTS5 (`point_id`, `user_id`, `data`, `source`, `created_at`).
  - `recuerdos_vectores`: Tabla relacional con BLOB cuantizado Int8 (`point_id`, `user_id`, `data`, `source`, `created_at`, `vector_blob`).
- **Pizarrón (Estado Consolidado):** UUID especial `00000000-0000-0000-0000-000000000000`.

## 4. Reglas Críticas e Invariantes
- **Publicación Pública (100% Inglés):** Todos los métodos, tipos, parámetros y prompts están escritos en inglés técnico.
- **Salida Dual AutoDream (`consolidate`):** Genera `narrativeSummary` + `dashboard` (Pizarrón), `triageMemory` (4 bloques atómicos técnicos) y `openCases` (Incubadora).
- **Ventana Dinámica (Opción B):** Si existen casos abiertos en la Incubadora, AutoDream expande dinámicamente el rango `getRecentFactsSince` a la fecha de creación del caso más antiguo (`minTs`), garantizando cero pérdida semántica.
- **Auto-Archivado de Inconclusos (`[UNRESOLVED_CASE]`):** Si un caso en incubadora expira por TTL de inactividad, se auto-compila a `memoria.db` como `[UNRESOLVED_CASE]` antes de purgar el Pizarrón.
- **Normalización de URLs de Ollama:** `getOllamaApiUrl()` desinfecta por regex cualquier sufijo (`/api/chat`, `/api/generate`, `/chat`, `/`) asegurando la base `/api`.
- **Context Window de Ollama:** Ajustado a `num_ctx: 4096` tokens.

- **Enrutamiento Universal de Modelos (`PROVIDER/MODEL`):** Soporte agnóstico para prefijos `gemini/...`, `ollama/...`, `openai/...` y `openrouter/...` desacoplado de heurísticas de nombres.
- **Bypass Opcional en Query Expander:** `EXPANDER_MODEL` admite `none` o vacío para desactivar el agente, ejecutando búsquedas literales en 0 ms sin costo de API ni riesgo de envenenamiento léxico en FTS5.
- **Plantilla `.env.example`:** Documentación completa de variables, endpoints y modelos recomendados.

## 5. Tareas Pendientes
- [x] Aplicar inyección de alias `memory` en `sqlite_store.ts` para retrocompatibilidad.
- [x] Normalizar endpoints de Ollama a `/api/` en `cognitive_agents.ts` con desinfección Regex.
- [x] Implementar extracción dual en AutoDream (4 bloques estructurados + resumen narrativo).
- [x] Implementar Incubadora de casos abiertos (`open_cases`).
- [x] Implementar Ventana Dinámica de Consulta (Opción B) basada en fecha de inicio del caso.
- [x] Implementar auto-archivado de casos inconclusos por expiración de TTL (`[UNRESOLVED_CASE]`).
- [x] Refactorizar 100% del código, prompts y tipos a inglés técnico puro.
- [x] Documentar matriz de roles cognitivos, requerimientos de modelos y topología híbrida (Edge SLM + Cloud Reasoning) en README.md.
- [x] Implementar parser universal `PROVIDER/MODEL` y bypass de 0 ms para `QUERY_EXPANDER`.
- [x] Crear plantilla `.env.example`.
- [x] Documentar patrones de consumo arquitectónico (Pure RAG vs Continuous Stateful Agent) con ejemplo balanceado de migración Postgres (especialista factual vs copiloto operativo) en README.md.
- [x] Unificar nombre de herramienta MCP a 'consolidate' (idéntico a memory.consolidate() del SDK) sin deuda técnica de alias.
- [x] Documentar ciclo de vida de consolidación (AutoDream): qué hace, por qué no corre en cada turno, patrones SDK (teardown, debounce, cron), modo MCP y prevención de deriva temporal en proyectos multisesión.
