/**
 * Utilitários para normalização e formatação de números de telefone/WhatsApp brasileiros.
 */

export function normalizeBrazilianNumber(rawNumber: string): string {
  if (!rawNumber) return '';
  const clean = rawNumber.replace(/\D/g, '');

  // Se já começar com 55 (Brasil)
  if (clean.startsWith('55')) {
    const withoutCountry = clean.substring(2);
    if (withoutCountry.length === 10 || withoutCountry.length === 11) {
      const ddd = withoutCountry.substring(0, 2);
      let local = withoutCountry.substring(2);
      // Se tiver 10 dígitos (DDD + 8 dígitos) e for celular (começando com 6, 7, 8, 9), adiciona o 9º dígito
      if (local.length === 8 && ['6', '7', '8', '9'].includes(local[0])) {
        local = `9${local}`;
      }
      return `55${ddd}${local}`;
    }
    return clean;
  }

  // Sem o DDI 55
  if (clean.length === 10 || clean.length === 11) {
    const ddd = clean.substring(0, 2);
    let local = clean.substring(2);
    if (local.length === 8 && ['6', '7', '8', '9'].includes(local[0])) {
      local = `9${local}`;
    }
    return `55${ddd}${local}`;
  }

  return clean;
}

export function formatPhoneDisplay(number: string): string {
  if (!number) return '';
  const normalized = normalizeBrazilianNumber(number);
  const digits = normalized.startsWith('55') ? normalized.substring(2) : normalized;

  if (digits.length === 11) {
    return `(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}`;
  }
  return number;
}

export function isValidBrazilianPhone(number: string): boolean {
  const norm = normalizeBrazilianNumber(number);
  // Deve ter 55 + 2 dígitos DDD + 8 ou 9 dígitos = 12 ou 13 dígitos
  return norm.startsWith('55') && (norm.length === 12 || norm.length === 13);
}
