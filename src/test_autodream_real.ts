import { MemoryEngine } from "./MemoryEngine.js";
import * as fs from "fs";

async function testRealHistory() {
  console.log("🧪 [REAL TEST] Simulating AutoDream with real conversational history...");

  const dbPath = "./memoria_test_real.db";
  for (const ext of ["", "-wal", "-shm"]) {
    if (fs.existsSync(dbPath + ext)) {
      try { fs.unlinkSync(dbPath + ext); } catch (_) {}
    }
  }

  const historyPath = "Z:/data1/agy_shared/wa_chat_history.json";
  if (!fs.existsSync(historyPath)) {
    console.error("❌ wa_chat_history.json not found");
    return;
  }

  const raw = fs.readFileSync(historyPath, "utf-8");
  const turns = JSON.parse(raw);

  const memory = new MemoryEngine({
    dbPath,
    userName: "Cheve",
    userId: "cheve_principal",
    semanticArbitrator: true,
  });

  console.log(`\n📥 Ingesting ${turns.length} conversational turns (filtering telemetry)...`);
  for (const turn of turns) {
    if (turn.u && turn.u.includes("[NOTIFICACIÓN SISTEMA (GEOLOC)]")) continue;
    const text = `User: ${turn.u}\nAssistant: ${turn.a}`;
    await memory.save(text, "cheve_principal");
  }

  console.log("\n⚙️ Executing AutoDream consolidation...");
  const result = await memory.consolidate("cheve_principal");

  console.log("\n==================================================================");
  console.log("📊 EMPIRICAL AUTODREAM RESULT ON REAL HISTORY:");
  console.log("==================================================================");
  console.log("\n🔹 NARRATIVE SUMMARY (Dashboard):", result.narrativeSummary);
  console.log("\n🔹 TRIAGE MEMORY (Permanent Facts):", JSON.stringify(result.triageMemory, null, 2));
  console.log("\n🔹 OPEN CASES (Incubator):", JSON.stringify(result.openCases, null, 2));
  console.log("\n🔹 WORKING DASHBOARD (Live Items):", JSON.stringify(result.dashboard, null, 2));
  console.log("==================================================================");

  memory.close();
}

testRealHistory().catch((err) => {
  console.error("❌ Error in real test:", err);
});
