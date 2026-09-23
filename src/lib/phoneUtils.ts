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

/**
 * Detecta números "placeholder" (formato estruturalmente válido, mas sem sentido real):
 * todos os dígitos do número local iguais (ex.: 99999999999) ou sequência estritamente
 * crescente/decrescente de dígitos consecutivos (ex.: 12345678901234567890 → local 123456789).
 * Espelha fn_is_placeholder_phone_local (supabase/migrations) — manter em sincronia manualmente,
 * a trigger de banco roda server-side e não importa este arquivo. Nunca bloqueia o cadastro do
 * paciente (CLAUDE.md: telefone nunca bloqueia) — usado apenas para avisar o usuário e para a
 * trigger decidir se cria/atualiza o df_wa_contact correspondente (A23).
 */
export function isPlaceholderPhoneNumber(rawNumber: string): boolean {
  const normalized = normalizeBrazilianNumber(rawNumber);
  if (!normalized.startsWith('55') || normalized.length < 12) return false;

  const local = normalized.substring(4); // remove "55" (DDI) + 2 dígitos de DDD
  if (local.length < 8) return false;

  if (/^(\d)\1+$/.test(local)) return true;

  let ascending = true;
  let descending = true;
  for (let i = 0; i < local.length - 1; i++) {
    const a = local.charCodeAt(i);
    const b = local.charCodeAt(i + 1);
    if (b - a !== 1) ascending = false;
    if (a - b !== 1) descending = false;
  }
  return ascending || descending;
}

/**
 * Identifica se um identificador ou número representa um Grupo do WhatsApp.
 * Critérios:
 * - Sufixo '@g.us'
 * - Prefixo '120363' com 16 a 20 dígitos (formato oficial de grupo WhatsApp Baileys/Cloud)
 * - Formato legado com hífen entre números longos (ex: '553496492790-1476054376')
 * - Identificadores com 20 ou mais dígitos
 */
export function isWhatsAppGroup(jidOrNumber?: string | null): boolean {
  if (!jidOrNumber) return false;
  const str = jidOrNumber.trim();
  if (str.includes('@g.us')) return true;
  const digits = str.replace(/\D/g, '');
  if (digits.startsWith('120363') && digits.length >= 16) return true;
  if (str.includes('-') && digits.length >= 18) return true;
  if (digits.length >= 20) return true;
  return false;
}

export function formatPhoneDisplay(
  number: string | undefined | null,
  options?: { includeCountryCode?: boolean }
): string {
  if (!number) return '';
  const trimmed = String(number).trim();
  if (isWhatsAppGroup(trimmed)) {
    return 'Grupo do WhatsApp';
  }
  const hasPlus = trimmed.startsWith('+');
  const clean = trimmed.replace(/\D/g, '');

  let ddd = '';
  let local = '';
  let isCell = false;

  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    ddd = clean.slice(2, 4);
    local = clean.slice(4);
    isCell = local.length === 9;
  } else if (clean.length === 10 || clean.length === 11) {
    ddd = clean.slice(0, 2);
    local = clean.slice(2);
    isCell = local.length === 9;
  } else {
    return trimmed;
  }

  const formattedLocal = isCell
    ? `${local.slice(0, 5)}-${local.slice(5)}`
    : `${local.slice(0, 4)}-${local.slice(4)}`;

  const shouldIncludePlus = options?.includeCountryCode ?? hasPlus;
  return shouldIncludePlus
    ? `+55 (${ddd}) ${formattedLocal}`
    : `(${ddd}) ${formattedLocal}`;
}

export const formatPhone = formatPhoneDisplay;

export function isValidBrazilianPhone(number: string): boolean {
  const norm = normalizeBrazilianNumber(number);
  // Deve ter 55 + 2 dígitos DDD + 8 ou 9 dígitos = 12 ou 13 dígitos
  return norm.startsWith('55') && (norm.length === 12 || norm.length === 13);
}

export interface ContactNameResolvable {
  name?: string | null;
  whatsapp_number?: string | null;
  patient?: { name?: string | null } | null;
}

/**
 * Helper canônico para identificar se um nome cadastrado é na verdade apenas um
 * placeholder baseado no número de telefone (seja numérico puro ou formatado).
 * Ex: "(34) 99950-2143", "5534999502143", "34999502143", "+55 34 99950-2143", etc.
 */
export function isPhoneLikeContactName(name?: string | null, whatsappNumber?: string | null): boolean {
  if (!name || !name.trim()) return true;
  const cleanName = name.trim();
  const digitsOnlyName = cleanName.replace(/\D/g, '');

  // Se não contiver nenhuma letra e tiver 8 ou mais dígitos
  const hasLetters = /\p{L}/u.test(cleanName);
  if (!hasLetters && digitsOnlyName.length >= 8) {
    return true;
  }

  // Se o nome normalizado for idêntico ao número ou sufixo
  if (whatsappNumber) {
    const digitsOnlyTarget = whatsappNumber.replace(/\D/g, '');
    if (digitsOnlyName === digitsOnlyTarget) return true;
    if (digitsOnlyName.length >= 8 && digitsOnlyTarget.length >= 8) {
      if (digitsOnlyName.endsWith(digitsOnlyTarget.slice(-8)) || digitsOnlyTarget.endsWith(digitsOnlyName.slice(-8))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Regra canônica de resolução do nome de exibição de um contato:
 * 1ª Prioridade: Nome do paciente clínico vinculado (se houver)
 * 2ª Prioridade: Nome cadastrado no WhatsApp (se não for placeholder de telefone)
 * 3ª Fallback: Número do WhatsApp formatado como telefone amigável
 */
export function getContactDisplayName(contact?: ContactNameResolvable | null): string {
  if (!contact) return 'Contato';

  // Se for Grupo do WhatsApp
  if (isWhatsAppGroup(contact.whatsapp_number)) {
    if (contact.name && contact.name.trim() && !isWhatsAppGroup(contact.name)) {
      return contact.name.trim();
    }
    return 'Grupo do WhatsApp';
  }

  // 1ª Prioridade: Nome do paciente vinculado (apenas indivíduos)
  if (contact.patient?.name && contact.patient.name.trim()) {
    return contact.patient.name.trim();
  }

  // 2ª Prioridade: Nome do contato (se preenchido e não for placeholder de telefone)
  if (contact.name && contact.name.trim()) {
    const trimmed = contact.name.trim();
    if (!isPhoneLikeContactName(trimmed, contact.whatsapp_number)) {
      return trimmed;
    }
    // Se for placeholder mas contiver formatação, normaliza para telefone amigável
    return formatPhoneDisplay(trimmed);
  }

  // 3ª Fallback: Telefone formatado
  if (contact.whatsapp_number && contact.whatsapp_number.trim()) {
    return formatPhoneDisplay(contact.whatsapp_number.trim());
  }

  return 'Contato';
}

/**
 * Retorna a letra inicial do contato para renderização em avatars/badges.
 */
export function getContactInitial(contact?: ContactNameResolvable | null): string {
  const displayName = getContactDisplayName(contact);
  const clean = displayName.replace(/[^\p{L}\p{N}]/gu, '');
  return clean.length > 0 ? clean.charAt(0).toUpperCase() : 'C';
}


