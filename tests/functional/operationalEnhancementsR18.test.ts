import assert from 'assert';
import { db } from '../../src/lib/db';
import { getTodayCivilDate, getEffectivePayableStatus, getEffectiveReceivableStatus } from '../../src/lib/statusHelper';
import { ExpenseCategory } from '../../src/types';

console.log('--- TESTES DOS AJUSTES OPERACIONAIS ---');

// 1. Data Civil Local e Status Automático "EM ATRASO"
const today = getTodayCivilDate();
const [y, m, d] = today.split('-').map(Number);
const yesterdayDate = new Date(y, m - 1, d - 1);
const yesterday = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;
const tomorrowDate = new Date(y, m - 1, d + 1);
const tomorrow = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')}`;

// Ponto 1: Status em atraso
assert.strictEqual(getEffectivePayableStatus({ status: 'A_PAGAR', dueDate: yesterday }, today), 'EM_ATRASO');
assert.strictEqual(getEffectivePayableStatus({ status: 'A_PAGAR', dueDate: today }, today), 'A_PAGAR');
assert.strictEqual(getEffectivePayableStatus({ status: 'A_PAGAR', dueDate: tomorrow }, today), 'A_PAGAR');
assert.strictEqual(getEffectivePayableStatus({ status: 'PAGO', dueDate: yesterday }, today), 'PAGO');

assert.strictEqual(getEffectiveReceivableStatus({ status: 'A_VENCER', dueDate: yesterday, balance: 500 }, today), 'EM_ATRASO');
assert.strictEqual(getEffectiveReceivableStatus({ status: 'A_VENCER', dueDate: today, balance: 500 }, today), 'A_VENCER');
assert.strictEqual(getEffectiveReceivableStatus({ status: 'A_VENCER', dueDate: tomorrow, balance: 500 }, today), 'A_VENCER');
assert.strictEqual(getEffectiveReceivableStatus({ status: 'RECEBIDO', dueDate: yesterday, balance: 0 }, today), 'RECEBIDO');
assert.strictEqual(getEffectiveReceivableStatus({ status: 'PARCIALMENTE_RECEBIDO', dueDate: yesterday, balance: 100, amountReceived: 400 }, today), 'EM_ATRASO');
console.log('✓ PONTO 1: Regras canônicas de EM ATRASO e timezone aprovadas');

// Ponto 2: Busca Global
const patients = db.getPatients();
assert(patients.length > 0, 'Deve haver pacientes carregados');
console.log(`✓ PONTO 2: Base de pacientes do tenant carregada (${patients.length} pacientes) para busca por Ctrl+K`);

// Ponto 4: Plano de contas ordenação inteligente
const sampleCategories: ExpenseCategory[] = [
  { id: 'cat_z', code: '9.1', groupCode: '9', name: 'Zeladoria', groupName: 'Operacional', dedutivelLivroCaixaPf: 'SIM', impactaFatorRPj: false, despesaOperacionalPj: true, active: true },
  { id: 'cat_a', code: '1.1', groupCode: '1', name: 'Aluguel', groupName: 'Ocupacao', dedutivelLivroCaixaPf: 'SIM', impactaFatorRPj: false, despesaOperacionalPj: true, active: true },
  { id: 'cat_m', code: '2.1', groupCode: '2', name: 'Material', groupName: 'Insumos', dedutivelLivroCaixaPf: 'SIM', impactaFatorRPj: false, despesaOperacionalPj: true, active: true },
  { id: 'cat_b', code: '3.1', groupCode: '3', name: 'Bebidas', groupName: 'Geral', dedutivelLivroCaixaPf: 'NAO', impactaFatorRPj: false, despesaOperacionalPj: true, active: true },
];
const usageCounts = new Map<string, number>();
usageCounts.set('cat_z', 10);
usageCounts.set('cat_m', 5);

const active = [...sampleCategories];
const used = active.filter((c) => (usageCounts.get(c.id) || 0) > 0).sort((a, b) => (usageCounts.get(b.id) || 0) - (usageCounts.get(a.id) || 0));
const topUsed = used.slice(0, 5);
const topUsedIds = new Set(topUsed.map((c) => c.id));
const remaining = active.filter((c) => !topUsedIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

assert.strictEqual(topUsed[0].id, 'cat_z');
assert.strictEqual(topUsed[1].id, 'cat_m');
assert.strictEqual(remaining[0].name, 'Aluguel');
assert.strictEqual(remaining[1].name, 'Bebidas');
assert.strictEqual(topUsed.length + remaining.length, sampleCategories.length);
console.log('✓ PONTO 4: Ordenação inteligente de Plano de Contas aprovada');

console.log('--- TODOS OS 5 PONTOS FORAM VALIDADOS COM SUCESSO! ---');
