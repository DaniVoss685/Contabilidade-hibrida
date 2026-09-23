import { FiscalClassification } from '../types';

// Validação pura da regra "NAO_TRIBUTAVEL/EXCLUIDO_DA_BASE exigem motivo e
// fundamento/categoria" — usada por db.updateFiscalClassification (fonte
// real) e testável isoladamente sem instanciar o singleton `db`.
// "Paciente não pediu recibo" NUNCA é aceito automaticamente: esta função
// não recebe (nem lê) documentRequested — motivo/categoria têm que vir de
// texto explícito digitado pelo usuário na UI (FiscalClassificationModal).
export function validateFiscalClassificationChange(
  classification: FiscalClassification,
  reason: string | undefined,
  category: string | undefined
): { valid: boolean; error?: string } {
  const requiresJustification = classification !== 'TRIBUTAVEL';
  if (!requiresJustification) return { valid: true };
  if (!(reason || '').trim() || !(category || '').trim()) {
    return { valid: false, error: 'Classificação fiscal diferente de TRIBUTÁVEL exige motivo e fundamento/categoria.' };
  }
  return { valid: true };
}

// Gate único de "este recebimento conta como pendência operacional de
// documento fiscal?" — usado em App.tsx, ReceivablesView.tsx, SalesView.tsx
// e db.getAccountsReceivable(). documentRequested === false suprime o
// alerta; undefined/true preserva o comportamento anterior a este campo
// existir (nunca infere silenciosamente "não solicitado" para registros
// legados).
export function isPendingDocumentAlert(params: {
  taxOrigin: 'CPF' | 'CNPJ';
  received: boolean;
  receitaSaudeEmitted: boolean;
  documentRequested?: boolean;
}): boolean {
  if (params.taxOrigin !== 'CPF') return false;
  if (!params.received) return false;
  if (params.receitaSaudeEmitted) return false;
  return params.documentRequested !== false;
}

// Recebimento entra na base tributável do Carnê-Leão/IRPF? Default
// TRIBUTAVEL quando o campo está ausente (comportamento idêntico a antes
// deste campo existir). Usado em taxEngine.ts (calculateMonthlyPfTax e
// calculateCpfMonthlyTax).
// Regra de negócio: dinheiro recebido SEM documento solicitado
// (documentRequested === false) continua no faturamento, mas NÃO entra na
// base do CPF. undefined (legado) nunca é tratado como "não solicitado".
export function isTaxableForCarneLeao(
  fiscalClassification?: FiscalClassification,
  documentRequested?: boolean
): boolean {
  if (documentRequested === false) return false;
  return !fiscalClassification || fiscalClassification === 'TRIBUTAVEL';
}
