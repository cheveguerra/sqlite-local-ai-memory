# Contexto del Proyecto: sqlite-local-ai-memory

## 1. Estado y Versión
- **Versión:** 1.4.3 (Aislamiento Multi-Usuario del Pizarrón, Ancla de Entidades Determinista, Expansión `~` en Rutas y Blindaje `stderr` MCP)
- **Foco Activo:** Motor de memoria atómica local con salida dual AutoDream, Incubadora de casos abiertos y RAG Híbrido (FTS5 BM25 + Vectores Int8).
- **Naturaleza:** Biblioteca Node.js / TypeScript y Servidor MCP desacoplado 100% en inglés técnico.

## 2. Mapa de Componentes y Módulos
- **`MemoryEngine.ts`:** Fachada principal exportable (`save`, `saveFact`, `search`, `getDashboard`, `consolidate`, `addTurn`, `contextualizeQuery`).
- **`sqlite_store.ts`:** Motor SQLite bare-metal (TRUNCATE por defecto para discos de red/NFS/nube; WAL + mmap 256MB opcional en local vía `SQLITE_JOURNAL_MODE=WAL`). FTS5 BM25 + similitud coseno Int8 cuantizada en memoria.
- **`cognitive_agents.ts`:** Matriz de agentes de IA (`GATEKEEPER`, `QUERY_EXPANDER`, `NOTARY`, `STATE_ORCHESTRATOR`, `SEMANTIC_ARBITER`, `EMBEDDER`) con AutoDream dual y fallback multi-proveedor (Ollama / Gemini).
- **`mcp_server.ts`:** Servidor MCP estándar (Stdio) con herramientas `save_fact`, `search_memory`, `get_current_state`, `consolidate` y esquemas Zod.
- **`types.ts`:** Tipos e interfaces públicas (`MemoryConfig`, `AutoDreamResult`, `TriageItem`, `OpenCaseItem`, `MemoryHit`).
- **`stress_test.ts` / `multi_env_mcp_test.ts` / `test_autodream_dual.ts`:** Suite de pruebas de integración y estrés.

## 3. Persistencia y Base de Datos
- **Almacenamiento:** SQLite local (`memoria.db`).
- **Tablas:**
  - `recuerdos_fts`: Tabla virtual FTS5 (`point_id`, `user_id`, `data`, `source`, `created_at`).
  - `recuerdos_vectores`: Tabla relacional con BLOB cuantizado Int8 (`point_id`, `user_id`, `data`, `source`, `created_at`, `vector_blob`, `PRIMARY KEY (point_id, user_id)`).
- **Pizarrón (Estado Consolidado):** UUID especial `00000000-0000-0000-0000-000000000000`.
- **Requerimientos BD para Dimensión Configurable (ej. OpenAI 1536 dims / 384 / 1024):**
  * El schema actual (`BLOB` en `recuerdos_vectores`) ya es agnóstico en tamaño binario (almacena 768 bytes para 768d, 1536 bytes para 1536d en Int8).
  * **Tabla de Control Requerida:** `CREATE TABLE IF NOT EXISTS memory_settings (key TEXT PRIMARY KEY, value TEXT);` para fijar `embedding_dim` y `embedding_model` por base de datos.
  * **Aislamiento de Espacio Latente:** La base de datos debe validar al inicio que la dimensión del embedder configurado coincida con `memory_settings.embedding_dim`.
  * **Protocolo de Migración:** Si el usuario cambia el modelo de embedding en una BD existente, los vectores antiguos quedan matemáticamente incompatibles (prohibido mezclar espacios latentes); se requiere purgar los blobs (`vector_blob = NULL`) y ejecutar `backfillMissingVectors()` con el nuevo modelo.

## 4. Reglas Críticas e Invariantes
- **Publicación Pública (100% Inglés):** Todos los métodos, tipos, parámetros y prompts están escritos en inglés técnico.
- **Salida Dual AutoDream (`consolidate`):** Genera `narrativeSummary` + `dashboard` (Pizarrón), `triageMemory` (4 bloques atómicos técnicos) y `openCases` (Incubadora).
- **Ventana Dinámica (Opción B):** Si existen casos abiertos en la Incubadora, AutoDream expande dinámicamente el rango `getRecentFactsSince` a la fecha de creación del caso más antiguo (`minTs`), garantizando cero pérdida semántica.
- **Auto-Archivado de Inconclusos (`[UNRESOLVED_CASE]`):** Si un caso en incubadora expira por TTL de inactividad, se auto-compila a `memoria.db` como `[UNRESOLVED_CASE]` antes de purgar el Pizarrón.
- **Normalización de URLs de Ollama:** `getOllamaApiUrl()` desinfecta por regex cualquier sufijo (`/api/chat`, `/api/generate`, `/chat`, `/`) asegurando la base `/api`.
- **Context Window de Ollama:** Ajustado a `num_ctx: 4096` tokens.

- **Enrutamiento Universal de Modelos (`PROVIDER/MODEL`):** Soporte agnóstico para prefijos `gemini/...`, `ollama/...`, `openai/...` y `openrouter/...` desacoplado de heurísticas de nombres.
- **Bypass Opcional en Query Expander:** `EXPANDER_MODEL` admite `none` o vacío para desactivar el agente, ejecutando búsquedas literales en 0 ms sin costo de API ni riesgo de envenenamiento léxico en FTS5.
- **Protección de Agentes Esenciales:** `GATEKEEPER`, `NOTARY`, `STATE_ORCHESTRATOR` y `SEMANTIC_ARBITER` son indispensables. Si se configuran con `off`/`none`/`disabled`, el sistema emite `console.error` explicativo y aplica fallback defensivo a los modelos por defecto.
- **Plantilla `.env.example`:** Documentación completa de variables, endpoints y modelos recomendados.
- **Invariante de Espacio Vectorial Único:** Una base de datos `memoria.db` solo puede contener vectores pertenecientes al mismo modelo y dimensión; nunca mezclar embeddings de proveedores o dimensiones distintas en el cálculo de similitud coseno.

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
- [x] Implementar Ring Buffer efímero en RAM con `addTurn(role, text)` para contexto conversacional vivo.
- [x] Implementar Smart Gate en `search()` que activa el Bibliotecario solo cuando hay turnos en RAM o `history` en MCP (0 ms directo si está vacío).
- [x] Eliminar bypass invertido de 50 caracteres en `contextualizeQuery` y forzar formato JSON estructurado.
- [x] Agregar filtro estático de stopwords (ES/EN) en `searchFTS5` para eliminar dilución léxica BM25.
- [x] Agregar parámetro opcional `history` a herramienta MCP `search_memory`.
- [x] Integrar `addTurn("user")` y `addTurn("assistant")` en Bot2 (`app.ts`) eliminando el bypass local de 60 chars.
- [x] (v1.4.1) Implementar desalojo LRU en `turnBuffers` de `MemoryEngine.ts` para evitar memory leaks multi-usuario.
- [x] (v1.4.1) Migrar telemetría a `fs.WriteStream` evitando agotamiento de file descriptors (EMFILE).
- [x] (v1.4.1) Sanitizar inyección de tags de corchetes en `cognitive_agents.ts`.
- [x] (v1.4.1) Sincronizar versión de `mcp_server.ts` a 1.4.1 y agregar `userId` a todas las herramientas MCP.
- [x] (v1.4.1) Implementar `createEssentialConfig` con advertencias en consola para agentes cognitivos esenciales ante valores `off`/`disabled`.
- [x] (v1.4.1) Compilar y certificar build limpio de TypeScript (`npm run build`).
- [x] (v1.4.2) Stream de telemetría resiliente: listener de error en `fs.WriteStream` para evitar crashes ante fallos de I/O (FIX-1).
- [x] (v1.4.2) Fallback Gemini de embeddings con timeout (10s) y AbortController para prevenir bloqueos indefinidos en KeyedMutex (FIX-2).
- [x] (v1.4.2) Eliminación previa en FTS5 (`DELETE` antes de `INSERT`) para evitar filas duplicadas u obsoletas en actualizaciones in-place (FIX-3).
- [x] (v1.4.2) Creación recursiva del directorio padre en `resolveDatabasePath()` para respetar rutas personalizadas en `SQLITE_MEM_PATH` (FIX-4).
- [x] (v1.4.2) Guarda anti-inyección (`ANTI_INJECTION_GUARD`) integrada en el prompt de sistema del Query Expander (FIX-5).
- [x] (v1.4.2) Sanitización de tags en `source` a nivel de librería (`injectUnifiedFact` y `saveMemory`) para robustecer el guardrail determinista (FIX-6).
- [x] (v1.4.2) Compilación y certificación de build limpio de TypeScript (`npm run build`).
- [x] (v1.4.3) Clave primaria compuesta `(point_id, user_id)` y aislamiento de `DASHBOARD_UUID` en búsquedas y desactivación.
- [x] (v1.4.3) Eliminación de defaults personales y prevención de re-ingestión de tarjetas de triaje y anclas deterministas en `runAutoDream`.
- [x] (v1.4.3) Expansión de `~` (tilde) en rutas `SQLITE_MEM_PATH`, `dbPath` y `telemetryPath` para prevenir errores de Cold Start en clientes MCP.
- [x] (v1.4.3) Unificación total de avisos a `console.error` para blindar el canal `stdio` JSON-RPC y documentación de `saveFact`/`addTurn` en `README.md`.
- [ ] (Roadmap v1.5.0) Desacoplar constante rígida `EMBEDDING_DIM = 768` para soportar modelos Cloud de 1536 dimensiones (OpenAI text-embedding-3-small) y modelos ligeros de 384/1024 dims.
- [ ] (Roadmap v1.5.0) Implementar tabla `memory_settings` en SQLite para persistir y validar dimensión/modelo activo con auto-migración/re-indexado.

