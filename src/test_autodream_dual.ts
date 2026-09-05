import { MemoryEngine } from "./MemoryEngine.js";
import * as fs from "fs";

async function runTest() {
  console.log("🧪 [TEST] Testing AutoDream Dual Output & Memory Triage...");

  const dbPath = "./memoria_test_dual.db";
  for (const ext of ["", "-wal", "-shm"]) {
    if (fs.existsSync(dbPath + ext)) {
      try { fs.unlinkSync(dbPath + ext); } catch (_) {}
    }
  }

  const memory = new MemoryEngine({
    dbPath,
    userName: "Alice",
    userId: "user_test",
    semanticArbitrator: true,
  });

  console.log("\n📥 Ingesting test facts...");
  await memory.saveFact("[DEVELOPMENT] [NETWORK] Socket reconnection error 256X resolved by adding delay before resumable calls.");
  await memory.saveFact("[DIAGNOSIS] Investigating server overheating root cause under heavy load. Solution pending.");

  console.log("\n⚙️ Executing AutoDream consolidation (memory.consolidate())...");
  const result = await memory.consolidate("user_test");

  console.log("\n📊 DUAL RESULT COLLECTED:");
  console.log("--------------------------------------------------");
  console.log("🔹 Narrative Summary (Dashboard):", result.narrativeSummary);
  console.log("\n🔹 Dashboard Items (Working State):", JSON.stringify(result.dashboard, null, 2));
  console.log("\n🔹 Triage Memory (Long-term SQLite Facts):", JSON.stringify(result.triageMemory, null, 2));
  console.log("\n🔹 Open Cases (Incubator):", JSON.stringify(result.openCases, null, 2));
  console.log("--------------------------------------------------");

  memory.close();
  console.log("\n✅ Test completed successfully.");
}

runTest().catch((err) => {
  console.error("❌ Test error:", err);
  process.exit(1);
});
