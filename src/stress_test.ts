/**
 * ============================================================================
 * FILE: src/memory/stress_test.ts
 * RESPONSIBILITY: Comprehensive 26-Test Stress Suite (Real-World Read/Write,
 * Noise Filtering, Semantic Collision Resolution, and AutoDream Consolidation).
 * ============================================================================
 */
import fs from "fs";
import { MemoryEngine } from "./MemoryEngine.js";

async function runStressTest() {
  console.log("🚀 [STRESS_TEST] Starting 26-Test Intensive Live Suite on MemoryEngine...\n");

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

  let totalTests = 0;
  let successfulTests = 0;

  function assertTest(name: string, condition: boolean, details?: string) {
    totalTests++;
    if (condition) {
      successfulTests++;
      console.log(`✅ [TEST ${totalTests}] ${name} ${details ? `(${details})` : ""}`);
    } else {
      console.error(`❌ [TEST ${totalTests}] FAILED: ${name} ${details ? `(${details})` : ""}`);
    }
  }

  try {
    // ------------------------------------------------------------------------
    // BLOCK 1: Noise & Greeting Filtering (Gatekeeper) - 5 Tests
    // ------------------------------------------------------------------------
    console.log("--- BLOCK 1: Noise & Greeting Filtering (Agent: Gatekeeper) ---");
    
    await memory.save("hello good afternoon");
    assertTest("Regex Filter: Hello good afternoon", (await memory.search("hello")).length === 0);

    await memory.save("ok thanks got it");
    assertTest("Regex Filter: ok thanks got it", (await memory.search("thanks")).length === 0);

    await memory.save("hahahahaha sounds good cool");
    assertTest("Regex Filter: laughter and empty confirmation", (await memory.search("sounds")).length === 0);

    await memory.save("sure sounds good to me");
    assertTest("Regex Filter: sure sounds good to me", (await memory.search("sure")).length === 0);

    await memory.save("got it all set");
    assertTest("Regex Filter: got it all set", (await memory.search("all set")).length === 0);

    // ------------------------------------------------------------------------
    // BLOCK 2: Atomic Fact Extraction (Notary) - 5 Tests
    // ------------------------------------------------------------------------
    console.log("\n--- BLOCK 2: Atomic Fact Extraction (Agent: Notary) ---");

    await memory.save("Primary server Proxmox is active on IP 10.0.0.200");
    const h1 = await memory.search("Proxmox IP 10.0.0.200");
    assertTest("Notary: Extract Proxmox IP .200", h1.length > 0 && h1[0].data.includes("10.0.0.200"));

    await memory.save("User Alice likes to drink double espresso coffee in the morning");
    const h2 = await memory.search("espresso coffee");
    assertTest("Notary: Coffee preference", h2.length > 0 && h2[0].data.includes("espresso"));

    await memory.save("Secondary AdGuard Home container is hosted on IP 10.0.0.96");
    const h3 = await memory.search("AdGuard IP 10.0.0.96");
    assertTest("Notary: AdGuard IP .96", h3.length > 0 && h3[0].data.includes("10.0.0.96"));

    await memory.save("User Bob prefers not to work in noisy environments");
    const h4 = await memory.search("User Bob noisy environments");
    assertTest("Notary: Preference of User Bob", h4.length > 0 && h4[0].data.includes("User Bob"));

    await memory.save("SnapRAID backup script runs daily at 02:00 AM");
    const h5 = await memory.search("SnapRAID 02:00 AM");
    assertTest("Notary: SnapRAID schedule", h5.length > 0 && h5[0].data.includes("SnapRAID"));

    // ------------------------------------------------------------------------
    // BLOCK 3: Additive Facts (Context Coexistence) - 4 Tests
    // ------------------------------------------------------------------------
    console.log("\n--- BLOCK 3: Additive Facts (Context Coexistence) ---");

    await memory.save("User Alice also likes drinking green tea in the afternoon");
    const hAdd1 = await memory.search("espresso coffee or green tea");
    assertTest("Additive Facts: Coffee and Tea Coexist", hAdd1.length >= 2, `Retrieved ${hAdd1.length} facts`);

    await memory.save("Proxmox server also hosts virtual machine VM 101 Tiny11");
    const hAdd2 = await memory.search("Proxmox VM 101 Tiny11");
    assertTest("Additive Facts: Proxmox hosts VM 101", hAdd2.length > 0);

    await memory.save("User Bob prefers studying programming in Python");
    const hAdd3 = await memory.search("User Bob Python");
    assertTest("Additive Facts: User Bob studies Python", hAdd3.length > 0);

    await memory.save("SnapRAID includes parity on backup disk /mnt/parity");
    const hAdd4 = await memory.search("SnapRAID /mnt/parity");
    assertTest("Additive Facts: SnapRAID parity", hAdd4.length > 0);

    // ------------------------------------------------------------------------
    // BLOCK 4: Semantic Arbiter (Soft-Deletes & State Replacement) - 5 Tests
    // ------------------------------------------------------------------------
    console.log("\n--- BLOCK 4: Semantic Arbiter (Soft-Deletes & State Replacement) ---");

    await memory.save("Secondary AdGuard Home container was moved to new IP 10.0.0.97");
    const hCol1 = await memory.search("AdGuard Home IP");
    assertTest("Semantic Arbiter: AdGuard IP updated to .97", hCol1.length > 0 && hCol1[0].data.includes("10.0.0.97"));

    await memory.save("JottaCloud sync service was temporarily paused for maintenance");
    const hCol2 = await memory.search("JottaCloud maintenance");
    assertTest("Semantic Arbiter: JottaCloud paused state", hCol2.length > 0 && hCol2[0].data.includes("paused"));

    await memory.save("JottaCloud sync service was resumed and is 100% operational");
    const hCol3 = await memory.search("JottaCloud operational");
    assertTest("Semantic Arbiter: JottaCloud resumed state", hCol3.length > 0 && hCol3[0].data.includes("operational"));

    await memory.save("User Alice is currently at the office");
    const hCol4 = await memory.search("User Alice location office");
    assertTest("Semantic Arbiter: Alice location at office", hCol4.length > 0 && hCol4[0].data.includes("office"));

    await memory.save("User Alice has returned home");
    const hCol5 = await memory.search("User Alice location home");
    assertTest("Semantic Arbiter: Alice location at home", hCol5.length > 0 && hCol5[0].data.includes("home"));

    // ------------------------------------------------------------------------
    // BLOCK 5: Dual Hybrid Search (FTS5 BM25 + Int8 Vector) - 4 Tests
    // ------------------------------------------------------------------------
    console.log("\n--- BLOCK 5: Dual Hybrid Search (FTS5 BM25 + Int8 Vector) ---");

    const search1 = await memory.search("10.0.0.200", 3);
    assertTest("Exact Dual Search IP: 10.0.0.200", search1.length > 0 && (search1[0].score || 0) >= 0.5, `Score: ${search1[0]?.score?.toFixed(2)}`);

    const search2 = await memory.search("What beverages does Alice prefer?", 3);
    assertTest("Semantic Dual Search: Alice beverages", search2.length > 0, `Facts found: ${search2.length}`);

    const search3 = await memory.search("User Bob programming preferences", 3);
    assertTest("Compound Dual Search: User Bob", search3.length > 0, `Facts found: ${search3.length}`);

    const search4 = await memory.search("SnapRAID parity and schedule", 3);
    assertTest("Compound Dual Search: SnapRAID", search4.length > 0, `Facts found: ${search4.length}`);

    // ------------------------------------------------------------------------
    // BLOCK 6: AutoDream State Orchestrator (Dashboard Consolidation) - 3 Tests
    // ------------------------------------------------------------------------
    console.log("\n--- BLOCK 6: AutoDream State Orchestrator (Dashboard Consolidation) ---");

    const autoDreamResult = await memory.consolidate();
    assertTest("AutoDream: Consolidation Execution", autoDreamResult.statusMessage.includes("AutoDream") || autoDreamResult.narrativeSummary.length > 0, autoDreamResult.statusMessage);

    const dashboardObj = memory.getDashboard();
    assertTest("Dashboard: Read Consolidated State", dashboardObj !== null && dashboardObj.data.length > 0, `Active dashboard: ${dashboardObj?.updated_at}`);

    const searchFinal = await memory.search("server state summary", 3);
    assertTest("Final Search after AutoDream", searchFinal.length > 0);

    // ------------------------------------------------------------------------
    // FINAL SUMMARY
    // ------------------------------------------------------------------------
    console.log("\n==========================================================================");
    console.log(`📊 FINAL STRESS TEST SUMMARY: ${successfulTests} / ${totalTests} TESTS PASSED (${((successfulTests / totalTests) * 100).toFixed(1)}%)`);
    console.log("==========================================================================");

    if (successfulTests < totalTests) {
      console.error(`💥 ${totalTests - successfulTests} test(s) failed.`);
      // FIX R3-1.5: set exitCode instead of calling process.exit() so the
      // finally block below always runs and closes the SQLite connection cleanly.
      process.exitCode = 1;
    }
  } catch (error: any) {
    console.error("❌ Fatal error during test suite:", error.message);
    process.exitCode = 1;
  } finally {
    memory.close();
  }
}

runStressTest();
