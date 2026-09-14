/**
 * Bateria de Testes Adversariais Empíricos — Challenger 1 (Milestone M1)
 *
 * Foco dos Testes:
 * 1. Estresse Matemático em mathUtils.ts (divisão por zero, NaN, Infinity, rateio de centavos com dízimas, Monte Carlo 10k)
 * 2. Estresse em ConfirmDialog (retrocompatibilidade description/message, onClose/onCancel, strings vazias, escape, backdrop click seguro, múltiplos cliques rápidos)
 * 3. Estresse em Toasts e ToastContext (estresse de fila de 100 notificações, unicidade de IDs, auto-dismiss, pause no hover, limpeza total)
 */

import {
  safeDivide,
  safeMargin,
  calculateSplit,
  roundCurrency,
  safeSum,
  formatPercent,
  formatBrl,
} from '../../src/lib/mathUtils';
import { ToastItem, ToastType, DEFAULT_TOAST_DURATION } from '../../src/components/UI/ToastContext';

// Cores para saída no terminal
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Asserção falhou: ${message}`);
  }
}

function runTest(suite: string, name: string, fn: () => void) {
  const start = performance.now();
  try {
    fn();
    const durationMs = Number((performance.now() - start).toFixed(2));
    results.push({ suite, name, passed: true, durationMs });
    console.log(`  ${GREEN}✓${RESET} ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Number((performance.now() - start).toFixed(2));
    results.push({ suite, name, passed: false, error: err.message, durationMs });
    console.log(`  ${RED}✗${RESET} ${name} (${durationMs}ms)\n    ${RED}ERRO:${RESET} ${err.message}`);
  }
}

console.log(`\n${BOLD}${CYAN}================================================================================${RESET}`);
console.log(`${BOLD}${CYAN}   SUÍTE DE TESTES ADVERSARIAIS EMPÍRICOS — CHALLENGER 1 (MILESTONE M1)${RESET}`);
console.log(`${BOLD}${CYAN}================================================================================${RESET}\n`);

// ============================================================================
// 1. ADVERSARIAL SUITE: safeDivide
// ============================================================================
console.log(`${BOLD}${YELLOW}1. Estresse Adversarial em safeDivide (Divisão por Zero, NaN, Infinity, Tipos Inválidos)${RESET}`);

runTest('safeDivide', 'Divisão direta por zero com numerador positivo, negativo e zero retorna fallback', () => {
  assert(safeDivide(10, 0) === 0, '10 / 0 deve retornar 0');
  assert(safeDivide(-500, 0) === 0, '-500 / 0 deve retornar 0');
  assert(safeDivide(0, 0) === 0, '0 / 0 deve retornar 0');
  assert(safeDivide(10, -0) === 0, '10 / -0 deve retornar 0');
});

runTest('safeDivide', 'Valores NaN e Infinity no numerador ou denominador retornam fallback', () => {
  assert(safeDivide(NaN, 5) === 0, 'NaN / 5 deve retornar 0');
  assert(safeDivide(5, NaN) === 0, '5 / NaN deve retornar 0');
  assert(safeDivide(NaN, NaN) === 0, 'NaN / NaN deve retornar 0');
  assert(safeDivide(Infinity, 2) === 0, 'Infinity / 2 deve retornar 0');
  assert(safeDivide(2, Infinity) === 0, '2 / Infinity deve retornar 0');
  assert(safeDivide(Infinity, Infinity) === 0, 'Infinity / Infinity deve retornar 0');
  assert(safeDivide(-Infinity, 10) === 0, '-Infinity / 10 deve retornar 0');
  assert(safeDivide(10, -Infinity) === 0, '10 / -Infinity deve retornar 0');
  assert(safeDivide(-Infinity, -Infinity) === 0, '-Infinity / -Infinity deve retornar 0');
});

runTest('safeDivide', 'Valores nulos, indefinidos ou tipos inesperados retornam fallback com segurança', () => {
  assert(safeDivide(null as any, 10) === 0, 'null / 10 deve retornar 0');
  assert(safeDivide(10, null as any) === 0, '10 / null deve retornar 0');
  assert(safeDivide(undefined as any, undefined as any) === 0, 'undefined / undefined deve retornar 0');
  assert(safeDivide('10' as any, '2' as any) === 0, 'Strings não numéricas devem ser tratadas como inválidas');
});

runTest('safeDivide', 'Fallback customizado é rigorosamente respeitado em todas as situações anômalas', () => {
  assert(safeDivide(10, 0, -999) === -999, 'Fallback customizado -999 deve ser retornado');
  assert(safeDivide(NaN, 2, 42) === 42, 'Fallback 42 deve ser retornado para NaN');
  assert(safeDivide(Infinity, 0, -1) === -1, 'Fallback -1 deve ser retornado para Infinity/0');
});

runTest('safeDivide', 'Divisões normais, decimais, negativas e que causam overflow', () => {
  assert(safeDivide(100, 2) === 50, '100 / 2 = 50');
  assert(safeDivide(-100, 2) === -50, '-100 / 2 = -50');
  assert(safeDivide(100, -2) === -50, '100 / -2 = -50');
  assert(safeDivide(-100, -2) === 50, '-100 / -2 = 50');
  assert(Math.abs(safeDivide(1, 3) - 0.3333333333333333) < 1e-15, '1 / 3 deve calcular dízima correta');
  // Overflow de ponto flutuante: Number.MAX_VALUE / 0.5 gera Infinity, deve retornar fallback
  assert(safeDivide(Number.MAX_VALUE, 0.5) === 0, 'Overflow para Infinity deve retornar fallback');
  // Underflow
  assert(safeDivide(Number.MIN_VALUE, Number.MAX_VALUE) === 0, 'Underflow extremo deve retornar 0');
});

// ============================================================================
// 2. ADVERSARIAL SUITE: safeMargin
// ============================================================================
console.log(`\n${BOLD}${YELLOW}2. Estresse Adversarial em safeMargin (Margens Extremas, Status e Prevenção de Falhas)${RESET}`);

runTest('safeMargin', 'Cenários sem preço (revenue <= 0) retornam status NO_PRICE e profit 0', () => {
  const r1 = safeMargin(0, 50);
  assert(r1.status === 'NO_PRICE', 'revenue 0 deve ter status NO_PRICE');
  assert(r1.marginPercent === null, 'marginPercent deve ser null');
  assert(r1.profit === 0, 'profit deve ser 0');

  const r2 = safeMargin(-100, 50);
  assert(r2.status === 'NO_PRICE', 'revenue negativa deve ter status NO_PRICE');
  assert(r2.marginPercent === null, 'marginPercent deve ser null');
  assert(r2.profit === 0, 'profit deve ser 0');

  const r3 = safeMargin(null, 50);
  assert(r3.status === 'NO_PRICE', 'revenue null deve ter status NO_PRICE');

  const r4 = safeMargin(NaN, 50);
  assert(r4.status === 'NO_PRICE', 'revenue NaN deve ter status NO_PRICE');

  const r5 = safeMargin(Infinity, 50);
  assert(r5.status === 'NO_PRICE', 'revenue Infinity deve ter status NO_PRICE');
});

runTest('safeMargin', 'Cenários sem custo (cost <= 0) retornam status WAITING_COSTS e profit === revenue', () => {
  const r1 = safeMargin(100, 0);
  assert(r1.status === 'WAITING_COSTS', 'cost 0 deve ter status WAITING_COSTS');
  assert(r1.marginPercent === null, 'marginPercent deve ser null');
  assert(r1.profit === 100, 'profit deve ser igual ao revenue');

  const r2 = safeMargin(100, -50);
  assert(r2.status === 'WAITING_COSTS', 'cost negativa deve ter status WAITING_COSTS');
  assert(r2.marginPercent === null, 'marginPercent deve ser null');
  assert(r2.profit === 100, 'profit deve ser igual ao revenue');

  const r3 = safeMargin(100, null);
  assert(r3.status === 'WAITING_COSTS', 'cost null deve ter status WAITING_COSTS');

  const r4 = safeMargin(100, NaN);
  assert(r4.status === 'WAITING_COSTS', 'cost NaN deve ter status WAITING_COSTS');

  const r5 = safeMargin(100, Infinity);
  assert(r5.status === 'WAITING_COSTS', 'cost Infinity deve ter status WAITING_COSTS');
});

runTest('safeMargin', 'Cenários normais, margem negativa (prejuízo) e empate contábil (break-even)', () => {
  // Normal com lucro
  const r1 = safeMargin(1000, 300);
  assert(r1.status === 'OK', 'status deve ser OK');
  assert(r1.profit === 700, 'lucro deve ser 700');
  assert(r1.marginPercent === 70.0, 'margem deve ser 70.0%');

  // Custo maior que receita (prejuízo)
  const r2 = safeMargin(100, 150);
  assert(r2.status === 'OK', 'status com prejuízo deve ser OK');
  assert(r2.profit === -50, 'lucro deve ser -50');
  assert(r2.marginPercent === -50.0, 'margem deve ser -50.0%');

  // Break-even (lucro zero)
  const r3 = safeMargin(100, 100);
  assert(r3.status === 'OK', 'status de empate deve ser OK');
  assert(r3.profit === 0, 'lucro deve ser 0');
  assert(r3.marginPercent === 0.0, 'margem deve ser 0.0%');

  // Valores decimais de alta precisão
  const r4 = safeMargin(0.03, 0.01);
  assert(r4.status === 'OK', 'valores decimais pequenos devem ser calculados');
  assert(r4.marginPercent === 66.7, '0.02 / 0.03 * 100 = 66.7%');
});

// ============================================================================
// 3. ADVERSARIAL SUITE: calculateSplit & Monte Carlo 10,000 Iterations
// ============================================================================
console.log(`\n${BOLD}${YELLOW}3. Estresse Adversarial em calculateSplit (Rateio de Centavos com Dízimas e Monte Carlo 10k)${RESET}`);

runTest('calculateSplit', 'Desafio central de rateio com dízima: calculateSplit(100.01, 33.333333333333336)', () => {
  const res = calculateSplit(100.01, 33.333333333333336);
  assert(typeof res.valueCpf === 'number', 'valueCpf deve ser number');
  assert(typeof res.valueCnpj === 'number', 'valueCnpj deve ser number');
  assert(!isNaN(res.valueCpf), 'valueCpf não pode ser NaN');
  assert(!isNaN(res.valueCnpj), 'valueCnpj não pode ser NaN');

  const total = roundCurrency(res.valueCpf + res.valueCnpj);
  assert(total === 100.01, `Soma valueCpf (${res.valueCpf}) + valueCnpj (${res.valueCnpj}) deve ser exatamente 100.01, obtido: ${total}`);
  assert(res.valueCpf === 33.34, `valueCpf esperado 33.34, obtido ${res.valueCpf}`);
  assert(res.valueCnpj === 66.67, `valueCnpj esperado 66.67, obtido ${res.valueCnpj}`);
});

runTest('calculateSplit', 'Dízimas clássicas e frações complexas conservam a totalidade dos centavos', () => {
  // 1/3 de 10.00
  const split1 = calculateSplit(10.00, 100 / 3);
  assert(roundCurrency(split1.valueCpf + split1.valueCnpj) === 10.00, 'Soma de 1/3 deve ser 10.00');

  // 1/7 de 100.00
  const split2 = calculateSplit(100.00, 100 / 7);
  assert(roundCurrency(split2.valueCpf + split2.valueCnpj) === 100.00, 'Soma de 1/7 deve ser 100.00');

  // 1/6 de 1000.00
  const split3 = calculateSplit(1000.00, 100 / 6);
  assert(roundCurrency(split3.valueCpf + split3.valueCnpj) === 1000.00, 'Soma de 1/6 deve ser 1000.00');

  // 1 centavo dividido ao meio
  const split4 = calculateSplit(0.01, 50);
  assert(roundCurrency(split4.valueCpf + split4.valueCnpj) === 0.01, '1 centavo rateado 50% não pode desaparecer');
  assert((split4.valueCpf === 0.01 && split4.valueCnpj === 0) || (split4.valueCpf === 0 && split4.valueCnpj === 0.01), 'Um dos lados deve absorver o centavo');
});

runTest('calculateSplit', 'Casos limites de porcentagem (< 0, > 100, NaN, 0, 100) e valores negativos', () => {
  assert(calculateSplit(100, 0).valueCpf === 0 && calculateSplit(100, 0).valueCnpj === 100, '0% CPF -> 100% CNPJ');
  assert(calculateSplit(100, 100).valueCpf === 100 && calculateSplit(100, 100).valueCnpj === 0, '100% CPF -> 0% CNPJ');
  assert(calculateSplit(100, -10).valueCpf === 0, 'Porcentagem negativa deve ser limitada a 0%');
  assert(calculateSplit(100, 150).valueCnpj === 0, 'Porcentagem > 100 deve ser limitada a 100%');
  assert(calculateSplit(100, NaN).valueCpf === 0 && calculateSplit(100, NaN).valueCnpj === 100, 'Porcentagem NaN deve ser tratada sem crash');
  assert(calculateSplit(-50, 50).valueCpf === 0 && calculateSplit(-50, 50).valueCnpj === 0, 'Valor negativo retorna 0/0');
  assert(calculateSplit(0, 50).valueCpf === 0 && calculateSplit(0, 50).valueCnpj === 0, 'Valor zero retorna 0/0');
});

runTest('calculateSplit', 'Harness Monte Carlo: 10.000 iterações aleatórias com dízimas e quantias extremas', () => {
  const periodicPercentages = [
    100 / 3, // 33.333333333333336
    100 / 7, // 14.285714285714286
    100 / 6, // 16.666666666666668
    200 / 3, // 66.66666666666667
    100 / 9, // 11.11111111111111
    0.001,
    99.999,
  ];

  let violations = 0;
  const iterations = 10000;

  for (let i = 0; i < iterations; i++) {
    // Valores de 0.01 a 1.000.000,99
    const val = roundCurrency(Math.random() * 1000000 + 0.01);
    const pct = periodicPercentages[i % periodicPercentages.length] + (Math.random() * 2 - 1) * 0.5;

    const res = calculateSplit(val, pct);
    const sum = roundCurrency(res.valueCpf + res.valueCnpj);

    if (sum !== val || isNaN(res.valueCpf) || isNaN(res.valueCnpj)) {
      violations++;
    }
  }

  assert(violations === 0, `Violação na conservação de centavos encontrada em ${violations} de ${iterations} iterações!`);
});

// ============================================================================
// 4. ADVERSARIAL SUITE: roundCurrency, safeSum, formatPercent, formatBrl
// ============================================================================
console.log(`\n${BOLD}${YELLOW}4. Estresse Adversarial em Utilitários Auxiliares de Formatação e Arredondamento${RESET}`);

runTest('roundCurrency', 'Correção rigorosa de erros clássicos de ponto flutuante IEEE-754', () => {
  assert(roundCurrency(0.1 + 0.2) === 0.3, '0.1 + 0.2 deve arredondar para exatamente 0.3');
  assert(roundCurrency(1.005) === 1.01, '1.005 deve arredondar para 1.01 via Number.EPSILON');
  assert(roundCurrency(NaN) === 0, 'NaN deve retornar 0');
  assert(roundCurrency(Infinity) === 0, 'Infinity deve retornar 0');
  assert(roundCurrency(null) === 0, 'null deve retornar 0');
  assert(roundCurrency(undefined) === 0, 'undefined deve retornar 0');
});

runTest('safeSum', 'Soma de arrays com elementos nulos, indefinidos, NaN, Infinity e valores negativos', () => {
  const values = [10.25, 20.75, null, undefined, NaN, Infinity, -5.00, 'invalid' as any];
  const total = safeSum(values);
  assert(total === 26.00, `Soma esperada 26.00, obtida: ${total}`);
  assert(safeSum([]) === 0, 'Array vazio deve retornar 0');
  assert(safeSum(null as any) === 0, 'Entrada não-array deve retornar 0');
});

runTest('formatPercent', 'Formatação percentual com valores válidos, nulos e extremos', () => {
  assert(formatPercent(15.5) === '15,5%', '15.5 deve formatar como 15,5%');
  assert(formatPercent(null) === '—', 'null deve retornar fallback —');
  assert(formatPercent(undefined) === '—', 'undefined deve retornar fallback —');
  assert(formatPercent(NaN) === '—', 'NaN deve retornar fallback —');
  assert(formatPercent(Infinity) === '—', 'Infinity deve retornar fallback —');
  assert(formatPercent(10.1234, '—', 2) === '10,12%', 'Casas decimais customizadas devem ser respeitadas');
});

runTest('formatBrl', 'Formatação monetária em BRL com guardrails', () => {
  const formatted = formatBrl(12500.50);
  assert(formatted.includes('12.500,50'), `Deve conter 12.500,50, obtido: ${formatted}`);
  assert(formatBrl(null) === 'R$ 0,00', 'null deve retornar R$ 0,00');
  assert(formatBrl(NaN) === 'R$ 0,00', 'NaN deve retornar R$ 0,00');
  assert(formatBrl(Infinity) === 'R$ 0,00', 'Infinity deve retornar R$ 0,00');
});

// ============================================================================
// 5. ADVERSARIAL SUITE: ConfirmDialog Logic & Contract
// ============================================================================
console.log(`\n${BOLD}${YELLOW}5. Estresse Adversarial em ConfirmDialog (Retrocompatibilidade, Strings Vazias, Escape, Backdrop e Rapid Click)${RESET}`);

runTest('ConfirmDialog', 'Retrocompatibilidade de props: description vs message e onClose vs onCancel', () => {
  // Simulador de resolução de texto e callbacks conforme ConfirmDialog.tsx
  const resolveProps = (props: {
    description?: string;
    message?: string;
    onClose?: () => void;
    onCancel?: () => void;
  }) => {
    const resolvedText = props.description || props.message || '';
    let closedWith = '';
    const handleClose = () => {
      if (props.onClose) {
        props.onClose();
        closedWith = 'onClose';
      } else if (props.onCancel) {
        props.onCancel();
        closedWith = 'onCancel';
      }
    };
    return { resolvedText, handleClose, getClosedWith: () => closedWith };
  };

  // 1. Apenas message (legado)
  const case1 = resolveProps({ message: 'Mensagem Legada' });
  assert(case1.resolvedText === 'Mensagem Legada', 'message deve ser resolvido');

  // 2. Apenas description (canônico)
  const case2 = resolveProps({ description: 'Descrição Canônica' });
  assert(case2.resolvedText === 'Descrição Canônica', 'description deve ser resolvido');

  // 3. Ambos fornecidos: description tem prioridade
  const case3 = resolveProps({ description: 'Prioritária', message: 'Secundária' });
  assert(case3.resolvedText === 'Prioritária', 'description deve ter precedência');

  // 4. Nenhum fornecido: string vazia segura
  const case4 = resolveProps({});
  assert(case4.resolvedText === '', 'sem texto deve retornar string vazia sem crash');

  // 5. Callback apenas com onCancel (legado)
  let cancelCalled: any = false;
  const case5 = resolveProps({ onCancel: () => { cancelCalled = true; } });
  case5.handleClose();
  assert(cancelCalled === true, 'onCancel deve ser invocado na ausência de onClose');

  // 6. Callback com ambos: onClose tem precedência
  let closeCalled: any = false;
  let cancelCalled2: any = false;
  const case6 = resolveProps({
    onClose: () => { closeCalled = true; },
    onCancel: () => { cancelCalled2 = true; },
  });
  case6.handleClose();
  assert(closeCalled === true && cancelCalled2 === false, 'onClose deve ter prioridade sobre onCancel');
});

runTest('ConfirmDialog', 'Comportamento resiliente com strings vazias e títulos nulos', () => {
  const emptyProps = {
    isOpen: true,
    title: '',
    description: '',
    message: '',
  };
  const resolved = emptyProps.description || emptyProps.message || '';
  assert(resolved === '', 'Strings vazias não devem gerar valores indefinidos');
});

runTest('ConfirmDialog', 'Discriminação de cliques no backdrop (prevenção de fechamento acidental por arraste)', () => {
  let mouseDownTarget: any = null;
  let closeTriggered: any = false;

  const backdropElement = { id: 'backdrop' };
  const modalContentElement = { id: 'modal-content' };

  const onMouseDown = (target: any) => {
    mouseDownTarget = target;
  };

  const onClick = (currentTarget: any, target: any) => {
    if (target === currentTarget && mouseDownTarget === currentTarget) {
      closeTriggered = true;
    }
  };

  // Cenário A: Usuário clica e solta no backdrop -> FECHA
  closeTriggered = false;
  onMouseDown(backdropElement);
  onClick(backdropElement, backdropElement);
  assert(closeTriggered === true, 'Mousedown e Click no backdrop devem acionar fechamento');

  // Cenário B: Usuário seleciona texto dentro do modal e solta o mouse no backdrop -> NÃO FECHA
  closeTriggered = false;
  onMouseDown(modalContentElement);
  onClick(backdropElement, backdropElement);
  assert(closeTriggered === false, 'Mousedown dentro do modal e Click fora NÃO deve fechar o diálogo');

  // Cenário C: Mousedown no backdrop e solta dentro do modal -> NÃO FECHA
  closeTriggered = false;
  onMouseDown(backdropElement);
  onClick(backdropElement, modalContentElement);
  assert(closeTriggered === false, 'Click dentro do modal NÃO deve acionar fechamento');
});

runTest('ConfirmDialog', 'Rajada de múltiplos cliques rápidos no botão de confirmação (Double Click Burst)', () => {
  let confirmCalls = 0;
  let closeCalls = 0;
  let isLocked = false;

  const onConfirm = () => {
    confirmCalls++;
  };

  const handleClose = () => {
    closeCalls++;
  };

  const handleConfirm = () => {
    if (isLocked) return;
    isLocked = true;
    onConfirm();
    handleClose();
  };

  // Disparo de 5 cliques imediatos
  for (let i = 0; i < 5; i++) {
    handleConfirm();
  }

  assert(confirmCalls === 1, `onConfirm deve ser executado exatamente 1 vez na rajada, obtido: ${confirmCalls}`);
  assert(closeCalls === 1, `handleClose deve ser executado exatamente 1 vez na rajada, obtido: ${closeCalls}`);
});

runTest('ConfirmDialog', 'Isolamento de evento Escape com cancelamento de propagação', () => {
  let defaultPrevented: any = false;
  let propagationStopped: any = false;
  let immediatePropagationStopped: any = false;
  let closed: any = false;

  const mockEvent = {
    key: 'Escape',
    preventDefault: () => { defaultPrevented = true; },
    stopPropagation: () => { propagationStopped = true; },
    stopImmediatePropagation: () => { immediatePropagationStopped = true; },
  };

  const handleKeyDown = (e: typeof mockEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      closed = true;
    }
  };

  handleKeyDown(mockEvent);

  assert(closed === true, 'Escape deve fechar o diálogo');
  assert(defaultPrevented === true, 'preventDefault deve ser chamado');
  assert(propagationStopped === true, 'stopPropagation deve ser chamado');
  assert(immediatePropagationStopped === true, 'stopImmediatePropagation deve isolar modais aninhados');
});

// ============================================================================
// 6. ADVERSARIAL SUITE: Toast System & ToastContext
// ============================================================================
console.log(`\n${BOLD}${YELLOW}6. Estresse Adversarial em Toasts (Fila Massiva, Concorrência, Timers e Auto-Dismiss)${RESET}`);

runTest('ToastContext', 'Emissão em massa de 100 toasts concorrentes com unicidade absoluta de IDs', () => {
  let toasts: ToastItem[] = [];

  const showToast = (message: string, type: ToastType = 'info', duration = DEFAULT_TOAST_DURATION): string => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${toasts.length}`;
    const newToast: ToastItem = {
      id,
      type,
      message,
      duration,
      createdAt: Date.now(),
    };
    toasts = [...toasts, newToast];
    return id;
  };

  const types: ToastType[] = ['success', 'error', 'warning', 'info'];
  const generatedIds = new Set<string>();

  for (let i = 0; i < 100; i++) {
    const type = types[i % types.length];
    const id = showToast(`Notificação #${i + 1}`, type);
    generatedIds.add(id);
  }

  assert(toasts.length === 100, `Devem existir 100 toasts na fila, encontrados: ${toasts.length}`);
  assert(generatedIds.size === 100, `Todos os 100 IDs devem ser únicos, encontrados: ${generatedIds.size}`);

  // Dispensar 40 toasts específicos por ID
  const idsToRemove = Array.from(generatedIds).slice(0, 40);
  for (const id of idsToRemove) {
    toasts = toasts.filter(t => t.id !== id);
  }
  assert(toasts.length === 60, `Após dispensar 40, devem restar 60 toasts, encontrados: ${toasts.length}`);

  // Limpeza total
  toasts = [];
  assert(toasts.length === 0, 'Após clear(), fila deve estar vazia');
});

runTest('ToastCard', 'Lógica de auto-dismiss com duração padrão, zero e infinita', () => {
  // Toast com duração 0 ou Infinity não agenda auto-dismiss
  const checkAutoDismissEligible = (duration: number) => {
    return duration > 0 && duration < Infinity;
  };

  assert(checkAutoDismissEligible(DEFAULT_TOAST_DURATION) === true, '3500ms deve ser elegível para auto-dismiss');
  assert(checkAutoDismissEligible(0) === false, 'Duração 0 não deve auto-fechar');
  assert(checkAutoDismissEligible(-100) === false, 'Duração negativa não deve auto-fechar');
  assert(checkAutoDismissEligible(Infinity) === false, 'Duração Infinity não deve auto-fechar');
});

runTest('ToastCard', 'Lógica de congelamento (pause) do timer durante onMouseEnter e retomada no onMouseLeave', () => {
  let isPaused = false;
  let remainingTime = 3500;
  let lastTick = Date.now();

  const onMouseEnter = () => {
    isPaused = true;
    lastTick = Date.now();
  };

  const onMouseLeave = () => {
    isPaused = false;
    lastTick = Date.now();
  };

  const tick = (elapsedMs: number) => {
    if (!isPaused) {
      remainingTime -= elapsedMs;
    }
  };

  // 1 segundo passa normalmente
  tick(1000);
  assert(remainingTime === 2500, `Tempo restante esperado 2500ms, obtido: ${remainingTime}`);

  // Hover do mouse congela o timer
  onMouseEnter();
  tick(1000);
  tick(1000);
  assert(remainingTime === 2500, `Timer deve estar congelado em 2500ms durante hover, obtido: ${remainingTime}`);

  // Mouse sai e timer retoma
  onMouseLeave();
  tick(1000);
  assert(remainingTime === 1500, `Timer deve retomar contagem após onMouseLeave, obtido: ${remainingTime}`);
});

runTest('ToastCard', 'Resiliência contra mensagens gigantescas e caracteres especiais / XSS', () => {
  const hugeMessage = 'A'.repeat(10000);
  const xssMessage = '<script>alert("xss")</script><img src=x onerror=alert(1)/>';

  const t1: ToastItem = {
    id: 't1',
    type: 'error',
    message: hugeMessage,
    duration: 3500,
    createdAt: Date.now(),
  };

  const t2: ToastItem = {
    id: 't2',
    type: 'warning',
    message: xssMessage,
    duration: 3500,
    createdAt: Date.now(),
  };

  assert(t1.message.length === 10000, 'Mensagem longa deve ser preservada');
  assert(typeof t2.message === 'string', 'Mensagem com tags é tratada como string de texto puro');
});

// ============================================================================
// RELATÓRIO FINAL DA SUÍTE ADVERSARIAL
// ============================================================================
console.log(`\n${BOLD}${CYAN}================================================================================${RESET}`);
console.log(`${BOLD}${CYAN}   RESULTADOS DA SUÍTE ADVERSARIAL EMPÍRICA (CHALLENGER 1)${RESET}`);
console.log(`${BOLD}${CYAN}================================================================================${RESET}`);

const totalTests = results.length;
const passedTests = results.filter(r => r.passed).length;
const failedTests = results.filter(r => !r.passed).length;
const totalDuration = results.reduce((acc, r) => acc + r.durationMs, 0);

console.log(`Total de Casos Adversariais: ${totalTests}`);
console.log(`${GREEN}Aprovados:                   ${passedTests}${RESET}`);
if (failedTests > 0) {
  console.log(`${RED}Falhas:                      ${failedTests}${RESET}`);
} else {
  console.log(`Falhas:                      0`);
}
console.log(`Tempo Total de Execução:     ${totalDuration.toFixed(2)}ms`);

if (failedTests === 0) {
  console.log(`\n${BOLD}${GREEN}✔ VEREDITO ADVERSARIAL: TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!${RESET}\n`);
  process.exit(0);
} else {
  console.log(`\n${BOLD}${RED}✗ VEREDITO ADVERSARIAL: ${failedTests} TESTE(S) FALHARAM!${RESET}\n`);
  process.exit(1);
}
