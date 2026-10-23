# Auditoría de Calidad y Registro de Mejoras - sqlite-local-ai-memory

**Fecha:** 23 de Octubre de 2026  
**Versión Base:** 1.5.2  
**Módulos Evaluados:** `MemoryEngine.ts`, `cognitive_agents.ts`, `sqlite_store.ts`, `mcp_server.ts`, `types.ts`  
**Objetivo:** Eliminar cuellos de botella de latencia, prevenir contaminación de memoria vectorial, corregir fallos silenciosos y alinear la implementación con la especificación anunciada.

---

## 1. Resumen de Hallazgos y Diagnóstico

Tras la auditoría técnica exhaustiva, se aislaron los siguientes problemas prioritarios:

1. **Incompatibilidad de Espacios Vectoriales (Contaminación Silenciosa):**
   * *Problema:* `getEmbedding` realizaba fallback cruzado entre proveedores (por ejemplo, de `nomic-embed-text` a `gemini-embedding-001`). Aunque ambos tienen 768 dimensiones, sus espacios semánticos son ortogonales e incomparables. La similitud coseno entre vectores de modelos distintos es ruido matemático.
   * *Solución:* Mantener consistencia vectorial estricta. Si el modelo/proveedor seleccionado falla, no emitir vectores sintéticos de otra familia en la misma base; devolver vector vacío para reintento diferido por el embedder legítimo.

2. **Fallback Ficticio de Gemini a Ollama:**
   * *Problema:* Las matrices de agentes en `createConfig` y `createEssentialConfig` solo añadían Ollama si `GEMINI_API_KEY` **no existía**. Si la API Key de Gemini estaba presente pero sufría HTTP 429 (límite de cuota) o falla de red, el sistema fallaba sin recurrir a Ollama.
   * *Solución:* Si `OLLAMA_URL` está configurado, agregar siempre Ollama como opción de fallback secundaria en el array de proveedores.

3. **Invocación Redundante del Arbiter LLM en cada Ingesta:**
   * *Problema:* En `injectUnifiedFact`, el Arbiter se disparaba siempre que `matches.length > 0`, sin importar la distancia semántica. La búsqueda top-3 casi siempre devuelve 3 candidatos (incluso con similitud baja como 0.2 o 0.3), obligando a una llamada LLM por cada hecho.
   * *Solución:* Establecer un umbral mínimo de similitud (`similarity >= 0.70`) para invocar al Arbiter. Si no hay coincidencia semántica relevante, se inserta directamente, reduciendo drásticamente latencia y consumo de API.

4. **Descarte Silencioso de Entradas por JSON Inválido del Notary:**
   * *Problema:* Si el Notary LLM generaba un JSON truncado o sintácticamente inválido, el código ejecutaba un `return` silencioso sin almacenar el hecho.
   * *Solución:* Ante cualquier falla de deserialización JSON del Notary, respaldar inmediatamente el texto en modo `[RAW]` preservando la información para el usuario.

5. **Reemplazo Atómico (Anti-Huérfanos):**
   * *Problema:* `supersedeMemoryFact` se ejecutaba antes de `insertMemoryFact`. Ante un fallo fortuito en la inserción, el hecho previo quedaba deshabilitado con un ID inexistente.
   * *Solución:* Invertir el orden o asegurar la inserción exitosa del nuevo hecho antes de marcar el hecho anterior como reemplazado.

6. **Algoritmo de Búsqueda RRF Real:**
   * *Problema:* La herramienta MCP anunciaba fusión recíproca de rangos (RRF), pero `MemoryEngine.search` realizaba un promedio ponderado con normalización relativa de BM25, introduciendo un sesgo hacia coincidencias léxicas exactas.
   * *Solución:* Implementar la fórmula estándar de Reciprocal Rank Fusion: $\text{RRF}(d) = \sum_{m} \frac{1}{60 + \text{rank}_m(d)}$.

7. **Memoización de la Matriz de Agentes:**
   * *Problema:* `getAgentsMatrix()` leía y analizaba variables de entorno en cada llamada individual, generando sobrecarga y spam de warnings en logs.
   * *Solución:* Memoizar la configuración de agentes e inicializarla de manera eficiente.

---

## 2. Plan de Aplicación

* [x] **Fase 1:** Corrección de fallbacks de proveedores y preservación de espacio vectorial (`cognitive_agents.ts`).
* [x] **Fase 2:** Umbral de activación del Arbiter y captura de respaldo RAW ante JSON roto (`cognitive_agents.ts`).
* [x] **Fase 3:** Transacción/orden seguro de `supersede` + `insert` (`cognitive_agents.ts`).
* [x] **Fase 4:** Fusión híbrida RRF canónica (`MemoryEngine.ts`).
* [x] **Fase 5:** Validación de compilación TypeScript.
