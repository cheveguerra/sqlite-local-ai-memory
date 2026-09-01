import { MemoryEngine } from "./MemoryEngine.js";
import * as fs from "fs";

async function runTest() {
  console.log("🧪 [TEST] Probando AutoDream Dual y Triaje de Memorias...");

  const dbPath = "./memoria_test_dual.db";
  for (const ext of ["", "-wal", "-shm"]) {
    if (fs.existsSync(dbPath + ext)) {
      try { fs.unlinkSync(dbPath + ext); } catch (_) {}
    }
  }

  const memory = new MemoryEngine({
    dbPath,
    userName: "Cheve",
    userId: "user_test",
    semanticArbitrator: true,
  });

  console.log("\n📥 Inyectando datos de prueba...");
  await memory.saveFact("[DEVELOPMENT] [B4A] Error 256X en reconexión de socket resuelto agregando Sleep(0) antes de llamadas resumibles. Regla: no ignorar llamadas resumibles.");
  await memory.saveFact("[DIAGNOSIS] Investigando causa de sobrecalentamiento en i7-4770 del servidor principal. Aún sin solución definitiva.");

  console.log("\n⚙️ Ejecutando AutoDream (memory.consolidate())...");
  const result = await memory.consolidate("user_test");

  console.log("\n📊 RESULTADO DUAL RECOGIDO:");
  console.log("--------------------------------------------------");
  console.log("🔹 Narrative Summary (Dashboard):", result.narrativeSummary);
  console.log("\n🔹 Dashboard Items (Pizarrón Temporal):", JSON.stringify(result.dashboard, null, 2));
  console.log("\n🔹 Triage Memory (Memoria Permanente SQLite):", JSON.stringify(result.triageMemory, null, 2));
  console.log("\n🔹 Open Cases (Incubadora):", JSON.stringify(result.openCases, null, 2));
  console.log("--------------------------------------------------");

  memory.close();
  console.log("\n✅ Test completado con éxito.");
}

runTest().catch((err) => {
  console.error("❌ Error en test:", err);
  process.exit(1);
});
