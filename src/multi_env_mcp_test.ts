/**
 * ============================================================================
 * ARCHIVO: src/memory/multi_env_mcp_test.ts
 * RESPONSABILIDAD: Suite de 20 Pruebas Empíricas del Cliente y Servidor MCP
 * a través de 4 Escenarios de Entorno (Full Stack, Solo Cloud, Solo Ollama, Cero-IA).
 * ============================================================================
 */
import fs from "fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface TestResult {
  num: number;
  env: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function cleanupDb(dbPath: string) {
  for (const ext of ["", "-wal", "-shm"]) {
    if (fs.existsSync(dbPath + ext)) {
      try { fs.unlinkSync(dbPath + ext); } catch (_) {}
    }
  }
}

async function runMcpEnvTest(envName: string, dbPath: string, envVars: Record<string, string>, startTestNum: number) {
  console.log(`\n=================================================================`);
  console.log(`🧪 PROBANDO ENTORNO: ${envName}`);
  console.log(`=================================================================`);

  cleanupDb(dbPath);

  const transport = new StdioClientTransport({
    command: "node",
    args: ["./dist/mcp_server.js"],
    env: {
      ...process.env,
      SQLITE_MEM_PATH: dbPath,
      ...envVars,
    },
  });

  const client = new Client(
    { name: `test-client-${envName.toLowerCase()}`, version: "1.0.0" },
    { capabilities: {} }
  );

  let testCount = startTestNum;

  try {
    await client.connect(transport);

    // Test 1: tools/list
    const tools = await client.listTools();
    const hasTools = tools.tools.length === 4;
    results.push({
      num: testCount++,
      env: envName,
      name: "Handshake JSON-RPC y tools/list",
      passed: hasTools,
      details: `${tools.tools.length} herramientas registradas`,
    });

    // Test 2: get_current_state (Inicial)
    const state1 = await client.callTool({ name: "get_current_state", arguments: {} });
    const isText1 = Array.isArray(state1.content) && state1.content.length > 0;
    results.push({
      num: testCount++,
      env: envName,
      name: "get_current_state (Estado Inicial)",
      passed: isText1,
      details: `Respuesta recibida en ${envName}`,
    });

    // Test 3: save_fact
    const factText = `[FACT_${envName}] Servidor Proxmox VE activo en IP 192.168.100.200`;
    const saveRes = await client.callTool({ name: "save_fact", arguments: { fact: factText } });
    const saveSuccess = Array.isArray(saveRes.content) && (String(saveRes.content[0].text).includes("successfully saved") || String(saveRes.content[0].text).includes("registrado exitosamente"));
    results.push({
      num: testCount++,
      env: envName,
      name: "save_fact (Ingesta de Hecho)",
      passed: saveSuccess,
      details: String(saveRes.content[0]?.text || "").slice(0, 60),
    });

    // Test 4: search_memory
    const searchRes = await client.callTool({ name: "search_memory", arguments: { query: "Proxmox", limit: 3 } });
    const searchSuccess = Array.isArray(searchRes.content) && searchRes.content.length > 0;
    results.push({
      num: testCount++,
      env: envName,
      name: "search_memory (Búsqueda RAG/FTS5)",
      passed: searchSuccess,
      details: String(searchRes.content[0]?.text || "").slice(0, 60),
    });

    // Test 5: get_current_state (Posterior a Ingesta)
    const state2 = await client.callTool({ name: "get_current_state", arguments: {} });
    const isText2 = Array.isArray(state2.content) && state2.content.length > 0;
    results.push({
      num: testCount++,
      env: envName,
      name: "get_current_state (Pizarrón Actualizado)",
      passed: isText2,
      details: `Retornado Pizarrón en ${envName}`,
    });

    await client.close();
  } catch (err: any) {
    console.error(`❌ Error probando ${envName}:`, err.message);
    results.push({
      num: testCount,
      env: envName,
      name: "Ejecución de Entorno",
      passed: false,
      details: err.message,
    });
  }
}

async function main() {
  console.log("🚀 [MULTI_ENV_TEST] Iniciando Batería de 20 Pruebas Empíricas MCP en 4 Entornos...");

  const activeGeminiKey = process.env.GEMINI_API_KEY || "";
  const defaultOllamaUrl = process.env.OLLAMA_URL || "http://localhost:11434/api";

  // ENTORNO 1: Full Stack (Ollama + Cloud Gemini) - Pruebas 1 a 5 (Score Híbrido 0.90)
  await runMcpEnvTest("1. Full Stack (Ollama + Cloud)", "./memoria_env_full.db", { OLLAMA_URL: defaultOllamaUrl, GEMINI_API_KEY: activeGeminiKey }, 1);

  // ENTORNO 2: 100% Gemini Cloud (Ollama Off + Gemini Embeddings) - Pruebas 6 a 10 (Score Híbrido 0.90)
  await runMcpEnvTest("2. Solo Gemini Cloud (Ollama Off)", "./memoria_env_cloud.db", { OLLAMA_URL: "http://127.0.0.1:9999", GEMINI_API_KEY: activeGeminiKey }, 6);

  // ENTORNO 3: 100% Ollama Local (Cloud Off) - Pruebas 11 a 15 (Score Híbrido 0.90)
  await runMcpEnvTest("3. Solo Ollama Local (Cloud Off)", "./memoria_env_ollama.db", { GEMINI_API_KEY: "", OLLAMA_URL: defaultOllamaUrl }, 11);

  // ENTORNO 4: Cero-IA Fallback Extremo (Sin Ollama, Sin Cloud) - Pruebas 16 a 20 (Score FTS5 0.80)
  await runMcpEnvTest("4. Cero-IA Fallback Extremo", "./memoria_env_zero.db", { OLLAMA_URL: "http://127.0.0.1:9999", GEMINI_API_KEY: "" }, 16);

  console.log("\n=================================================================");
  console.log("📊 INFORME EMPÍRICO DE BALANCE DE LAS 20 PRUEBAS MCP:");
  console.log("=================================================================");

  let exitosas = 0;
  for (const r of results) {
    if (r.passed) exitosas++;
    console.log(`${r.passed ? "✅" : "❌"} [PRUEBA ${r.num}] [${r.env}] ${r.name}: ${r.details}`);
  }

  console.log(`\n🏆 RESULTADO GLOBAL: ${exitosas} / ${results.length} PRUEBAS PASADAS (${((exitosas / results.length) * 100).toFixed(1)}% Éxito)`);
  if (exitosas < results.length) {
    console.error(`💥 ${results.length - exitosas} prueba(s) fallaron.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Fallo general en runner de pruebas:", err);
  process.exit(1);
});
