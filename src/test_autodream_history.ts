/**
 * ============================================================================
 * FILE: src/memory/test_autodream_history.ts
 * RESPONSIBILITY: Simulates an end-of-session AutoDream consolidation cycle
 * using realistic multi-turn conversational history (defaults to bundled fixture
 * or user-specified file via CHAT_HISTORY_FILE environment variable).
 * ============================================================================
 */
import fs from "fs";
import path from "path";
import { MemoryEngine } from "./MemoryEngine.js";

async function testHistoryConsolidation() {
  console.log("🧪 [HISTORY_TEST] Simulating AutoDream consolidation over multi-turn conversation...\n");

  const dbPath = "./memoria_test_history.db";
  for (const ext of ["", "-wal", "-shm"]) {
    if (fs.existsSync(dbPath + ext)) {
      try { fs.unlinkSync(dbPath + ext); } catch (_) {}
    }
  }

  // Resolve history source: custom environment variable or bundled sample fixture
  const customPath = process.env.CHAT_HISTORY_FILE;
  let resolvedPath = "";

  if (customPath && fs.existsSync(customPath)) {
    resolvedPath = customPath;
    console.log(`📂 Using custom history source: ${resolvedPath}`);
  } else {
    // Look for fixtures/sample_chat_history.json relative to current directory
    const defaultCandidates = [
      path.resolve("./fixtures/sample_chat_history.json"),
      path.resolve("../fixtures/sample_chat_history.json"),
      path.join(path.dirname(new URL(import.meta.url).pathname), "../../fixtures/sample_chat_history.json"),
    ];

    for (const cand of defaultCandidates) {
      if (fs.existsSync(cand)) {
        resolvedPath = cand;
        break;
      }
    }

    if (!resolvedPath) {
      console.error("❌ Could not locate sample_chat_history.json fixture.");
      process.exit(1);
    }
    console.log(`📂 Using bundled fixture source: ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, "utf-8");
  let turns: Array<{ u?: string; a?: string; user?: string; assistant?: string; text?: string }> = [];

  try {
    turns = JSON.parse(raw);
    if (!Array.isArray(turns)) {
      throw new Error("Chat history JSON must be an array of conversation turns.");
    }
  } catch (err: any) {
    console.error("❌ Failed to parse chat history JSON:", err.message);
    process.exit(1);
  }

  const memory = new MemoryEngine({
    dbPath,
    userName: "Alice",
    userId: "user_test",
    semanticArbitrator: true,
  });

  console.log(`\n📥 Ingesting ${turns.length} conversation turns into MemoryEngine...`);
  let ingestedCount = 0;

  for (const [idx, turn] of turns.entries()) {
    const userMsg = turn.u || turn.user || "";
    const assistantMsg = turn.a || turn.assistant || "";
    const directText = turn.text || "";

    const combinedText = directText || (userMsg ? `User: ${userMsg}\nAssistant: ${assistantMsg}` : "");
    if (!combinedText.trim()) continue;

    // Optional noise filter: skip system telemetry banners
    if (combinedText.includes("[NOTIFICACIÓN SISTEMA") || combinedText.includes("[SYSTEM TELEMETRY]")) {
      continue;
    }

    await memory.save(combinedText, "user_test");
    ingestedCount++;
  }

  console.log(`✨ Successfully processed ${ingestedCount} turns.`);

  console.log("\n⚙️ Executing AutoDream consolidation cycle (memory.consolidate())...");
  const startTime = Date.now();
  const result = await memory.consolidate("user_test");
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n==================================================================");
  console.log(`📊 EMPIRICAL AUTODREAM RESULT (Completed in ${elapsed}s):`);
  console.log("==================================================================");
  console.log("\n🔹 NARRATIVE SUMMARY (Executive Dashboard Overview):");
  console.log(`   ${result.narrativeSummary}`);

  console.log("\n🔹 WORKING DASHBOARD ITEMS (Live Work in Progress):");
  if (result.dashboard && result.dashboard.length > 0) {
    result.dashboard.forEach((d, i) => console.log(`   [${i + 1}] ${d.txt}`));
  } else {
    console.log("   (No active working items)");
  }

  console.log("\n🔹 TRIAGE MEMORY (Compiled Permanent 4-Block Technical Facts):");
  if (result.triageMemory && result.triageMemory.length > 0) {
    result.triageMemory.forEach((t, i) => console.log(`   [${i + 1}] [${t.type}] ${t.fact}`));
  } else {
    console.log("   (No triage facts compiled)");
  }

  console.log("\n🔹 OPEN CASES INCUBATOR (Tracked Unresolved Issues):");
  if (result.openCases && result.openCases.length > 0) {
    result.openCases.forEach((c, i) => console.log(`   [${i + 1}] [ID: ${c.id}] ${c.incident}`));
  } else {
    console.log("   (No open cases)");
  }
  console.log("==================================================================\n");

  memory.close();

  // Cleanup test database
  for (const ext of ["", "-wal", "-shm"]) {
    if (fs.existsSync(dbPath + ext)) {
      try { fs.unlinkSync(dbPath + ext); } catch (_) {}
    }
  }

  console.log("✅ History-based AutoDream simulation finished successfully.");
}

testHistoryConsolidation().catch((err) => {
  console.error("❌ Fatal error during history test:", err);
  process.exit(1);
});
