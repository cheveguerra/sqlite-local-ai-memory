/**
 * ============================================================================
 * FILE: src/test_multitopic_dashboard.ts
 * RESPONSIBILITY: Verification suite for Multi-Topic Single Dashboard with
 * deterministic cross-topic preservation.
 * ============================================================================
 */
import fs from "fs";
import { MemoryEngine } from "./MemoryEngine.js";

async function runMultiTopicTest() {
  console.log("🧪 [TEST] Starting Multi-Topic Single Dashboard Verification...\n");

  const dbPath = "./memoria_test_multitopic.db";
  for (const ext of ["", "-wal", "-shm"]) {
    if (fs.existsSync(dbPath + ext)) {
      try { fs.unlinkSync(dbPath + ext); } catch (_) {}
    }
  }

  const memory = new MemoryEngine({
    dbPath,
    debug: false,
  });

  try {
    // 1. Ingest TotalConnect facts
    console.log("▶ 1. Saving facts for [TOTALCONNECT]...");
    await memory.saveFact(
      "[TECHNICAL] Webhook timeout configured to 5000ms in TotalConnect gateway.",
      undefined,
      { source: "TOTALCONNECT" }
    );
    await memory.saveFact(
      "[INCUBATOR/OPEN_CASE:TOTALCONNECT] Zone 230 PIR camera triggering false tampering alerts during night arming.",
      undefined,
      { source: "TOTALCONNECT" }
    );

    // 2. Consolidate TotalConnect
    console.log("▶ 2. Consolidating AutoDream for [TOTALCONNECT]...");
    const res1 = await memory.consolidate(undefined, "TOTALCONNECT");
    console.log(`   Consolidated status: ${res1.statusMessage}`);
    console.log(`   Dashboard items after step 1: ${res1.dashboard.length}`);

    // 3. Ingest Sqlite-Memory facts
    console.log("\n▶ 3. Saving facts for [SQLITE_MEMORY]...");
    await memory.saveFact(
      "[DEVELOPMENT] [sqlite-local-ai-memory] Implemented multi-topic dashboard schema in types.ts.",
      undefined,
      { source: "SQLITE_MEMORY" }
    );
    await memory.saveFact(
      "[INCUBATOR/OPEN_CASE:SQLITE_MEMORY] Dimension mismatch between Ollama and Gemini embeddings.",
      undefined,
      { source: "SQLITE_MEMORY" }
    );

    // 4. Consolidate Sqlite-Memory
    console.log("▶ 4. Consolidating AutoDream for [SQLITE_MEMORY]...");
    const res2 = await memory.consolidate(undefined, "SQLITE_MEMORY");
    console.log(`   Consolidated status: ${res2.statusMessage}`);
    console.log(`   Dashboard items after step 2: ${res2.dashboard.length}`);

    // 5. Inspect final dashboard
    console.log("\n▶ 5. Reading unified dashboard from database...");
    const dash = memory.getDashboard();
    if (!dash) {
      throw new Error("Dashboard not found in database!");
    }

    const items = JSON.parse(dash.data);
    console.log(`\n📋 Unified Dashboard Contents (${items.length} items):`);
    items.forEach((it: any, idx: number) => {
      console.log(`   [${idx + 1}] (Source: ${it.source || "N/A"}) ${it.txt}`);
    });

    const hasTC = items.some((it: any) => it.txt.includes("TOTALCONNECT") || (it.source && it.source.toUpperCase() === "TOTALCONNECT"));
    const hasSQ = items.some((it: any) => it.txt.includes("SQLITE_MEMORY") || (it.source && it.source.toUpperCase() === "SQLITE_MEMORY"));

    console.log("\n🔍 Verification Checks:");
    console.log(`   • TotalConnect items preserved: ${hasTC ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`   • Sqlite-Memory items present:   ${hasSQ ? "✅ PASS" : "❌ FAIL"}`);

    if (hasTC && hasSQ) {
      console.log("\n🎉 MULTI-TOPIC SINGLE DASHBOARD TEST PASSED SUCCESSFULLY!\n");
    } else {
      throw new Error("Cross-topic preservation check failed!");
    }
  } finally {
    memory.close();
    for (const ext of ["", "-wal", "-shm"]) {
      if (fs.existsSync(dbPath + ext)) {
        try { fs.unlinkSync(dbPath + ext); } catch (_) {}
      }
    }
  }
}

runMultiTopicTest().catch((err) => {
  console.error("\n❌ [TEST_FAILED]", err);
  process.exit(1);
});
