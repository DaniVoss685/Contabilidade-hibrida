import fs from 'fs';
import path from 'path';
import {
  safeDivide,
  safeMargin,
  formatPercent,
  roundCurrency,
  safeSum,
  calculateSplit,
  formatBrl,
} from '../../src/lib/mathUtils';
import { formatFileSize } from '../../src/components/UI/ReceiptUploader';
import { DEFAULT_TOAST_DURATION } from '../../src/components/UI/ToastContext';

interface ForensicCheckResult {
  id: string;
  name: string;
  category: 'ANTIFRAUD' | 'ALERT_ERADICATION' | 'MATH_GUARDRAILS' | 'UI_COMPONENTS' | 'TYPESCRIPT_BUILD';
  passed: boolean;
  evidence: string;
}

const forensicResults: ForensicCheckResult[] = [];

function recordCheck(
  id: string,
  name: string,
  category: ForensicCheckResult['category'],
  passed: boolean,
  evidence: string
) {
  forensicResults.push({ id, name, category, passed, evidence });
  const statusIcon = passed ? '✔ PASS' : '❌ FAIL';
  console.log(`[${statusIcon}] [${category}] ${id}: ${name}\n       Evidência: ${evidence}`);
}

console.log('\n================================================================================');
console.log('   AUDITORIA FORENSE INDEPENDENTE DE INTEGRIDADE — MILESTONE M1 (FOUNDATION)');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// CHECK 1: ERRADICAÇÃO ABSOLUTA DE ALERT() NO CÓDIGO-FONTE
// -----------------------------------------------------------------------------
function checkAlertEradication() {
  const srcDir = path.resolve('src');
  const alertMatches: { file: string; line: number; text: string }[] = [];

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (/\.(tsx?|jsx?|html)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          // Ignora comentários de linha única ou tags
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
          // Regex rigorosa para alert( ou window.alert(
          if (/\b(?:window\.|self\.|globalThis\.)?alert\s*\(/.test(line)) {
            alertMatches.push({
              file: path.relative(process.cwd(), fullPath),
              line: index + 1,
              text: trimmed,
            });
          }
        });
      }
    }
  }

  scanDir(srcDir);

  const passed = alertMatches.length === 0;
  const evidence = passed
    ? '0 ocorrências de alert(...) encontradas em toda a árvore src/.'
    : `Encontradas ${alertMatches.length} ocorrências: ${JSON.stringify(alertMatches, null, 2)}`;

  recordCheck(
    'FORENSIC-01',
    'Erradicação de 100% dos alert() nativos na pasta src/',
    'ALERT_ERADICATION',
    passed,
    evidence
  );
}

// -----------------------------------------------------------------------------
// CHECK 2: DETECÇÃO DE HARDCODES, CONSTANTES FALSAS E MOCKS DE FACHADA
// -----------------------------------------------------------------------------
function checkAntifraudPatterns() {
  const targetFiles = [
    'src/components/UI/Toast.tsx',
    'src/components/UI/ToastContext.tsx',
    'src/components/UI/ConfirmDialog.tsx',
    'src/components/UI/ReceiptUploader.tsx',
    'src/components/UI/EmptyState.tsx',
    'src/components/UI/LoadingState.tsx',
    'src/components/UI/ErrorState.tsx',
    'src/components/UI/useModalAccessibility.ts',
    'src/components/UI/Modal.tsx',
    'src/lib/mathUtils.ts',
  ];

  let allExist = true;
  let facadeDetected = false;
  const details: string[] = [];

  for (const relPath of targetFiles) {
    const fullPath = path.resolve(relPath);
    if (!fs.existsSync(fullPath)) {
      allExist = false;
      details.push(`Arquivo obrigatório inexistente: ${relPath}`);
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const size = content.length;
    const lines = content.split('\n').length;

    // Checagem de arquivo oco (facade trivial)
    if (lines < 15 || size < 200) {
      facadeDetected = true;
      details.push(`Arquivo com porte oco/insuficiente (${lines} linhas, ${size} bytes): ${relPath}`);
    }

    // Checagem de métodos stub (ex: throw NotImplemented, return true sem lógica)
    if (
      content.includes('NotImplemented') ||
      content.includes('TODO: implement') ||
      content.includes('placeholder implementation')
    ) {
      facadeDetected = true;
      details.push(`Marcador de stub/TODO encontrado em: ${relPath}`);
    }
  }

  const passed = allExist && !facadeDetected;
  const evidence = passed
    ? `Todos os ${targetFiles.length} arquivos essenciais foram validados com implementação autêntica e sem stubs.`
    : details.join('; ');

  recordCheck(
    'FORENSIC-02',
    'Inspeção Antifraude: Inexistência de stubs, arquivos ocos ou fachadas em componentes M1',
    'ANTIFRAUD',
    passed,
    evidence
  );
}

// -----------------------------------------------------------------------------
// CHECK 3: VERIFICAÇÃO FORENSE DE GUARDRAILS MATEMÁTICOS EM mathUtils.ts
// -----------------------------------------------------------------------------
function checkMathGuardrailsForensic() {
  let subChecksPassed = true;
  const failures: string[] = [];

  // 1. safeDivide
  if (safeDivide(10, 0) !== 0) {
    subChecksPassed = false;
    failures.push('safeDivide(10, 0) falhou em retornar 0');
  }
  if (safeDivide(10, 0, 42) !== 42) {
    subChecksPassed = false;
    failures.push('safeDivide fallback customizado falhou');
  }
  if (safeDivide(NaN, 5) !== 0 || safeDivide(5, NaN) !== 0) {
    subChecksPassed = false;
    failures.push('safeDivide não interceptou NaN');
  }
  if (safeDivide(Infinity, 2) !== 0 || safeDivide(2, Infinity) !== 0) {
    subChecksPassed = false;
    failures.push('safeDivide não interceptou Infinity');
  }
  if (safeDivide(null as any, 2) !== 0 || safeDivide(2, undefined as any) !== 0) {
    subChecksPassed = false;
    failures.push('safeDivide não tratou null/undefined');
  }

  // 2. safeMargin
  const mNoPrice = safeMargin(0, 50);
  if (mNoPrice.status !== 'NO_PRICE' || mNoPrice.marginPercent !== null || mNoPrice.profit !== 0) {
    subChecksPassed = false;
    failures.push(`safeMargin(0, 50) retornou incorretamente: ${JSON.stringify(mNoPrice)}`);
  }

  const mWaitingCosts = safeMargin(100, 0);
  if (mWaitingCosts.status !== 'WAITING_COSTS' || mWaitingCosts.marginPercent !== null || mWaitingCosts.profit !== 100) {
    subChecksPassed = false;
    failures.push(`safeMargin(100, 0) retornou incorretamente: ${JSON.stringify(mWaitingCosts)}`);
  }

  const mWaitingCostsNull = safeMargin(100, null);
  if (mWaitingCostsNull.status !== 'WAITING_COSTS' || mWaitingCostsNull.marginPercent !== null || mWaitingCostsNull.profit !== 100) {
    subChecksPassed = false;
    failures.push(`safeMargin(100, null) retornou incorretamente: ${JSON.stringify(mWaitingCostsNull)}`);
  }

  const mOk = safeMargin(200, 50);
  if (mOk.status !== 'OK' || mOk.marginPercent !== 75.0 || mOk.profit !== 150) {
    subChecksPassed = false;
    failures.push(`safeMargin(200, 50) calculou incorretamente: ${JSON.stringify(mOk)}`);
  }

  // 3. formatPercent
  if (formatPercent(null) !== '—' || formatPercent(undefined) !== '—' || formatPercent(NaN) !== '—') {
    subChecksPassed = false;
    failures.push('formatPercent falhou em retornar fallback "—"');
  }
  if (formatPercent(12.345) !== '12,3%') {
    subChecksPassed = false;
    failures.push(`formatPercent(12.345) retornou ${formatPercent(12.345)}, esperado "12,3%"`);
  }

  // 4. calculateSplit: conservação exata de centavos com Monte Carlo 20.000 iterações
  let splitViolations = 0;
  for (let i = 0; i < 20000; i++) {
    const val = roundCurrency(Math.random() * 10000 + 0.01);
    const pct = Math.random() * 100;
    const { valueCpf, valueCnpj } = calculateSplit(val, pct);
    const sum = roundCurrency(valueCpf + valueCnpj);
    if (sum !== val) {
      splitViolations++;
    }
  }

  if (splitViolations > 0) {
    subChecksPassed = false;
    failures.push(`${splitViolations} violações de centavos detectadas em 20.000 iterações de calculateSplit`);
  }

  const evidence = subChecksPassed
    ? 'safeDivide, safeMargin, formatPercent, roundCurrency e calculateSplit (20k Monte Carlo com 0 violações) verificados.'
    : failures.join('; ');

  recordCheck(
    'FORENSIC-03',
    'Guardrails Matemáticos e Contábeis (Prevenção de Divisão por Zero, NaN, WAITING_COSTS e Rateio de Centavos)',
    'MATH_GUARDRAILS',
    subChecksPassed,
    evidence
  );
}

// -----------------------------------------------------------------------------
// CHECK 4: COMPONENTES UI & CONTRATOS DE INTERFACE
// -----------------------------------------------------------------------------
function checkUIComponentsForensic() {
  let passed = true;
  const notes: string[] = [];

  // 1. Toast Duration Default
  if (DEFAULT_TOAST_DURATION !== 3500) {
    passed = false;
    notes.push(`DEFAULT_TOAST_DURATION é ${DEFAULT_TOAST_DURATION}ms, esperado 3500ms`);
  } else {
    notes.push('DEFAULT_TOAST_DURATION === 3500ms');
  }

  // 2. formatFileSize no ReceiptUploader
  if (formatFileSize(0) !== '0 B') {
    passed = false;
    notes.push(`formatFileSize(0) retornou ${formatFileSize(0)}`);
  }
  if (formatFileSize(1024) !== '1 KB') {
    passed = false;
    notes.push(`formatFileSize(1024) retornou ${formatFileSize(1024)}`);
  }
  if (formatFileSize(5 * 1024 * 1024) !== '5.0 MB') {
    passed = false;
    notes.push(`formatFileSize(5MB) retornou ${formatFileSize(5 * 1024 * 1024)}`);
  }

  // 3. ConfirmDialog Props retrocompatíveis
  const confirmDialogSource = fs.readFileSync(path.resolve('src/components/UI/ConfirmDialog.tsx'), 'utf8');
  if (
    !confirmDialogSource.includes('description') ||
    !confirmDialogSource.includes('message') ||
    !confirmDialogSource.includes('onClose') ||
    !confirmDialogSource.includes('onCancel') ||
    !confirmDialogSource.includes('variant = \'danger\'')
  ) {
    passed = false;
    notes.push('ConfirmDialog não suporta aliases retrocompatíveis description/message ou onClose/onCancel');
  } else {
    notes.push('ConfirmDialog suporta description/message e onClose/onCancel');
  }

  // 4. Modal accessibility & dirty state
  const modalSource = fs.readFileSync(path.resolve('src/components/UI/Modal.tsx'), 'utf8');
  if (!modalSource.includes('useModalAccessibility') || !modalSource.includes('isDirty')) {
    passed = false;
    notes.push('Modal.tsx não integra useModalAccessibility ou isDirty');
  } else {
    notes.push('Modal.tsx integra useModalAccessibility e isDirty');
  }

  recordCheck(
    'FORENSIC-04',
    'Conformidade dos Contratos de Interface dos Componentes UI (Toast, ConfirmDialog, ReceiptUploader, Modal)',
    'UI_COMPONENTS',
    passed,
    notes.join(', ')
  );
}

// -----------------------------------------------------------------------------
// EXECUÇÃO DOS CHECKS
// -----------------------------------------------------------------------------
checkAlertEradication();
checkAntifraudPatterns();
checkMathGuardrailsForensic();
checkUIComponentsForensic();

console.log('\n--------------------------------------------------------------------------------');
const allChecksPassed = forensicResults.every((r) => r.passed);
console.log(`TOTAL DE CHECKS FORENSES: ${forensicResults.length}`);
console.log(`APROVADOS:               ${forensicResults.filter((r) => r.passed).length}`);
console.log(`FALHAS:                  ${forensicResults.filter((r) => !r.passed).length}`);
console.log(`VEREDITO:                ${allChecksPassed ? 'CLEAN' : 'INTEGRITY VIOLATION'}`);
console.log('================================================================================\n');

if (!allChecksPassed) {
  process.exit(1);
}
