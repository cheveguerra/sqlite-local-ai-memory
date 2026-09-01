# Contexto del Proyecto: sqlite-local-ai-memory

## 1. Estado y Versión
- **Versión:** 1.0.0 (Lista para publicación NPM / GitHub)
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

## 5. Tareas Pendientes
- [x] Aplicar inyección de alias `memory` en `sqlite_store.ts` para retrocompatibilidad.
- [x] Normalizar endpoints de Ollama a `/api/` en `cognitive_agents.ts` con desinfección Regex.
- [x] Implementar extracción dual en AutoDream (4 bloques estructurados + resumen narrativo).
- [x] Implementar Incubadora de casos abiertos (`open_cases`).
- [x] Implementar Ventana Dinámica de Consulta (Opción B) basada en fecha de inicio del caso.
- [x] Implementar auto-archivado de casos inconclusos por expiración de TTL (`[UNRESOLVED_CASE]`).
- [x] Refactorizar 100% del código, prompts y tipos a inglés técnico puro.
