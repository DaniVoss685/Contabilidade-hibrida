import { PaymentMethod } from '../types';

// Formatter único e reutilizável de forma de pagamento — antes duplicado (com
// wording divergente: "Dinheiro" vs "Dinheiro em Espécie" vs "Dinheiro / Espécie")
// em ReceivablesView.tsx, ExpensesView.tsx, EditReceivableModal.tsx,
// NewExpenseModal.tsx, SettlePaymentModal.tsx, NewSaleModal.tsx e
// BatchEditExpensesModal.tsx. Esta é a fonte canônica; patientHistory.ts
// reexporta a partir daqui para não quebrar o import existente.
export function formatPaymentMethodName(method?: PaymentMethod | string | null): string {
  if (!method) return '—';
  switch (method) {
    case 'PIX':
      return 'PIX';
    case 'CARTAO_CREDITO':
      return 'Cartão de Crédito';
    case 'CARTAO_DEBITO':
      return 'Cartão de Débito';
    case 'DINHEIRO':
      return 'Dinheiro';
    case 'TRANSFERENCIA':
      return 'Transferência';
    case 'BOLETO':
      return 'Boleto';
    default:
      return String(method);
  }
}

// Forma de pagamento + parcelamento, quando real (ex.: "Cartão de Crédito •
// 3x"). totalInstallments vem do cartão da maquininha (Sale.installmentsCount
// / SaleInstallment.totalInstallments) — nunca confundir com quantidade de
// recebíveis: no modelo atual do app são o MESMO número (ver
// NewSaleModal.tsx: effectiveInstallmentsCount só é > 1 quando
// paymentMethod === 'CARTAO_CREDITO'), então não há uma segunda contagem a
// exibir separadamente.
export function formatPaymentMethodWithInstallments(
  method?: PaymentMethod | string | null,
  totalInstallments?: number | null
): string {
  const name = formatPaymentMethodName(method);
  if (totalInstallments && totalInstallments > 1) {
    return `${name} • ${totalInstallments}x`;
  }
  return name;
}
