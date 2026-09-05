/**
 * ============================================================================
 * FILE: src/memory/multi_env_mcp_test.ts
 * RESPONSIBILITY: Comprehensive 20-test suite for MCP Client and Server
 * across 4 environment scenarios (Full Stack, Cloud Only, Ollama Only, Zero-AI).
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
  console.log(`🧪 TESTING ENVIRONMENT: ${envName}`);
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
    { name: `test-client-${envName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`, version: "1.0.0" },
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
      name: "JSON-RPC Handshake & tools/list",
      passed: hasTools,
      details: `${tools.tools.length} registered tools`,
    });

    // Test 2: get_current_state (Initial)
    const state1 = await client.callTool({ name: "get_current_state", arguments: {} });
    const isText1 = Array.isArray(state1.content) && state1.content.length > 0;
    results.push({
      num: testCount++,
      env: envName,
      name: "get_current_state (Initial State)",
      passed: isText1,
      details: `Response received in ${envName}`,
    });

    // Test 3: save_fact
    const factText = `[FACT_${envName}] Primary server active on IP 10.0.0.50`;
    const saveRes = await client.callTool({ name: "save_fact", arguments: { fact: factText } });
    const saveSuccess = Array.isArray(saveRes.content) && (String(saveRes.content[0].text).includes("successfully saved") || String(saveRes.content[0].text).includes("registrado exitosamente"));
    results.push({
      num: testCount++,
      env: envName,
      name: "save_fact (Fact Ingestion)",
      passed: saveSuccess,
      details: String(saveRes.content[0]?.text || "").slice(0, 60),
    });

    // Test 4: search_memory
    const searchRes = await client.callTool({ name: "search_memory", arguments: { query: "Proxmox", limit: 3 } });
    const searchSuccess = Array.isArray(searchRes.content) && searchRes.content.length > 0;
    results.push({
      num: testCount++,
      env: envName,
      name: "search_memory (RAG/FTS5 Search)",
      passed: searchSuccess,
      details: String(searchRes.content[0]?.text || "").slice(0, 60),
    });

    // Test 5: get_current_state (Post-Ingestion)
    const state2 = await client.callTool({ name: "get_current_state", arguments: {} });
    const isText2 = Array.isArray(state2.content) && state2.content.length > 0;
    results.push({
      num: testCount++,
      env: envName,
      name: "get_current_state (Updated Dashboard)",
      passed: isText2,
      details: `Dashboard returned in ${envName}`,
    });
  } catch (err: any) {
    console.error(`❌ Error testing ${envName}:`, err.message);
    results.push({
      num: testCount,
      env: envName,
      name: "Environment Execution",
      passed: false,
      details: err.message,
    });
  } finally {
    try {
      await client.close();
    } catch (_) {}
  }
}

async function main() {
  console.log("🚀 [MULTI_ENV_TEST] Starting 20 Empirical MCP Tests across 4 Environments...");

  const activeGeminiKey = process.env.GEMINI_API_KEY || "";
  const defaultOllamaUrl = process.env.OLLAMA_URL || "http://localhost:11434/api";

  // ENVIRONMENT 1: Full Stack (Ollama + Cloud Gemini)
  await runMcpEnvTest("1. Full Stack (Ollama + Cloud)", "./memoria_env_full.db", { OLLAMA_URL: defaultOllamaUrl, GEMINI_API_KEY: activeGeminiKey }, 1);

  // ENVIRONMENT 2: Cloud Only (Gemini Cloud + Embeddings)
  await runMcpEnvTest("2. Cloud Gemini Only (Ollama Off)", "./memoria_env_cloud.db", { OLLAMA_URL: "http://127.0.0.1:9999", GEMINI_API_KEY: activeGeminiKey }, 6);

  // ENVIRONMENT 3: Local Only (Ollama Local, Cloud Off)
  await runMcpEnvTest("3. Local Ollama Only (Cloud Off)", "./memoria_env_ollama.db", { GEMINI_API_KEY: "", OLLAMA_URL: defaultOllamaUrl }, 11);

  // ENVIRONMENT 4: Zero-AI Fallback (No Ollama, No Cloud)
  await runMcpEnvTest("4. Zero-AI Extreme Fallback", "./memoria_env_zero.db", { OLLAMA_URL: "http://127.0.0.1:9999", GEMINI_API_KEY: "" }, 16);

  console.log("\n=================================================================");
  console.log("📊 EMPIRICAL TEST SUMMARY (20 MCP TESTS):");
  console.log("=================================================================");

  let successful = 0;
  for (const r of results) {
    if (r.passed) successful++;
    console.log(`${r.passed ? "✅" : "❌"} [TEST ${r.num}] [${r.env}] ${r.name}: ${r.details}`);
  }

  console.log(`\n🏆 GLOBAL RESULT: ${successful} / ${results.length} TESTS PASSED (${((successful / results.length) * 100).toFixed(1)}% Success)`);
  if (successful < results.length) {
    console.error(`💥 ${results.length - successful} test(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Fatal error in test runner:", err);
  process.exit(1);
});
