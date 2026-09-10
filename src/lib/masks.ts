// Masking and Formatting utilities for Brazilian Dental Finance

export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return 'R$ 0,00';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | undefined | null, decimals = 2): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '0,00%';
  }
  return `${(value * 100).toFixed(decimals).replace('.', ',')}%`;
}

export function formatCpf(cpf: string, masked = false): string {
  if (!cpf) return '';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf;
  
  if (masked) {
    return `${clean.slice(0, 3)}.***.***-${clean.slice(9, 11)}`;
  }
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

export function formatCnpj(cnpj: string): string {
  if (!cnpj) return '';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return cnpj;
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
}

export function formatCpfOrCnpj(doc: string, masked = false): string {
  const clean = (doc || '').replace(/\D/g, '');
  if (clean.length === 11) return formatCpf(clean, masked);
  if (clean.length === 14) return formatCnpj(clean);
  return doc || '';
}

export function formatDateBr(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  // Handles YYYY-MM-DD or ISO string
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function formatMonthYearBr(monthStr: string): string {
  // input: "2025-05" -> "Maio / 2025"
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const idx = parseInt(month, 10) - 1;
  return `${monthNames[idx] || month} de ${year}`;
}

export function parseBrlInput(str: string): number {
  if (!str) return 0;
  const clean = str.replace(/[R$\s.]/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}
