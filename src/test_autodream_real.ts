import { MemoryEngine } from "./MemoryEngine.js";
import * as fs from "fs";

async function testRealHistory() {
  console.log("🧪 [TEST REAL] Simulando AutoDream con historial conversacional real de WhatsApp...");

  const dbPath = "./memoria_test_real.db";
  for (const ext of ["", "-wal", "-shm"]) {
    if (fs.existsSync(dbPath + ext)) {
      try { fs.unlinkSync(dbPath + ext); } catch (_) {}
    }
  }

  const historyPath = "Z:/data1/agy_shared/wa_chat_history.json";
  if (!fs.existsSync(historyPath)) {
    console.error("❌ No se encontró wa_chat_history.json");
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

  console.log(`\n📥 Inyectando ${turns.length} turnos conversacionales (filtrando telemetría)...`);
  for (const turn of turns) {
    if (turn.u && turn.u.includes("[NOTIFICACIÓN SISTEMA (GEOLOC)]")) continue;
    const text = `User: ${turn.u}\nAssistant: ${turn.a}`;
    await memory.save(text, "cheve_principal");
  }

  console.log("\n⚙️ Ejecutando AutoDream de consolidación...");
  const result = await memory.consolidate("cheve_principal");

  console.log("\n==================================================================");
  console.log("📊 RESULTADO EMPÍRICO DE AUTODREAM EN HISTORIAL REAL:");
  console.log("==================================================================");
  console.log("\n🔹 NARRATIVE SUMMARY (Pizarrón):", result.narrativeSummary);
  console.log("\n🔹 TRIAGE MEMORY (Hechos Permanentes):", JSON.stringify(result.triageMemory, null, 2));
  console.log("\n🔹 OPEN CASES (Incubadora):", JSON.stringify(result.openCases, null, 2));
  console.log("\n🔹 DASHBOARD TEMPORAL (Elementos Vivos):", JSON.stringify(result.dashboard, null, 2));
  console.log("==================================================================");

  memory.close();
}

testRealHistory().catch((err) => {
  console.error("❌ Error en prueba real:", err);
});
