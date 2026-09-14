/**
 * Master E2E Test Runner for Dental Finance
 * 
 * Executes all 4 Tiers of tests (Tiers 1 to 4) covering requirements R1 to R8:
 * - Tier 1: Feature Coverage (>=5 tests per requirement R1 to R8)
 * - Tier 2: Boundary & Corner Cases (>=5 tests per requirement R1 to R8)
 * - Tier 3: Cross-Feature Combinations (Pairwise)
 * - Tier 4: Real-World Clinical Journeys (>=5 full scenarios)
 * 
 * Run with: npx tsx tests/e2e/runner.ts
 */

import { MockLocalStorage, runAllTests, TestSuiteSummary, TestResult } from './harness/testHarness';

// Ensure storage polyfill is active before suites load
if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = new MockLocalStorage();
}

// ANSI colors for clean terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
};

async function main() {
  console.log(`\n${colors.bright}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}         DENTAL FINANCE — SUÍTE DE TESTES E2E OPAQUE-BOX (TIERS 1 A 4)          ${colors.reset}`);
  console.log(`${colors.dim}  Auditoria de UX, Consistência Operacional e Conformidade Fiscal (R1 a R8)${colors.reset}`);
  console.log(`${colors.cyan}================================================================================${colors.reset}\n`);

  console.log(`${colors.dim}Carregando suítes de testes...${colors.reset}`);

  // Import test suites to register test cases
  await import('./tier1-feature-coverage.test');
  await import('./tier2-boundary-corner.test');
  await import('./tier3-pairwise.test');
  await import('./tier4-real-world-scenarios.test');
  await import('./rodada7-verification.test');
  await import('./rodada8-verification.test');
  await import('./rodada9-verification.test');
  await import('./rodada10-verification.test');
  await import('./rodada11-verification.test');
  await import('./rodada12-verification.test');
  await import('./rodada13-verification.test');
  await import('./rodada14-verification.test');
  await import('./rodada15-verification.test');
  await import('./rodada17-verification.test');

  console.log(`${colors.green}Suítes carregadas. Executando testes automatizados...${colors.reset}\n`);

  const summary: TestSuiteSummary = await runAllTests();

  // Print results grouped by suite
  const suiteGroups = new Map<string, TestResult[]>();
  for (const r of summary.results) {
    if (!suiteGroups.has(r.suite)) {
      suiteGroups.set(r.suite, []);
    }
    suiteGroups.get(r.suite)!.push(r);
  }

  for (const [suiteName, tests] of suiteGroups.entries()) {
    const allPassed = tests.every(t => t.passed);
    const badge = allPassed
      ? `${colors.green}✔ PASS${colors.reset}`
      : `${colors.red}✖ FAIL${colors.reset}`;

    console.log(`\n${badge} ${colors.bright}${suiteName}${colors.reset} ${colors.dim}(${tests.length} testes)${colors.reset}`);

    for (const t of tests) {
      const statusIcon = t.passed
        ? `${colors.green}  ✓${colors.reset}`
        : `${colors.red}  ✗${colors.reset}`;
      const reqTag = t.requirement ? `${colors.cyan}[${t.requirement}]${colors.reset} ` : '';
      console.log(`${statusIcon} ${reqTag}${t.name} ${colors.dim}(${t.durationMs}ms)${colors.reset}`);
      if (!t.passed && t.error) {
        console.log(`     ${colors.red}Erro:${colors.reset} ${t.error.message}`);
      }
    }
  }

  // Summary Metrics Table
  console.log(`\n${colors.cyan}================================================================================${colors.reset}`);
  console.log(`${colors.bright}RELATÓRIO DE COBERTURA E RESULTADOS DA SUÍTE E2E${colors.reset}`);
  console.log(`${colors.cyan}================================================================================${colors.reset}`);

  console.log(`\n${colors.bright}Detalhamento por Tier de Teste:${colors.reset}`);
  console.log(`  • ${colors.cyan}Tier 1 (Feature Coverage R1-R8):${colors.reset}       ${summary.byTier[1].passed}/${summary.byTier[1].total} aprovados`);
  console.log(`  • ${colors.cyan}Tier 2 (Boundary & Corner Cases):${colors.reset}      ${summary.byTier[2].passed}/${summary.byTier[2].total} aprovados`);
  console.log(`  • ${colors.cyan}Tier 3 (Cross-Feature Combinations):${colors.reset}   ${summary.byTier[3].passed}/${summary.byTier[3].total} aprovados`);
  console.log(`  • ${colors.cyan}Tier 4 (Real-World Clinical Journeys):${colors.reset} ${summary.byTier[4].passed}/${summary.byTier[4].total} aprovados`);

  console.log(`\n${colors.bright}Detalhamento por Requisito Funcional (R1 a R8):${colors.reset}`);
  for (const [req, stats] of Object.entries(summary.byRequirement)) {
    const statusColor = stats.failed === 0 ? colors.green : colors.red;
    console.log(`  • Requisito ${colors.bright}${req}${colors.reset}: ${statusColor}${stats.passed}/${stats.total} testes aprovados${colors.reset}`);
  }

  console.log(`\n${colors.dim}--------------------------------------------------------------------------------${colors.reset}`);
  console.log(`Tempo Total de Execução: ${colors.bright}${summary.durationMs}ms${colors.reset}`);
  console.log(`Total de Casos de Teste: ${colors.bright}${summary.total}${colors.reset}`);
  console.log(`Aprovados:               ${colors.green}${colors.bright}${summary.passed}${colors.reset}`);
  console.log(`Falhas / Defeitos:       ${summary.failed > 0 ? colors.red : colors.green}${colors.bright}${summary.failed}${colors.reset}`);
  console.log(`${colors.cyan}================================================================================${colors.reset}\n`);

  if (summary.failed > 0) {
    console.error(`${colors.bgRed}${colors.white} ATENÇÃO: ${summary.failed} teste(s) falharam. Verifique os logs e escale os defeitos. ${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.bgGreen}${colors.white} SUCESSO: 100% dos testes da suíte E2E passaram com sucesso! ${colors.reset}\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Falha fatal ao executar suíte E2E:', err);
  process.exit(1);
});
