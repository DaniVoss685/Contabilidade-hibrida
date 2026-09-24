import { CardFeeRule, CardFeeSettings, PaymentMethod, ReceitaSaudeStatus, ReceivingMode, Sale, SaleInstallment, SettlementProfileId } from '../types';
import {
  computeFee,
  distributeFee,
  findBrand,
  getActiveBrands,
  getActiveSettlementProfile,
  planCardSchedule,
  resolveCardFee,
  resolveReceivingMode,
} from './cardFees';
import { formatPaymentMethodName } from './paymentMethodFormat';

// ---------------------------------------------------------------------------
// Pagamento dividido (até 2 formas na MESMA venda). A venda continua UMA só (bruto = total);
// cada forma é uma ALOCAÇÃO cujos recebíveis são parcelas (`SaleInstallment`) marcadas com
// `allocationNumber` (1|2). Não há tabela/coluna nova: df_sales.installments (jsonb) já é a fonte dos
// recebíveis e cada parcela já carrega forma, bandeira, taxa e snapshot. Vendas antigas (sem
// allocationNumber) são lidas como UMA alocação (número 1).
// Taxa de cartão SEMPRE incide sobre o valor da alocação do cartão (nunca sobre o total da venda).
// ---------------------------------------------------------------------------
export const MAX_PAYMENT_ALLOCATIONS = 2;

const toCents = (v: number) => Math.round(v * 100);
const fromCents = (c: number) => c / 100;

export function isCardMethod(m?: PaymentMethod | string | null): boolean {
  return m === 'CARTAO_CREDITO' || m === 'CARTAO_DEBITO';
}

export interface SplitValidation {
  ok: boolean;
  allocated: number;
  remaining: number; // >0 falta; <0 excede
  message?: string;
}

export function validateSplit(total: number, amounts: number[]): SplitValidation {
  const allocated = fromCents(amounts.reduce((a, v) => a + toCents(Number.isFinite(v) ? v : 0), 0));
  const remaining = fromCents(toCents(total) - toCents(allocated));
  const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (amounts.some((v) => !Number.isFinite(v) || v <= 0)) {
    return { ok: false, allocated, remaining, message: 'Informe um valor maior que zero para cada forma de pagamento.' };
  }
  if (remaining > 0) return { ok: false, allocated, remaining, message: `Faltam ${money(remaining)} para completar o pagamento.` };
  if (remaining < 0) return { ok: false, allocated, remaining, message: `O pagamento excede o valor da venda em ${money(-remaining)}.` };
  return { ok: true, allocated, remaining: 0 };
}

export interface AllocationEvaluation {
  isCard: boolean;
  mode: 'DEBIT' | 'CREDIT';
  customerInstallments: number;
  receivingMode: ReceivingMode;
  feeRule: CardFeeRule | null;
  brandRequiredMissing: boolean;
  missing: boolean; // cartão sem taxa configurada
  feeAmount: number;
  netValue: number;
  key: string;
}

// Avalia UMA alocação. `amount` é o valor DA ALOCAÇÃO (base da taxa) — nunca o total da venda quando há divisão.
export function evaluateAllocation(
  settings: CardFeeSettings | undefined,
  p: {
    method: PaymentMethod;
    amount: number;
    brandId?: string;
    installments: number;
    receivingOverride?: ReceivingMode | '';
    stored?: { key: string; rule: CardFeeRule } | null;
  }
): AllocationEvaluation {
  const isCard = isCardMethod(p.method);
  const mode = p.method === 'CARTAO_DEBITO' ? 'DEBIT' : 'CREDIT';
  const customerInstallments = p.method === 'CARTAO_CREDITO' ? Math.max(1, p.installments) : 1;
  const receivingMode = p.receivingOverride || resolveReceivingMode(settings);
  const key = `${p.brandId || ''}|${p.method}|${customerInstallments}|${receivingMode}`;
  if (!isCard) {
    return { isCard, mode, customerInstallments: 1, receivingMode, feeRule: null, brandRequiredMissing: false, missing: false, feeAmount: 0, netValue: p.amount, key };
  }
  let feeRule: CardFeeRule | null = null;
  let brandRequiredMissing = false;
  if (p.stored && p.stored.key === key) {
    feeRule = p.stored.rule;
  } else if (!p.brandId && getActiveBrands(settings).length > 0) {
    brandRequiredMissing = true;
  } else {
    const res = resolveCardFee(settings, { brandId: p.brandId || undefined, mode, installments: customerInstallments, receivingMode });
    feeRule = res.status === 'CONFIGURED' ? res.rule : null;
  }
  const calc = feeRule ? computeFee(p.amount, feeRule) : { feeAmount: 0, netValue: p.amount };
  return {
    isCard,
    mode,
    customerInstallments,
    receivingMode,
    feeRule,
    brandRequiredMissing,
    missing: !feeRule && !brandRequiredMissing,
    feeAmount: calc.feeAmount,
    netValue: calc.netValue,
    key,
  };
}

export interface AllocationRow {
  number: number;
  total: number;
  value: number;
  fee: number;
  net: number;
  dueDate: string;
}

// Recebíveis da alocação. Não-cartão: 1 recebível. Cartão com bandeira: planCardSchedule (antecipado = 1 líquido em D+N;
// normal = N mensais sobre o valor da ALOCAÇÃO). Cartão sem bandeira (legado/snapshot antigo): N mensais como antes.
export function planAllocation(p: {
  method: PaymentMethod;
  amount: number;
  ev: AllocationEvaluation;
  brandBased: boolean;
  saleDate: string;
  profile?: SettlementProfileId;
}): AllocationRow[] {
  const { ev } = p;
  if (!ev.isCard || !ev.feeRule) {
    return [{ number: 1, total: 1, value: p.amount, fee: 0, net: p.amount, dueDate: p.saleDate }];
  }
  if (p.brandBased) {
    return planCardSchedule({
      gross: p.amount,
      rule: ev.feeRule,
      customerInstallments: ev.customerInstallments,
      saleDate: p.saleDate,
      mode: ev.receivingMode,
      profile: p.profile,
      isCredit: p.method === 'CARTAO_CREDITO',
    }).rows.map((r) => ({ number: r.number, total: r.total, value: r.gross, fee: r.fee, net: r.net, dueDate: r.dueDate }));
  }
  const count = ev.customerInstallments;
  const base = Number((p.amount / count).toFixed(2));
  const values: number[] = [];
  let acc = 0;
  for (let k = 1; k <= count; k++) {
    const v = k === count ? Number((p.amount - acc).toFixed(2)) : base;
    acc += v;
    values.push(v);
  }
  const fees = ev.feeRule.type === 'FIXED' ? distributeFee(computeFee(p.amount, ev.feeRule).feeAmount, values) : values.map((v) => computeFee(v, ev.feeRule!).feeAmount);
  return values.map((v, i) => {
    const d = new Date(p.saleDate);
    d.setMonth(d.getMonth() + i);
    return { number: i + 1, total: count, value: v, fee: fees[i], net: fromCents(toCents(v) - toCents(fees[i])), dueDate: d.toISOString().split('T')[0] };
  });
}

// ---------------------------------------------------------------------------
// Leitura de vendas (novas e antigas)
// ---------------------------------------------------------------------------
export interface SaleAllocationView {
  number: number;
  method: PaymentMethod;
  amount: number; // bruto da alocação
  fee: number;
  net: number;
  received: boolean; // todas as parcelas da alocação recebidas
  brandName?: string;
  customerInstallments?: number;
  receivingMode?: ReceivingMode;
  installmentCount: number;
  installments: SaleInstallment[];
}

export function getSaleAllocations(sale: Pick<Sale, 'installments' | 'paymentMethod' | 'totalValue' | 'installmentsCount'>): SaleAllocationView[] {
  const groups = new Map<number, SaleInstallment[]>();
  (sale.installments || []).forEach((i) => {
    const n = i.allocationNumber || 1;
    groups.set(n, [...(groups.get(n) || []), i]);
  });
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, list]) => {
      const first = list[0];
      const amount = fromCents(list.reduce((s, i) => s + toCents(i.value), 0));
      const fee = fromCents(list.reduce((s, i) => s + toCents(i.cardFeeAmount || 0), 0));
      return {
        number,
        method: (first.paymentMethod || sale.paymentMethod) as PaymentMethod,
        amount,
        fee,
        net: fromCents(toCents(amount) - toCents(fee)),
        received: list.every((i) => i.status === 'RECEBIDO'),
        brandName: first.cardBrandName,
        customerInstallments: first.customerInstallments ?? (list.length > 1 ? list.length : undefined),
        receivingMode: first.receivingMode,
        installmentCount: list.length,
        installments: list,
      };
    });
}

export function isSplitSale(sale: Pick<Sale, 'installments'>): boolean {
  return getSaleAllocations(sale as any).length > 1;
}

// Texto curto para a célula da tabela: "Pix" ou "Pix + Cartão de Crédito". Detalhe completo no title.
export function saleMethodsLabel(sale: Pick<Sale, 'installments' | 'paymentMethod' | 'totalValue' | 'installmentsCount'>): { label: string; title: string } {
  const allocs = getSaleAllocations(sale);
  const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (allocs.length <= 1) {
    const name = formatPaymentMethodName(allocs[0]?.method || sale.paymentMethod);
    return { label: name, title: name };
  }
  const label = allocs.map((a) => formatPaymentMethodName(a.method)).join(' + ');
  const title = allocs
    .map((a) => {
      const extra = isCardMethod(a.method)
        ? ` (${a.brandName ? `${a.brandName} ` : ''}${a.method === 'CARTAO_CREDITO' && a.customerInstallments ? `${a.customerInstallments}x` : 'débito'})`
        : '';
      return `${formatPaymentMethodName(a.method)}${extra} — ${money(a.amount)}`;
    })
    .join('\n');
  return { label: allocs.length > 1 ? `${allocs.length} formas` : label, title: `${label}\n${title}` };
}

// Filtro por forma: encontra a venda se QUALQUER alocação (ou parcela) usar a forma — não só a "principal".
export function saleHasPaymentMethod(sale: Pick<Sale, 'installments' | 'paymentMethod'>, method: string): boolean {
  if (sale.paymentMethod === method) return true;
  return (sale.installments || []).some((i) => i.paymentMethod === method);
}

export function saleFeeTotals(sale: Pick<Sale, 'installments'>): { gross: number; fees: number; net: number } {
  const allocs = getSaleAllocations(sale as any);
  const gross = fromCents(allocs.reduce((s, a) => s + toCents(a.amount), 0));
  const fees = fromCents(allocs.reduce((s, a) => s + toCents(a.fee), 0));
  return { gross, fees, net: fromCents(toCents(gross) - toCents(fees)) };
}

export { findBrand, getActiveSettlementProfile };

// ---------------------------------------------------------------------------
// Construção dos recebíveis de todas as alocações (usada pela Nova Receita e pelos testes).
// ---------------------------------------------------------------------------
export interface BuildAllocation {
  n: number;
  method: PaymentMethod;
  amount: number;
  ev: AllocationEvaluation;
  brandBased: boolean;
  brandId?: string;
  brandName?: string;
  received: boolean;
  // Dinheiro em CPF: o paciente solicitou recibo/documento? (false = fora do documento e do Carnê-Leão; entra no faturamento)
  documentRequested?: boolean;
  // Destino financeiro e data de recebimento PRÓPRIOS da alocação (fonte canônica; a conta global da venda é só legado).
  bankAccountId?: string;
  paymentDate?: string;
}

// REGRA DE NEGÓCIO (definida pela clínica): dinheiro recebido NÃO gera nota.
//  • CNPJ: a nota fiscal (NFS-e) cobre só as alocações não-dinheiro (Pix, cartão…); dinheiro fica fora do documento.
//  • CPF: dinheiro só entra no documento (Receita Saúde) se o paciente solicitou; senão fica fora do documento e do Carnê-Leão.
// Em ambos o valor continua no faturamento. É um DEFAULT: o usuário pode ajustar a cobertura na Nova Receita.
export function defaultFiscalCoverage(
  allocations: Array<{ n: number; method: PaymentMethod; amount: number; documentRequested?: boolean }>,
  taxOrigin: 'CPF' | 'CNPJ'
): Record<number, number> | null {
  let any = false;
  const map: Record<number, number> = {};
  allocations.forEach((al) => {
    const cashOut = al.method === 'DINHEIRO' && (taxOrigin === 'CNPJ' || al.documentRequested !== true);
    map[al.n] = cashOut ? 0 : al.amount;
    if (cashOut) any = true;
  });
  return any ? map : null;
}

export function buildSaleInstallments(p: {
  allocations: BuildAllocation[];
  split: boolean;
  saleDate: string;
  paymentDate: string;
  profile: SettlementProfileId;
  taxOrigin: 'CPF' | 'CNPJ';
  receiptIdentifier: string;
  bankAccountId?: string;
  prev: SaleInstallment[];
  saleId: string;
  isEditing: boolean;
  idSeed?: number;
  // Cobertura parcial do documento fiscal por alocação (valor coberto). null/undefined = documento cobre a venda toda.
  fiscalCoverage?: Record<number, number> | null;
}): SaleInstallment[] {
  const built: SaleInstallment[] = [];
  let identifierUsed = false;
  const seed = p.idSeed ?? Date.now();
  const coverageByInst = new Map<string, number>();
  const effectiveCoverage =
    p.fiscalCoverage ??
    defaultFiscalCoverage(p.allocations.map((a) => ({ n: a.n, method: a.method, amount: a.amount, documentRequested: a.documentRequested })), p.taxOrigin);
  p.allocations.forEach((al) => {
    const rows = planAllocation({ method: al.method, amount: al.amount, ev: al.ev, brandBased: al.brandBased, saleDate: p.saleDate, profile: p.profile });
    const prevList = p.prev.filter((i) => (i.allocationNumber || 1) === al.n);
    const snap =
      al.ev.isCard && al.ev.feeRule
        ? {
            cardBrandId: al.brandId || undefined,
            cardBrandName: al.brandName || undefined,
            cardFeeType: al.ev.feeRule.type,
            cardFeeValue: al.ev.feeRule.value,
            customerInstallments: al.ev.customerInstallments,
            receivingMode: al.brandBased ? al.ev.receivingMode : ('NORMAL' as ReceivingMode),
            settlementProfile: al.brandBased && al.ev.receivingMode === 'ANTICIPATED' ? p.profile : undefined,
          }
        : {};
    rows.forEach((row, idx) => {
      const prevInst = prevList[idx];
      const dueDateStr =
        p.isEditing && prevInst ? (al.brandBased && prevInst.status !== 'RECEBIDO' ? row.dueDate : prevInst.dueDate) : row.dueDate;
      const wasPaid = prevInst ? prevInst.status === 'RECEBIDO' : al.received && idx === 0;

      let receitaStatus: ReceitaSaudeStatus | undefined = prevInst?.receitaSaudeStatus;
      let receitaId: string | undefined = prevInst?.receitaSaudeId;
      if (p.taxOrigin === 'CPF') {
        if (wasPaid) {
          const useId = Boolean(p.receiptIdentifier.trim()) && !identifierUsed;
          receitaStatus = useId ? 'EMITIDO' : prevInst?.receitaSaudeStatus || 'A_EMITIR';
          receitaId = useId ? p.receiptIdentifier.trim() : prevInst?.receitaSaudeId || undefined;
          if (useId) identifierUsed = true;
        } else {
          receitaStatus = prevInst?.receitaSaudeStatus || 'A_EMITIR';
        }
      } else {
        receitaStatus = undefined;
        receitaId = undefined;
      }

      built.push({
        id: prevInst ? prevInst.id : `inst_${seed}_${al.n}_${row.number}`,
        saleId: p.saleId,
        installmentNumber: row.number,
        totalInstallments: row.total,
        value: row.value,
        cardFeePercent: al.ev.isCard && al.ev.feeRule?.type === 'PERCENTAGE' && al.ev.feeRule.value > 0 ? al.ev.feeRule.value : undefined,
        cardFeeAmount: al.ev.isCard && row.fee > 0 ? row.fee : undefined,
        ...snap,
        netValue: row.net,
        dueDate: dueDateStr,
        paymentDate: wasPaid ? prevInst?.paymentDate || al.paymentDate || (p.isEditing ? p.saleDate : p.paymentDate) : undefined,
        amountReceived: wasPaid ? prevInst?.amountReceived || row.net : undefined,
        status: wasPaid ? 'RECEBIDO' : 'A_RECEBER',
        receitaSaudeStatus: receitaStatus,
        receitaSaudeId: receitaId,
        receitaSaudeEmittedAt: receitaStatus === 'EMITIDO' ? prevInst?.receitaSaudeEmittedAt || new Date().toISOString() : undefined,
        paymentMethod: al.method,
        documentRequested: al.method === 'DINHEIRO' && p.taxOrigin === 'CPF' && al.documentRequested !== undefined ? al.documentRequested : prevInst?.documentRequested,
        bankAccountId: al.bankAccountId || p.bankAccountId || undefined,
        allocationNumber: p.split ? al.n : undefined,
        allocationAmount: p.split ? al.amount : undefined,
      } as SaleInstallment);
    });
    // Rateia o valor coberto da alocação entre as parcelas dela (proporcional, soma exata).
    if (effectiveCoverage && effectiveCoverage[al.n] !== undefined) {
      const mine = built.filter((i) => (i.allocationNumber || 1) === (p.split ? al.n : 1));
      const parts = distributeFee(Math.min(effectiveCoverage[al.n], al.amount), mine.map((i) => i.value));
      mine.forEach((i, idx) => coverageByInst.set(i.id, Math.min(parts[idx], i.value)));
    }
  });
  if (effectiveCoverage) built.forEach((i) => { if (coverageByInst.has(i.id)) i.fiscalCoveredAmount = coverageByInst.get(i.id); });
  return built;
}

// ---------------------------------------------------------------------------
// Cobertura do documento fiscal (independente da forma de pagamento e do faturamento gerencial).
// A venda é o fato gerador; o documento pode cobrir o total ou parte dela por decisão explícita.
// O faturamento gerencial permanece SEMPRE no bruto da venda.
// ---------------------------------------------------------------------------
export function validateFiscalCoverage(gross: number, allocationAmounts: number[], covered: number[]): { ok: boolean; total: number; uncovered: number; message?: string } {
  const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const total = fromCents(covered.reduce((s, v) => s + toCents(Number.isFinite(v) ? v : 0), 0));
  const uncovered = fromCents(toCents(gross) - toCents(total));
  if (covered.some((v, i) => !Number.isFinite(v) || v < 0 || toCents(v) > toCents(allocationAmounts[i] ?? gross))) {
    return { ok: false, total, uncovered, message: 'O valor coberto pelo documento não pode exceder o valor da respectiva forma de pagamento.' };
  }
  if (toCents(total) > toCents(gross)) return { ok: false, total, uncovered, message: `O documento excede o valor da venda em ${money(-uncovered)}.` };
  if (toCents(total) <= 0) return { ok: false, total, uncovered, message: 'Informe o valor coberto pelo documento (maior que zero).' };
  return { ok: true, total, uncovered };
}

export interface FiscalCoverageView {
  gross: number;
  covered: number;
  uncovered: number;
  coverage: 'TOTAL' | 'PARCIAL';
  perAllocation: Array<{ number: number; method: PaymentMethod; amount: number; covered: number }>;
  documentType: 'Receita Saúde' | 'NFS-e';
  status: 'Pendente' | 'Emitido' | 'Não aplicável';
}

export function getFiscalCoverage(sale: Pick<Sale, 'installments' | 'paymentMethod' | 'totalValue' | 'installmentsCount' | 'taxOrigin'> & { nfseStatus?: string }): FiscalCoverageView {
  const allocs = getSaleAllocations(sale);
  const perAllocation = allocs.map((a) => ({
    number: a.number,
    method: a.method,
    amount: a.amount,
    covered: fromCents(a.installments.reduce((s, i) => s + toCents(i.fiscalCoveredAmount ?? i.value), 0)),
  }));
  const gross = fromCents(allocs.reduce((s, a) => s + toCents(a.amount), 0));
  const covered = fromCents(perAllocation.reduce((s, a) => s + toCents(a.covered), 0));
  const uncovered = fromCents(toCents(gross) - toCents(covered));
  const documentType = sale.taxOrigin === 'CPF' ? 'Receita Saúde' : 'NFS-e';
  let status: FiscalCoverageView['status'] = 'Pendente';
  if (covered <= 0) status = 'Não aplicável';
  else if (sale.taxOrigin === 'CPF') {
    const inDoc = (sale.installments || []).filter((i) => (i.fiscalCoveredAmount ?? i.value) > 0);
    const receivedCovered = inDoc.filter((i) => i.status === 'RECEBIDO');
    status = receivedCovered.length > 0 && receivedCovered.every((i) => i.receitaSaudeStatus === 'EMITIDO') && receivedCovered.length === inDoc.length ? 'Emitido' : 'Pendente';
  } else {
    status = sale.nfseStatus === 'EMITIDA' ? 'Emitido' : 'Pendente';
  }
  return { gross, covered, uncovered, coverage: toCents(uncovered) > 0 ? 'PARCIAL' : 'TOTAL', perAllocation, documentType, status };
}

// ---------------------------------------------------------------------------
// Agrupamento visual de recebíveis da MESMA venda (identificador canônico = saleId + allocationNumber).
// ---------------------------------------------------------------------------
export function buildSplitGroups<T extends { saleId: string; allocationNumber?: number }>(items: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  items.forEach((i) => {
    if (i.allocationNumber) m.set(i.saleId, [...(m.get(i.saleId) || []), i]);
  });
  [...m.keys()].forEach((k) => {
    if (new Set(m.get(k)!.map((i) => i.allocationNumber)).size < 2) m.delete(k);
  });
  return m;
}

// Mantém a ordenação da tabela, mas junta as linhas do mesmo grupo (a 1ª ocorrência puxa as irmãs visíveis).
export function orderSplitGroups<T extends { saleId: string; allocationNumber?: number }>(sorted: T[], groups: Map<string, unknown>): T[] {
  const out: T[] = [];
  const emitted = new Set<string>();
  sorted.forEach((item) => {
    if (!groups.has(item.saleId)) {
      out.push(item);
      return;
    }
    if (emitted.has(item.saleId)) return;
    emitted.add(item.saleId);
    out.push(...sorted.filter((x) => x.saleId === item.saleId).sort((a, b) => (a.allocationNumber || 1) - (b.allocationNumber || 1)));
  });
  return out;
}
