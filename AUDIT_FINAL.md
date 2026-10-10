# Auditoría Arquitectónica Final — `sqlite-local-ai-memory` v1.3.2

**Fecha:** 2026-09-08  
**Auditor:** Staff Engineer (Triangulación de Modelo A + Modelo B + código fuente)  
**Objetivo:** Veredicto definitivo pre-release con instrucciones de implementación para Claude Sonnet.  
**Archivos auditados:** `cognitive_agents.ts`, `mcp_server.ts`, `MemoryEngine.ts`, `sqlite_store.ts`, `types.ts`, `index.ts`, `package.json`, `tsconfig.json`

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Cambios Aprobados (IMPLEMENTAR)](#cambios-aprobados-implementar)
   - [FIX-1: getEmbedding() nunca inicializa Gemini para fallback](#fix-1-getembedding-nunca-inicializa-gemini-para-fallback)
   - [FIX-2: getRecentFactsSince() no filtra hechos desactivados](#fix-2-getrecentfactssince-no-filtra-hechos-desactivados)
   - [FIX-3: Archivado duplicado de incubadora ante fallo del orquestador](#fix-3-archivado-duplicado-de-incubadora-ante-fallo-del-orquestador)
   - [FIX-4: Subir piso de axios a versión parcheada](#fix-4-subir-piso-de-axios-a-versión-parcheada)
   - [FIX-5: Guard de API key en OpenRouter/OpenAI](#fix-5-guard-de-api-key-en-openrouteropenai)
   - [FIX-6: Cerrar superficie pública de CognitiveAgents y SqliteStore](#fix-6-cerrar-superficie-pública-de-cognitiveagents-y-sqlitestore)
   - [FIX-7: Race condition de AbortSignal en rama Gemini](#fix-7-race-condition-de-abortsignal-en-rama-gemini)
   - [FIX-8: Acotar scan vectorial con LIMIT duro](#fix-8-acotar-scan-vectorial-con-limit-duro)
3. [Cambios Rechazados (NO IMPLEMENTAR)](#cambios-rechazados-no-implementar)
4. [Orden de Implementación](#orden-de-implementación)
5. [Verificación Post-Implementación](#verificación-post-implementación)

---

## Resumen Ejecutivo

Se triangularon dos análisis independientes (Modelo A y Modelo B) contra el código fuente real. Modelo B fue significativamente más riguroso: identificó 4 bugs funcionales reales que Modelo A no detectó. Modelo A acertó en una race condition pero exageró o se equivocó en sus otros hallazgos principales (fuga de sockets, SRP).

**Balance:**
- **8 cambios aprobados** — 4 son bugs bloqueantes pre-release, 4 son mejoras altamente recomendadas
- **9 sugerencias rechazadas** — sobre-ingeniería, falsos positivos, o prematuros para este release

**Severidad de los cambios aprobados:**

| # | Severidad | Archivo | Descripción |
|---|-----------|---------|-------------|
| FIX-1 | 🔴 CRÍTICO | `cognitive_agents.ts` | Fallback de embeddings Gemini nunca se activa |
| FIX-2 | 🔴 CRÍTICO | `sqlite_store.ts` | Hechos desactivados reaparecen en consolidación |
| FIX-3 | 🔴 CRÍTICO | `cognitive_agents.ts` | Archivado duplicado de incubadora |
| FIX-4 | 🔴 CRÍTICO | `package.json` | Piso de axios vulnerable |
| FIX-5 | 🟠 ALTO | `cognitive_agents.ts` | Bearer undefined en OpenRouter/OpenAI |
| FIX-6 | 🟠 ALTO | `index.ts` | CognitiveAgents exportado sin mutex |
| FIX-7 | 🟠 ALTO | `cognitive_agents.ts` | Race condition AbortSignal Gemini |
| FIX-8 | 🟠 ALTO | `sqlite_store.ts` | Scan vectorial no acotado |

---

## Cambios Aprobados (IMPLEMENTAR)

---

### FIX-1: `getEmbedding()` nunca inicializa Gemini para fallback

**Origen:** Modelo B (§1.4/3.1). Modelo A no lo detectó.

**Archivo:** `src/cognitive_agents.ts`, línea 238.

**El Bug:**

El método `getEmbedding()` tiene un fallback a Gemini Cloud después de intentar Ollama. Pero el fallback verifica `if (this.genAI)`, y `this.genAI` es un campo privado que solo se puebla lazily dentro de `getGenAIClient()`. El problema es que `getEmbedding()` **nunca llama a `getGenAIClient()`** — solo lee el campo ya memoizado. `getGenAIClient()` solo se invoca desde la rama `provider === "gemini"` de `executeAgent()`.

**Escenario de reproducción:**

1. Configurar solo `GEMINI_API_KEY` (Ollama apagado — escenario "Cloud Only").
2. La primera operación del proceso es `save_fact` → `injectUnifiedFact` → `getEmbedding`.
3. `getEmbedding()` intenta Ollama → falla (conexión rechazada).
4. Llega al fallback Gemini: `if (this.genAI)` → `this.genAI` es `null` → se salta silenciosamente.
5. Retorna `[]`. Búsqueda vectorial inutilizada **para toda la sesión del proceso**.

**Código actual (ANTES):**

```typescript
// cognitive_agents.ts, línea ~238
// 2. Fallback to Gemini Cloud gemini-embedding-001 (768 Matryoshka dimensions)
if (this.genAI) {   // ← BUG: nunca llama a getGenAIClient()
  try {
    const embedModel = this.genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    // ...
```

**Código corregido (DESPUÉS):**

```typescript
// cognitive_agents.ts, línea ~238
// 2. Fallback to Gemini Cloud gemini-embedding-001 (768 Matryoshka dimensions)
const genAI = await this.getGenAIClient();  // ← FIX: inicializar lazily
if (genAI) {
  try {
    const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    // ... resto del bloque sin cambios, pero usar `genAI` en vez de `this.genAI`
```

**Instrucciones para Claude Sonnet:**

1. En `src/cognitive_agents.ts`, localizar el método `getEmbedding()` (comienza en línea 212).
2. Encontrar el comentario `// 2. Fallback to Gemini Cloud` (línea ~237).
3. Reemplazar `if (this.genAI) {` por:
   ```typescript
   const genAI = await this.getGenAIClient();
   if (genAI) {
   ```
4. Dentro de ese bloque `if`, reemplazar `this.genAI.getGenerativeModel` por `genAI.getGenerativeModel` (línea ~240).
5. No tocar nada más del método.

**Pros:**
- Corrige un bug silencioso de alta severidad que inutiliza la búsqueda vectorial en modo Cloud Only.
- Cambio mínimo (2 líneas), riesgo de regresión cercano a cero.
- `getGenAIClient()` ya maneja su propia memoización (`if (this.genAI) return this.genAI`), así que no hay costo extra.

**Contras:**
- Ninguno.

---

### FIX-2: `getRecentFactsSince()` no filtra hechos desactivados

**Origen:** Modelo B (§1.2, §3.3). Modelo A no lo detectó.

**Archivo:** `src/sqlite_store.ts`, líneas 323-328.

**El Bug:**

`deactivateMemoryFact()` marca un hecho como obsoleto poniendo `source = 'inactive'` y `vector_blob = NULL` en `recuerdos_vectores`, pero no borra la fila. `getRecentFactsSince()`, usada por `runAutoDream` para construir `NEW_FACTS`, **no filtra** las filas con `source = 'inactive'`. Resultado: un hecho que el Semantic Arbiter marcó como superado (ej. una IP vieja reemplazada por una nueva) puede reaparecer en `NEW_FACTS` del siguiente ciclo de consolidación, contaminando el resumen narrativo con información ya obsoleta.

**Código actual (ANTES):**

```typescript
// sqlite_store.ts, líneas 323-328
let query = `
  SELECT data, source
  FROM recuerdos_vectores
  WHERE user_id = ? AND point_id != ?
    AND created_at >= ?
`;
```

**Código corregido (DESPUÉS):**

```typescript
// sqlite_store.ts, líneas 323-328
let query = `
  SELECT data, source
  FROM recuerdos_vectores
  WHERE user_id = ? AND point_id != ?
    AND created_at >= ?
    AND source != 'inactive'
`;
```

**Instrucciones para Claude Sonnet:**

1. En `src/sqlite_store.ts`, localizar el método `getRecentFactsSince()` (comienza en línea 317).
2. Encontrar la query SQL (líneas 323-328).
3. Agregar `AND source != 'inactive'` como última condición del `WHERE`, antes del cierre de backtick.
4. No tocar nada más del método.

**Pros:**
- Corrige un bug de integridad de datos: hechos zombie no contaminan el pipeline de consolidación.
- Cambio de una sola línea SQL, sin riesgo de regresión.
- Compatible con el esquema actual — no requiere migración de BD.

**Contras:**
- Si en el futuro se cambia el mecanismo de soft-delete (ej. columna `active`), habría que actualizar esta condición. Pero eso es un problema futuro que no justifica no parchear ahora.

---

### FIX-3: Archivado duplicado de incubadora ante fallo del orquestador

**Origen:** Modelo B (§1.4/3.4). Modelo A no lo detectó.

**Archivo:** `src/cognitive_agents.ts`, líneas 702-962.

**El Bug:**

El flujo actual de `runAutoDream()` es:

1. Calcula `activeDashboard` (podado por TTL) y `expiredItems` (líneas 702-704).
2. Para cada `expiredItem` que es un caso de incubadora, llama a `injectUnifiedFact()` — esto **persiste inmediatamente** un hecho `[UNRESOLVED_CASE]` en SQLite (línea 712). Esto ocurre **antes** del bloque `try` del orquestador.
3. Si hay `newFacts`, invoca al LLM orquestador dentro de un `try` (línea 788).
4. Si el orquestador falla (red, proveedores caídos, JSON inválido), cae al `catch` de la línea 949, que retorna `dashboard: activeDashboard` **solo en memoria** — pero `saveDashboardFact()` **nunca se ejecuta** en esa rama.

**Consecuencia:** El hecho archivado en el paso 2 queda persistido, pero el dashboard en SQLite aún tiene la entrada expirada (nunca se sobrescribió). En el siguiente ciclo de `consolidate()`, el mismo ítem vuelve a evaluarse como expirado y se re-archiva, generando un `[UNRESOLVED_CASE]` duplicado. Esto se repite en cada fallo.

**Código actual (ANTES):** No hay persistencia intermedia del dashboard podado.

**Código corregido (DESPUÉS):**

```typescript
// cognitive_agents.ts — INSERTAR después de la línea 714 (después del loop de archivado)
// y ANTES de la línea 716 (cálculo de ventana dinámica)

// FIX: Persistir de inmediato el dashboard podado ANTES de intentar el LLM orquestador.
// Así, si el orquestador falla después, el archivado ya realizado no queda huérfano
// y el mismo caso nunca se re-archiva en el próximo ciclo.
if (prunedFactsCount > 0) {
  this.store.saveDashboardFact(JSON.stringify(activeDashboard), userId, []);
}
```

**Instrucciones para Claude Sonnet:**

1. En `src/cognitive_agents.ts`, localizar el método `runAutoDream()` (comienza en línea 682).
2. Encontrar el cierre del loop `for (const item of expiredItems)` que archiva casos de incubadora (cierra en línea 714 con `}`).
3. Inmediatamente después de ese `}` y **antes** del comentario `// Option B: Calculate dynamic consolidation window` (línea 716), insertar las 4 líneas del bloque de código de arriba.
4. **Importante:** Se pasa `[]` como vector (array vacío) al `saveDashboardFact` intermedio para no forzar una llamada a embeddings solo para el guardado intermedio. El guardado final tras el orquestador exitoso (línea 904) ya recalcula el vector real sobre el dashboard completo. Esto es intencional y correcto.

**Pros:**
- Corrige un bug de integridad de datos que corrompe la memoria de largo plazo con duplicados ante fallos transitorios — exactamente el tipo de evento para el que este sistema debería ser resiliente.
- Cambio de 4 líneas, aislado, sin efecto secundario sobre el flujo exitoso.

**Contras:**
- Si hay `prunedFactsCount > 0` pero no hubo archivado de incubadora (solo items normales expirados), se hace un write extra a SQLite. Pero `saveDashboardFact` es una operación barata (INSERT OR REPLACE de un solo row) y el trade-off es trivial frente al bug que corrige.

---

### FIX-4: Subir piso de axios a versión parcheada

**Origen:** Modelo B (§1.3). Modelo A mencionó sockets pero no CVEs.

**Archivo:** `package.json`, línea 45.

**El Problema:**

`package.json` declara `"axios": "^1.7.9"`. El rango `^` permite resolver a versiones superiores en instalación fresca, pero el piso declarado en el manifiesto es peligrosamente obsoleto. Versiones por debajo de 1.15.0 tienen CVE-2026-40175 (CVSS 10.0 — prototype pollution + SSRF + request smuggling). Para un paquete publicado en npm, el piso mínimo del manifiesto debe ser explícitamente parcheado, porque:
- Lockfiles congelados antes de la corrección no resolverán a la versión parcheada.
- Auditorías automatizadas (Socket, Snyk, `npm audit`) leen literalmente el rango declarado.

**Código actual (ANTES):**

```json
"axios": "^1.7.9",
```

**Código corregido (DESPUÉS):**

```json
"axios": "^1.15.1",
```

**Instrucciones para Claude Sonnet:**

1. En `package.json`, línea 45, cambiar `"^1.7.9"` a `"^1.15.1"`.
2. Ejecutar `npm install` para actualizar el lockfile.
3. Ejecutar `npm audit` y verificar que no hay vulnerabilidades pendientes.
4. Ejecutar `npm run build` para confirmar que no hay breaking changes en la nueva versión de axios.

**Pros:**
- Cierra una vulnerabilidad crítica de cadena de suministro.
- Axios 1.15.x es retrocompatible con 1.7.x — no hay breaking changes.

**Contras:**
- Requiere regenerar `package-lock.json`. Verificar que no haya efectos colaterales en CI si aplica.

---

### FIX-5: Guard de API key en OpenRouter/OpenAI

**Origen:** Modelo B (§1.4/3.2). Modelo A no lo detectó.

**Archivo:** `src/cognitive_agents.ts`, líneas 333-362.

**El Bug:**

La rama `openrouter`/`openai` de `executeAgent()` no verifica si hay API key antes de construir el request HTTP. A diferencia de la rama Gemini (que tiene un guard en L296-299: `if (!genAI) { ...; continue; }`), esta rama envía el request con `Authorization: Bearer undefined`, desperdiciando un round-trip, generando un 401 confuso en logs, y exponiendo el literal `Bearer undefined` a endpoints potencialmente no confiables.

**Código actual (ANTES):**

```typescript
// cognitive_agents.ts, líneas 333-362
} else if (config.provider === "openrouter" || config.provider === "openai") {
  const isOpenRouter = config.provider === "openrouter";
  const apiKey = isOpenRouter
    ? (this.config.openRouterApiKey || process.env.OPENROUTER_API_KEY)
    : (process.env.OPENAI_API_KEY || this.config.openRouterApiKey);
  const defaultEndpoint = isOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : // ...
  // ... arma el request y lo envía sin verificar apiKey
```

**Código corregido (DESPUÉS):**

```typescript
} else if (config.provider === "openrouter" || config.provider === "openai") {
  const isOpenRouter = config.provider === "openrouter";
  const apiKey = isOpenRouter
    ? (this.config.openRouterApiKey || process.env.OPENROUTER_API_KEY)
    : (process.env.OPENAI_API_KEY || this.config.openRouterApiKey);

  // FIX: no enviar request sin API key — patrón idéntico a la rama Gemini
  if (!apiKey) {
    console.warn(`⚠️ [COGNITIVE] Agent [${agentConfig.desc}]: ${config.provider} configured but no API key available. Skipping provider.`);
    continue;
  }

  const defaultEndpoint = isOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : // ... resto sin cambios
```

**Instrucciones para Claude Sonnet:**

1. En `src/cognitive_agents.ts`, localizar la rama `openrouter`/`openai` de `executeAgent()` (línea 333).
2. Después de la asignación de `apiKey` (línea 337), y **antes** de la asignación de `defaultEndpoint` (línea 338), insertar el bloque `if (!apiKey)` de arriba.
3. No tocar nada más de la rama.

**Pros:**
- Evita round-trips desperdiciados, errores 401 confusos, y exposición del literal `Bearer undefined`.
- Patrón consistente con la rama Gemini que ya tiene este guard.

**Contras:**
- Ninguno.

---

### FIX-6: Cerrar superficie pública de `CognitiveAgents` y `SqliteStore`

**Origen:** Modelo B (§1.4 concurrencia). Modelo A lo mencionó tangencialmente (SRP) pero no identificó el vector de ataque real.

**Archivo:** `src/index.ts`, líneas 8-9.

**El Problema:**

`CognitiveAgents` y `SqliteStore` se exportan públicamente desde `index.ts`:
```typescript
export { CognitiveAgents } from "./cognitive_agents.js";
export { SqliteStore } from "./sqlite_store.js";
```

`CognitiveAgents.injectUnifiedFact()` hace una secuencia *leer → `await` LLM (cientos de ms a 30s) → escribir* sin ningún lock propio. Toda la garantía de serialización viene del `KeyedMutex` de `MemoryEngine`. Cualquier consumidor de la librería que importe `CognitiveAgents` directamente y llame a `injectUnifiedFact`/`saveMemory`/`runAutoDream` en paralelo para el mismo userId **pierde silenciosamente toda protección contra race conditions**.

**Código actual (ANTES):**

```typescript
// index.ts
export { MemoryEngine } from "./MemoryEngine.js";
export { CognitiveAgents } from "./cognitive_agents.js";
export { SqliteStore } from "./sqlite_store.js";
export * from "./types.js";
```

**Código corregido (DESPUÉS):**

```typescript
// index.ts
export { MemoryEngine } from "./MemoryEngine.js";
export * from "./types.js";
```

**Instrucciones para Claude Sonnet:**

1. En `src/index.ts`, eliminar las líneas 8 y 9 (las que exportan `CognitiveAgents` y `SqliteStore`).
2. Verificar que ningún archivo de test en `src/` importe directamente desde `"../index.js"` esperando `CognitiveAgents` o `SqliteStore`. Los tests actuales (`stress_test.ts`, `multi_env_mcp_test.ts`, etc.) importan desde `"./MemoryEngine.js"` o `"./cognitive_agents.js"` directamente, así que no deberían verse afectados.
3. Ejecutar `npm run build` para confirmar compilación limpia.

**Pros:**
- Cierra el vector de bypass del mutex de concurrencia de raíz, sin añadir complejidad.
- `MemoryEngine` sigue siendo la fachada pública con el `KeyedMutex`.
- Consumidores avanzados que realmente necesiten acceso interno pueden importar directamente del archivo (`import { CognitiveAgents } from "sqlite-local-ai-memory/dist/cognitive_agents.js"`), pero ya no se anuncia como API pública soportada.

**Contras:**
- Es un **breaking change** para cualquier consumidor que ya esté importando `CognitiveAgents` o `SqliteStore` desde el entry point. Dado que la v1.3.2 no ha sido publicada en npm todavía, esto no tiene impacto real. Si ya hubiese consumidores, habría que subir la versión a 2.0.0 (SemVer).

---

### FIX-7: Race condition de AbortSignal en rama Gemini

**Origen:** Modelo A (hallazgo §1). Modelo B no lo mencionó explícitamente.

**Archivo:** `src/cognitive_agents.ts`, líneas 295-318.

**El Bug:**

El código actual verifica `signal?.aborted` al inicio del loop del `for` (línea 270), luego hace `const genAI = await this.getGenAIClient()` (línea 295). Si la señal se aborta **durante** ese `await`, el evento "abort" se dispara antes de que se llegue a la línea `signal.addEventListener("abort", parentAbortHandler)` (línea 318). El `parentAbortHandler` nunca se registra, así que el `abortController` interno no recibe la señal de cancelación del padre. La llamada al LLM se queda colgada hasta que el `setTimeout` manual la mata.

**Ventana de oportunidad:** El `await this.getGenAIClient()` es una operación rápida (dynamic import memoizado), pero en la primera ejecución del proceso, el `import("@google/generative-ai")` puede tardar decenas de milisegundos, abriendo la ventana.

**Código actual (ANTES):**

```typescript
// cognitive_agents.ts, líneas 294-318
} else if (config.provider === "gemini") {
  const genAI = await this.getGenAIClient();
  if (!genAI) {
    console.warn(`⚠️ [COGNITIVE] Agent [${agentConfig.desc}]: Gemini configured but no API key/client available. Skipping provider.`);
    continue;
  }
  const model = genAI.getGenerativeModel({ /* ... */ });
  // ...
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(/* ... */), timeoutMs);
  const parentAbortHandler = () => abortController.abort();
  if (signal) signal.addEventListener("abort", parentAbortHandler, { once: true });
```

**Código corregido (DESPUÉS):**

```typescript
} else if (config.provider === "gemini") {
  const genAI = await this.getGenAIClient();
  if (!genAI) {
    console.warn(`⚠️ [COGNITIVE] Agent [${agentConfig.desc}]: Gemini configured but no API key/client available. Skipping provider.`);
    continue;
  }
  const model = genAI.getGenerativeModel({ /* ... */ });
  // ...
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(new Error(`Gemini timeout after ${timeoutMs}ms`)), timeoutMs);
  const parentAbortHandler = () => abortController.abort();

  // FIX: Verificar si la señal se abortó DURANTE el await de getGenAIClient()
  if (signal?.aborted) {
    clearTimeout(timeoutId);
    const abortErr = new Error("Execution aborted by signal");
    abortErr.name = "AbortError";
    throw abortErr;
  }
  if (signal) signal.addEventListener("abort", parentAbortHandler, { once: true });
```

**Instrucciones para Claude Sonnet:**

1. En `src/cognitive_agents.ts`, localizar la rama Gemini de `executeAgent()` (línea 294).
2. Encontrar la línea `if (signal) signal.addEventListener("abort", parentAbortHandler, { once: true });` (línea 318).
3. **Antes** de esa línea, insertar:
   ```typescript
   // FIX: Verificar si la señal se abortó DURANTE el await de getGenAIClient()
   if (signal?.aborted) {
     clearTimeout(timeoutId);
     const abortErr = new Error("Execution aborted by signal");
     abortErr.name = "AbortError";
     throw abortErr;
   }
   ```
4. Cambiar la línea original de:
   ```typescript
   if (signal) signal.addEventListener("abort", parentAbortHandler, { once: true });
   ```
   a que **solo** se ejecute en el `else` implícito (ya que si `signal.aborted` es true, lanzamos error arriba). En la práctica no necesita cambiar porque el `throw` sale antes, pero la intención queda más clara si se convierte en `else if`:
   ```typescript
   if (signal?.aborted) {
     clearTimeout(timeoutId);
     const abortErr = new Error("Execution aborted by signal");
     abortErr.name = "AbortError";
     throw abortErr;
   } else if (signal) {
     signal.addEventListener("abort", parentAbortHandler, { once: true });
   }
   ```

**Pros:**
- Cierra la ventana de race condition donde la señal de aborto se pierde entre el `await getGenAIClient()` y el `addEventListener`.
- El `throw` es capturado por el `catch` existente del loop (línea 364) que ya maneja `AbortError` correctamente.

**Contras:**
- La ventana de oportunidad es estrecha (decenas de ms solo en la primera invocación). El impacto práctico es bajo, pero el fix es trivial y el principio de "cierre defensivo" es correcto para un componente de producción.

---

### FIX-8: Acotar scan vectorial con LIMIT duro

**Origen:** Modelo B (§1.2, §2.4). Modelo A no lo mencionó.

**Archivo:** `src/sqlite_store.ts`, líneas 177-218.

**El Problema:**

`searchVectorInt8()` ejecuta `SELECT ... FROM recuerdos_vectores WHERE vector_blob IS NOT NULL AND user_id = ?` **sin LIMIT**, trayendo todas las filas vectorizadas del usuario a memoria JS para calcular cosine similarity. El parámetro `limit` del método solo recorta el resultado final después del scan completo. Esto significa que el costo CPU y pico de memoria de cada búsqueda crecen linealmente con el historial total del usuario.

Con cientos o pocos miles de hechos, esto es imperceptible. Con decenas de miles, cada `search_memory` se vuelve progresivamente más lento sin que nada en el sistema lo advierta.

**Código actual (ANTES):**

```typescript
// sqlite_store.ts, líneas 181-186
if (userId) {
  const stmt = this.db.prepare(`
    SELECT point_id as id, user_id, data, source, created_at, vector_blob
    FROM recuerdos_vectores
    WHERE vector_blob IS NOT NULL AND user_id = ?
  `);
  rows = stmt.all(userId);
}
```

**Código corregido (DESPUÉS):**

```typescript
if (userId) {
  const stmt = this.db.prepare(`
    SELECT point_id as id, user_id, data, source, created_at, vector_blob
    FROM recuerdos_vectores
    WHERE vector_blob IS NOT NULL AND user_id = ?
    ORDER BY created_at DESC
    LIMIT 5000
  `);
  rows = stmt.all(userId);
}
```

Aplicar el mismo cambio a la rama sin `userId` (líneas 188-193).

Agregar un warning después de obtener los rows:

```typescript
rows = stmt.all(userId);
if (rows.length >= 5000) {
  console.warn(`⚠️ [SQLITE_STORE] Vector scan hit the 5000-row safety limit for user ${userId}. Consider enabling ANN indexing (sqlite-vec) for better scalability.`);
}
```

**Instrucciones para Claude Sonnet:**

1. En `src/sqlite_store.ts`, localizar el método `searchVectorInt8()` (línea 177).
2. En ambas ramas del `if (userId)` (líneas 181-186 y 188-193):
   - Agregar `ORDER BY created_at DESC` (priorizar hechos recientes).
   - Agregar `LIMIT 5000`.
3. Después de cada `rows = stmt.all(...)`, insertar el bloque de warning si se alcanza el tope.
4. No cambiar la lógica de scoring ni de sort posterior — eso sigue igual.

**Pros:**
- Pone un techo al costo por request, evitando degradación silenciosa.
- `ORDER BY created_at DESC` prioriza hechos recientes, que son estadísticamente más relevantes.
- El warning visible alerta cuando se acerca al límite, en vez de degradar silenciosamente.

**Contras:**
- Si un usuario tiene >5000 hechos vectorizados, los más antiguos quedan fuera del scan. Esto es un trade-off aceptable: la alternativa (scan completo) es peor.
- El `ORDER BY created_at DESC` agrega un sort en SQLite, pero sobre un índice existente (`idx_recuerdos_created_at`), así que el costo es mínimo.

---

## Cambios Rechazados (NO IMPLEMENTAR)

### ❌ R1 — Modelo A: "Fuga de puertos efímeros por falta de keepAlive en Axios"

**Por qué se rechaza:**

Modelo A afirma que `axios.post` "abre y cierra un socket nuevo" en cada llamada. Esto es **técnicamente incorrecto** en Node.js moderno. Desde Node 19+, `http.globalAgent` usa `keepAlive: true` por defecto (backported a Node 18.19+). Axios, a menos que se le pase `httpAgent: false`, hereda el agent global.

Además, el patrón de uso de este servidor MCP no es un servidor HTTP de alta concurrencia. Es un proceso single-user invocado por un cliente MCP (Claude, Cursor). Las llamadas LLM son secuenciales por diseño (serializadas por `KeyedMutex`). El escenario de "agotamiento de puertos efímeros" requiere >16k conexiones simultáneas — imposible con esta arquitectura.

Crear una instancia custom de Axios con agents HTTP explícitos (`maxSockets: 50`, etc.) es sobre-ingeniería para un perfil de carga que no existe.

---

### ❌ R2 — Modelo A: "Violación grave de SRP — Desacoplar persistencia de agentes"

**Por qué se rechaza:**

Modelo A dice que `CognitiveAgents` no debe importar `SqliteStore` y que "solo debe procesar texto y devolver estructuras de datos". Esto es purismo académico que no aporta valor operativo. `CognitiveAgents` necesita acceso directo a la store para:
- Leer hechos existentes (Semantic Arbiter: `searchVectorInt8`)
- Leer el dashboard actual (`getDashboardFact`)
- Leer hechos recientes (`getRecentFactsSince`)
- Persistir resultados (`insertMemoryFact`, `saveDashboardFact`)

Desacoplar esto crearía un orquestador intermedio que sería un proxy pass-through, duplicando la complejidad sin ganancia real. El acoplamiento actual es **funcional, no accidental**. El problema real (exportar `CognitiveAgents` públicamente) se resuelve con FIX-6, no con refactoring de SRP.

---

### ❌ R3 — Modelo A: "Modularizar AutoDream en 3 funciones privadas"

**Por qué se rechaza:**

`runAutoDream` es un método largo (~260 líneas) pero su flujo es lineal y bien comentado. Fragmentarlo en `_pruneExpiredState`, `_compileAIState`, `_mergeAndPersist` dentro de la misma clase no mejora la testabilidad (siguen siendo métodos con I/O y dependencia de `this.store`) ni la legibilidad significativamente. Lo que sí tiene valor futuro es extraer **funciones puras** (pruning TTL, preservación cross-topic) a módulos sin I/O para unit testing determinista — pero eso es backlog post-release, no blocker.

---

### ❌ R4 — Modelo B: "Migrar `server.tool()` → `server.registerTool()` + actualizar SDK a v2"

**Por qué se rechaza:**

`server.tool()` funciona correctamente con `@modelcontextprotocol/sdk ^1.3.0`. La deprecation notice es un warning, no un breaking change. `registerTool()` existe desde SDK 1.29+, y la v2 (revisión de protocolo `2026-07-28`) es demasiado nueva para un primer release estable. Migrar ahora introduce riesgo de regresión sin ganancia funcional. Tarea de mantenimiento post-release, no blocker.

---

### ❌ R5 — Modelo B: "Migrar `@google/generative-ai` → `@google/genai`"

**Por qué se rechaza:**

El SDK legacy sigue funcionando y recibiendo fixes críticos. La migración al nuevo SDK tiene una API surface diferente, manejo de embeddings diferente, y sistema de types diferente. Es un esfuerzo no trivial con riesgo de regresión. Documentar el riesgo de EOL en el README es suficiente para v1. Planificar la migración para v2.0.

---

### ❌ R6 — Modelo B: "`strict: true` en tsconfig + eliminar `any`"

**Por qué se rechaza:**

Activar `strict: true` en un codebase con ~30 usos de `any` generaría un tsunami de errores de compilación. La mayoría de los `any` son para parseo de respuestas de LLM, que son JSON semi-estructurado por naturaleza. El `any` aquí es pragmático: las respuestas del LLM ya se validan implícitamente con `getResponseSchema()` en Gemini y con `extractJsonPayload()` + `JSON.parse()` en todas las ramas. Forzar tipos TS estrictos encima de eso no agrega seguridad real y sí costo de mantenimiento.

---

### ❌ R7 — Modelo B: "Agregar columna `active INTEGER` a `recuerdos_vectores`"

**Por qué se rechaza:**

FIX-2 (`AND source != 'inactive'`) resuelve el bug de forma mínimamente invasiva sin migración de esquema. Agregar una columna nueva con `ALTER TABLE`, actualizar todas las queries, y crear un job de purga es un refactor de mediano plazo que puede planificarse post-release. El sentinel `source = 'inactive'` funciona correctamente como marcador de soft-delete para la escala actual.

---

### ❌ R8 — Modelo B: "Agregar `structuredContent`/`outputSchema` a los tools MCP"

**Por qué se rechaza:**

Nice-to-have para consumidores programáticos, pero el caso de uso primario es un cliente MCP como Claude/Cursor que consume texto. El formato actual con emojis es funcional y legible. Agregar `structuredContent` es una mejora de API que puede hacerse post-release sin breaking change.

---

### ❌ R9 — Modelo B: "Subir `better-sqlite3` a 13.x"

**Por qué se rechaza:**

La v13.x migró a N-API (mejora futura de compatibilidad de binarios), pero `^11.8.0` es estable y funcional en las plataformas objetivo actuales. Subir requiere validación de binarios prebuilt en todas las plataformas (Linux/macOS/Windows x64/arm64). No es un problema de seguridad.

---

## Orden de Implementación

Implementar en este orden exacto para minimizar conflictos de merge y facilitar testing incremental:

| Paso | Fix | Archivo(s) | Riesgo | Dependencias |
|------|-----|------------|--------|--------------|
| 1 | FIX-4 | `package.json` | Bajo | Ninguna — ejecutar `npm install` + `npm audit` + `npm run build` |
| 2 | FIX-6 | `index.ts` | Bajo | Ninguna — ejecutar `npm run build` |
| 3 | FIX-2 | `sqlite_store.ts` | Bajo | Ninguna |
| 4 | FIX-8 | `sqlite_store.ts` | Bajo | Puede hacerse junto con FIX-2 en un solo commit |
| 5 | FIX-1 | `cognitive_agents.ts` | Bajo | Ninguna |
| 6 | FIX-5 | `cognitive_agents.ts` | Bajo | Ninguna |
| 7 | FIX-7 | `cognitive_agents.ts` | Bajo | Ninguna |
| 8 | FIX-3 | `cognitive_agents.ts` | Medio | FIX-2 ya aplicado (para coherencia) |

**Notas para Claude Sonnet:**
- FIX-1, FIX-5 y FIX-7 son todos en `cognitive_agents.ts` pero en métodos diferentes — pueden hacerse en un solo commit agrupados como "Fix cognitive agent edge cases".
- FIX-2 y FIX-8 son ambos en `sqlite_store.ts` — agrupar en un commit "Harden SQLite queries".
- FIX-3 es el más delicado porque modifica el flujo de `runAutoDream` — hacerlo último permite verificar que los otros fixes no introdujeron regresiones antes de tocar el método más complejo.
- Después de aplicar todos los fixes, ejecutar `npm run build` para confirmar compilación limpia.

---

## Verificación Post-Implementación

### Tests manuales mínimos viables

1. **FIX-1 — Gemini embedding fallback:**
   - Configurar solo `GEMINI_API_KEY` (sin Ollama).
   - Ejecutar `save_fact` con un hecho.
   - Verificar en logs que aparece una llamada a Gemini embedding (no solo FTS5).
   - Ejecutar `search_memory` y verificar que retorna resultados vectoriales.

2. **FIX-2 — Hechos desactivados:**
   - Guardar un hecho A ("IP del servidor es 10.0.0.1").
   - Guardar un hecho B que lo supere ("IP del servidor es 10.0.0.2") — el Arbiter debería desactivar A.
   - Ejecutar `consolidate` y verificar que A no aparece en `NEW_FACTS` del log.

3. **FIX-3 — Archivado duplicado:**
   - Crear un caso de incubadora que expire por TTL.
   - Forzar un fallo del orquestador (desconectar red justo después de que comience el `try`).
   - Ejecutar `consolidate` de nuevo y verificar que no se duplica `[UNRESOLVED_CASE]`.

4. **FIX-7 — AbortSignal race condition:**
   - Ejecutar `consolidate` y enviar señal de cancelación inmediatamente.
   - Verificar en logs que no quedan llamadas LLM colgadas ejecutándose en background.

### Compilación

```bash
npm run build
# Debe compilar sin errores ni warnings nuevos
```
