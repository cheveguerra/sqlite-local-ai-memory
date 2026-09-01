/**
 * ============================================================================
 * ARCHIVO: src/memory/stress_test.ts
 * RESPONSABILIDAD: Suite de Pruebas Intensivas (26 Casos Reales de Lectura,
 * Escritura, Detección de Ruido, Colisión Semántica y AutoDream).
 * ============================================================================
 */
import fs from "fs";
import { MemoryEngine } from "./MemoryEngine.js";

async function runStressTest() {
  console.log("🚀 [STRESS_TEST] Iniciando Batería Intensiva de 26 Pruebas en Vivo sobre MemoryEngine...\n");

  // Limpiar base de datos de test previa para asegurar aislamiento de pruebas
  const testDbPath = "./memoria_stress.db";
  for (const ext of ["", "-wal", "-shm"]) {
    if (fs.existsSync(testDbPath + ext)) {
      try { fs.unlinkSync(testDbPath + ext); } catch (_) {}
    }
  }

  const memory = new MemoryEngine({
    dbPath: testDbPath,
    userName: "User Alice",
  });

  let totalPruebas = 0;
  let pruebasExitosas = 0;

  function assertTest(name: string, condition: boolean, details?: string) {
    totalPruebas++;
    if (condition) {
      pruebasExitosas++;
      console.log(`✅ [PRUEBA ${totalPruebas}] ${name} ${details ? `(${details})` : ""}`);
    } else {
      console.error(`❌ [PRUEBA ${totalPruebas}] FALLADA: ${name} ${details ? `(${details})` : ""}`);
    }
  }

  try {
    // ------------------------------------------------------------------------
    // BLOQUE 1: Filtro de Ruido (Portero) - 5 Pruebas
    // ------------------------------------------------------------------------
    console.log("--- BLOQUE 1: Filtro de Ruido y Saludos (Agent: Portero) ---");
    
    await memory.save("hola buenas tardes");
    assertTest("Filtro Regex: Hola buenas tardes", (await memory.search("hola")).length === 0);

    await memory.save("ok gracias listo");
    assertTest("Filtro Regex: ok gracias listo", (await memory.search("gracias")).length === 0);

    await memory.save("jajajajajaj va dale");
    assertTest("Filtro Regex: risas y confirmación vacía", (await memory.search("dale")).length === 0);

    await memory.save("simon me parece bien");
    assertTest("Filtro Regex: simon me parece bien", (await memory.search("simon")).length === 0);

    await memory.save("enterado listisimo");
    assertTest("Filtro Regex: enterado listisimo", (await memory.search("enterado")).length === 0);

    // ------------------------------------------------------------------------
    // BLOQUE 2: Extracción de Hechos Atómicos (Notario) - 5 Pruebas
    // ------------------------------------------------------------------------
    console.log("\n--- BLOQUE 2: Extracción de Hechos Atómicos (Agent: Notario) ---");

    await memory.save("El servidor principal Proxmox se encuentra activo en la IP 10.0.0.200");
    const h1 = await memory.search("Proxmox IP 10.0.0.200");
    assertTest("Notario: Extracción IP Proxmox .200", h1.length > 0 && h1[0].data.includes("10.0.0.200"));

    await memory.save("A User Alice le gusta tomar café expreso doble por las mañanas");
    const h2 = await memory.search("café expreso");
    assertTest("Notario: Gusto de café expreso", h2.length > 0 && h2[0].data.includes("café expreso"));

    await memory.save("El contenedor AdGuard Home secundario está instalado en la IP 10.0.0.96");
    const h3 = await memory.search("AdGuard IP 10.0.0.96");
    assertTest("Notario: AdGuard IP .96", h3.length > 0 && h3[0].data.includes("10.0.0.96"));

    await memory.save("A User Bob no le agrada trabajar en ambientes con ruido extremo");
    const h4 = await memory.search("User Bob ambiente ruido");
    assertTest("Notario: Preferencia de User Bob", h4.length > 0 && h4[0].data.includes("User Bob"));

    await memory.save("El script de respaldo SnapRAID se ejecuta todos los días a las 02:00 AM");
    const h5 = await memory.search("SnapRAID 02:00 AM");
    assertTest("Notario: Horario SnapRAID", h5.length > 0 && h5[0].data.includes("SnapRAID"));

    // ------------------------------------------------------------------------
    // BLOQUE 3: Hechos Aditivos (Compatibilidad de Contexto) - 4 Pruebas
    // ------------------------------------------------------------------------
    console.log("\n--- BLOQUE 3: Hechos Aditivos (Coexistencia de Gustos/Detalles) ---");

    await memory.save("A User Alice también le gusta tomar té verde por las tardes");
    const hAditivo1 = await memory.search("café expreso o té verde");
    assertTest("Hechos Aditivos: Café y Té Coexisten", hAditivo1.length >= 2, `Recuperados ${hAditivo1.length} hechos aditivos`);

    await memory.save("El servidor Proxmox también aloja la máquina virtual VM 101 Tiny11");
    const hAditivo2 = await memory.search("Proxmox VM 101 Tiny11");
    assertTest("Hechos Aditivos: Proxmox aloja VM 101", hAditivo2.length > 0);

    await memory.save("User Bob prefiere estudiar programación en lenguaje Python");
    const hAditivo3 = await memory.search("User Bob Python");
    assertTest("Hechos Aditivos: User Bob estudia Python", hAditivo3.length > 0);

    await memory.save("SnapRAID incluye paridad en el disco de respaldos /mnt/parity");
    const hAditivo4 = await memory.search("SnapRAID /mnt/parity");
    assertTest("Hechos Aditivos: SnapRAID paridad", hAditivo4.length > 0);

    // ------------------------------------------------------------------------
    // BLOQUE 4: Colisión Semántica y Reemplazo de Estado (Árbitro) - 5 Pruebas
    // ------------------------------------------------------------------------
    console.log("\n--- BLOQUE 4: Árbitro Semántico (Soft-Deletes y Reemplazo de Estado) ---");

    // Cambio de IP de AdGuard (.96 -> .97)
    await memory.save("El contenedor AdGuard Home secundario fue movido a la nueva IP 10.0.0.97");
    const hColision1 = await memory.search("AdGuard Home IP");
    assertTest("Árbitro Semántico: Actualización de IP de AdGuard a .97", hColision1.length > 0 && hColision1[0].data.includes("10.0.0.97"));

    // Cambio de estado de servicio
    await memory.save("El servicio de sincronización JottaCloud fue pausado temporalmente por mantenimiento");
    const hColision2 = await memory.search("JottaCloud mantenimiento");
    assertTest("Árbitro Semántico: Estado de JottaCloud pausado", hColision2.length > 0 && hColision2[0].data.includes("pausado"));

    await memory.save("El servicio de sincronización JottaCloud fue reanudado y está 100% operativo");
    const hColision3 = await memory.search("JottaCloud operativo");
    assertTest("Árbitro Semántico: Estado de JottaCloud reanudado", hColision3.length > 0 && hColision3[0].data.includes("operativo"));

    // Cambio de ubicación de usuario
    await memory.save("User Alice se encuentra actualmente en la oficina");
    const hColision4 = await memory.search("User Alice ubicación oficina");
    assertTest("Árbitro Semántico: Ubicación Alice en oficina", hColision4.length > 0 && hColision4[0].data.includes("oficina"));

    await memory.save("User Alice ha regresado a Casa");
    const hColision5 = await memory.search("User Alice ubicación Casa");
    assertTest("Árbitro Semántico: Ubicación Alice en Casa", hColision5.length > 0 && hColision5[0].data.includes("Casa"));

    // ------------------------------------------------------------------------
    // BLOQUE 5: Búsqueda Híbrida Dual y Puntuación FTS5/Int8 - 4 Pruebas
    // ------------------------------------------------------------------------
    console.log("\n--- BLOQUE 5: Búsqueda Híbrida Dual (FTS5 BM25 + Int8 Vector) ---");

    const search1 = await memory.search("10.0.0.200", 3);
    assertTest("Búsqueda Dual Exacta IP: 10.0.0.200", search1.length > 0 && (search1[0].score || 0) >= 0.5, `Score: ${search1[0]?.score?.toFixed(2)}`);

    const search2 = await memory.search("¿Qué bebidas prefiere Alice?", 3);
    assertTest("Búsqueda Dual Semántica: Bebidas Alice", search2.length > 0, `Hechos encontrados: ${search2.length}`);

    const search3 = await memory.search("User Bob preferencias programación", 3);
    assertTest("Búsqueda Dual Compuesta: User Bob", search3.length > 0, `Hechos encontrados: ${search3.length}`);

    const search4 = await memory.search("SnapRAID paridad y horario", 3);
    assertTest("Búsqueda Dual Compuesta: SnapRAID", search4.length > 0, `Hechos encontrados: ${search4.length}`);

    // ------------------------------------------------------------------------
    // BLOQUE 6: Orquestador de Estado (AutoDream / Historiador) - 3 Pruebas
    // ------------------------------------------------------------------------
    console.log("\n--- BLOQUE 6: Orquestador AutoDream (Consolidación de Pizarrón) ---");

    const autoDreamResult = await memory.consolidate();
    assertTest("AutoDream: Ejecución de Consolidación", autoDreamResult.statusMessage.includes("AutoDream"), autoDreamResult.statusMessage);

    const dashboardObj = memory.getDashboard();
    assertTest("Pizarrón: Lectura de Estado Consolidado", dashboardObj !== null && dashboardObj.data.length > 0, `Pizarrón activo: ${dashboardObj?.updated_at}`);

    const searchFinal = await memory.search("resumen estado servidores", 3);
    assertTest("Búsqueda Final tras AutoDream", searchFinal.length > 0);

    // ------------------------------------------------------------------------
    // BALANCE FINAL
    // ------------------------------------------------------------------------
    console.log("\n==========================================================================");
    console.log(`📊 BALANCE FINAL DE PRUEBAS INTENSIVAS: ${pruebasExitosas} / ${totalPruebas} PRUEBAS EXITOSAS (${((pruebasExitosas / totalPruebas) * 100).toFixed(1)}%)`);
    console.log("==========================================================================");

    if (pruebasExitosas < totalPruebas) {
      console.error(`💥 ${totalPruebas - pruebasExitosas} prueba(s) fallaron.`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error("❌ Error catastrófico durante la batería de pruebas:", error.message);
    process.exit(1);
  } finally {
    memory.close();
  }
}

runStressTest();
