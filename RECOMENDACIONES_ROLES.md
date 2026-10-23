# Recomendaciones de Arquitectura y Roles: sqlite-local-ai-memory

Este documento consolida la auditoría técnica de los roles cognitivos (LLM) y vectoriales del módulo, detallando su necesidad según el entorno de despliegue.

---

## 1. Topología de Roles del Módulo

| Rol en Código | Variable de Entorno | Función Principal |
| :--- | :--- | :--- |
| **`EMBEDDER`** | `EMBEDDER_MODEL` / `OLLAMA_EMBED_MODEL` | Generación de vectores densos para búsqueda semántica híbrida. |
| **`NOTARY`** | `NOTARY_MODEL` | Compilación de texto crudo a hechos atómicos tipificados. |
| **`STATE_ORCHESTRATOR`** | `ORCHESTRATOR_MODEL` | Compilación asíncrona de estado y consolidación (AutoDream). |
| **`SEMANTIC_ARBITER`** | `ARBITER_MODEL` | Detección de contradicciones e invalidación (`supersede`) en caliente. |
| **`GATEKEEPER`** | `GATEKEEPER_MODEL` / `PORTERO_MODEL` | Firewall de ruido conversacional (cháchara / saludos). |
| **`QUERY_EXPANDER`** | `EXPANDER_MODEL` / `LIBRARIAN_MODEL` | Desambiguación léxica y reformulación contextual de queries. |

---

## 2. Recomendaciones por Escenario de Uso

### A. Modo Mínimo Viable (Zero/Low LLM)
* **Requisito mínimo:**
  1. `EMBEDDER_MODEL`: `nomic-embed-text` (o BGE local).
  2. `NOTARY_MODEL` y `ORCHESTRATOR_MODEL`: Compartidos en un único LLM local ligero (ej: `llama3.2:3b` o `qwen2.5:3b`).
* **Roles a deshabilitar (`none` / omitidos):** `GATEKEEPER`, `ARBITER`, `QUERY_EXPANDER`.

### B. Modo Asistente / MCP Tool (Pair-Programming con Agentes)
* **Recomendación:**
  * **Activar `SEMANTIC_ARBITER`**: Evita mantener verdades contradictorias vivas (ej. cambios de IPs, puertos o versiones) hasta que corra el AutoDream.
  * **Omitir `GATEKEEPER`**: Redundante; el agente orquestador ya decidió de forma determinista llamar a `save_fact`.
  * **Omitir `QUERY_EXPANDER`**: Redundante; los agentes generan queries estructuradas y técnicas; evita latencias de 400-800 ms.

### C. Modo Chatbot Autónomo (WhatsApp / Telegram / Logs)
* **Recomendación:**
  * **Activar `GATEKEEPER`**: Obligatorio para evitar saturar la base de datos de cortesías ("hola", "gracias", "ok").
  * **Activar `QUERY_EXPANDER`**: Crítico para desambiguar lenguaje natural humano informal (*"¿qué puerto tenía la máquina de ayer?"*).
  * **Activar `SEMANTIC_ARBITER`**: Crítico para actualizar hechos sobre la marcha durante la conversación.

---

## 3. Próximos Cambios Sugeridos en la Documentación (`README.md` / `CONTEXT.md`)
1. Declarar explícitamente qué roles son opcionales y cuáles tienen fallback determinista.
2. Documentar la variable de entorno `semanticArbitrator` y su fallback por umbral cosine (0.95).
3. Añadir perfiles preconfigurados en `docker-compose.yml` o scripts de arranque: `PROFILE=agent_mcp` vs `PROFILE=chatbot`.
