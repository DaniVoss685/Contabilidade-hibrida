/**
 * UTILITÁRIO CANÔNICO DE RESOLUÇÃO E VALIDAÇÃO DA IDENTIDADE DO ATENDENTE NO WHATSAPP
 * Garante que e-mails, logins ou local-parts NUNCA sejam expostos como identidade pública.
 */

export interface AttendantUserLike {
  id?: string;
  name?: string | null;
  whatsapp_display_name?: string | null;
  whatsappDisplayName?: string | null;
  email?: string | null;
  role?: string | null;
}

/**
 * Verifica se uma string de texto se parece com e-mail ou local-part cru de login gerado automaticamente.
 */
export function isEmailLikeName(name?: string | null, email?: string | null, checkLocalPart = true): boolean {
  if (!name) return false;
  const trimmed = name.trim().toLowerCase();
  if (trimmed.includes('@')) return true;
  if (/^[a-z0-9._%+-]+\.[a-z]{2,}$/i.test(trimmed)) return true;

  // Se o nome não tiver espaços e for exatamente idêntico ao local-part do e-mail (ex: "leonardoricardoarantes")
  if (checkLocalPart && email && !trimmed.includes(' ')) {
    const localPart = email.trim().toLowerCase().split('@')[0];
    if (localPart && trimmed === localPart) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve o nome público ou amigável do atendente seguindo estritamente a ordem canônica:
 * 1. df_users.whatsapp_display_name (se configurado);
 * 2. Primeiro nome / nome amigável derivado do campo real de nome em df_users (se confiável e não for e-mail);
 * 3. Nome cadastrado da pessoa (se confiável);
 * 4. Fallback neutro seguro: "Atendente" (NUNCA e-mail).
 */
export function resolveAttendantDisplayName(user?: AttendantUserLike | null): string {
  if (!user) return 'Atendente';

  // 1. whatsapp_display_name configurado
  const configured = (user.whatsapp_display_name || user.whatsappDisplayName || '').trim();
  if (configured.length > 0 && !isEmailLikeName(configured, user.email, false)) {
    return configured;
  }

  // 2 e 3. Nome real cadastrado em df_users
  const rawName = (user.name || '').trim();
  if (rawName.length > 0 && !isEmailLikeName(rawName, user.email)) {
    // Se for nome composto (ex: "Leonardo Ricardo Arantes"), extrai nome amigável (ex: "Leonardo Ricardo")
    const parts = rawName.split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[1]}`;
    }
    return parts[0] || rawName;
  }

  // 4. Fallback neutro seguro
  return 'Atendente';
}

/**
 * Formata o rótulo de autor do atendente para a interface interna.
 * Se o autor for o próprio usuário logado, retorna "${name} (Você)".
 * Caso contrário, retorna "${name}".
 */
export function formatAttendantAuthorLabel(
  authorUser?: AttendantUserLike | null,
  authorId?: string | null,
  currentUserId?: string | null
): string | null {
  const name = resolveAttendantDisplayName(authorUser);
  if (!name) return null;
  if (authorId && currentUserId && authorId === currentUserId) {
    return `${name} (Você)`;
  }
  return name;
}

/**
 * Validação do campo whatsapp_display_name:
 * - trim
 * - não aceitar somente espaços
 * - tamanho razoável (2 a 60 caracteres)
 * - aceitar acentos e nomes compostos
 * - não aceitar e-mails, arroba solta ou URLs
 */
export function validateWhatsappDisplayName(value?: string | null): { valid: boolean; error?: string; sanitized: string | null } {
  if (!value) {
    return { valid: true, sanitized: null };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: true, sanitized: null };
  }

  if (trimmed.length < 2) {
    return { valid: false, error: 'O Nome no WhatsApp deve ter pelo menos 2 caracteres.', sanitized: trimmed };
  }

  if (trimmed.length > 60) {
    return { valid: false, error: 'O Nome no WhatsApp deve ter no máximo 60 caracteres.', sanitized: trimmed };
  }

  if (trimmed.includes('@') || /^[a-z0-9._%+-]+\.[a-z]{2,}$/i.test(trimmed)) {
    return { valid: false, error: 'O Nome no WhatsApp não pode conter endereço de e-mail.', sanitized: trimmed };
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('www.')) {
    return { valid: false, error: 'O Nome no WhatsApp não pode ser um link ou URL.', sanitized: trimmed };
  }

  return { valid: true, sanitized: trimmed };
}

const COMMON_MESSAGE_LABELS = new Set([
  'financeiro',
  'atenção',
  'atencao',
  'aviso',
  'nota',
  'obs',
  'observação',
  'observacao',
  'importante',
  'lembrete',
  'urgente',
  'informação',
  'informacao',
  'dúvida',
  'duvida',
  'resposta',
  'assunto',
  'cobrança',
  'cobranca',
  'recado',
  'mensagem',
  'dados',
  'pix',
  'chave pix',
  'boleto',
  'orçamento',
  'orcamento',
  'comprovante',
  'orientação',
  'orientacao',
  'instrução',
  'instrucao',
]);

/**
 * Formata o texto de saída externa para a Evolution API de forma estritamente idempotente.
 * Se a mensagem já contiver o prefixo do atendente, NUNCA duplica em reenvios ou retries.
 * Não remove texto legítimo do usuário (ex: "Financeiro:\nSegue o boleto") se não corresponder
 * a um atendente do sistema.
 * Utiliza o padrão nativo de negrito do WhatsApp: "*Nome:*\nMensagem"
 */
export function formatOutboundTextWithPolicy(params: {
  text: string;
  attendantName: string;
  policy: 'AUTOMATICO' | 'SEMPRE' | 'NUNCA';
  activeAttendantsCount?: number;
  knownStaffNames?: string[];
}): string {
  const { text, attendantName, policy, activeAttendantsCount = 1, knownStaffNames = [] } = params;
  if (!text) return '';

  const cleanText = text.trim();
  const safeName = attendantName.trim() || 'Atendente';

  // 1. Idempotência: verificar se já possui prefixo comprovado de atendente (com ou sem asteriscos)
  // Suporta: "*Nome:*\n", "*Nome*:\n", "Nome:\n"
  const prefixRegex = /^\*?([A-Za-zÀ-ÖØ-öø-ÿ0-9._ -]{2,60})\*?:\*?\n([\s\S]*)$/;
  const match = cleanText.match(prefixRegex);
  let rawBody = cleanText;

  if (match) {
    const existingPrefixName = match[1].trim();
    const isSelfPrefix = existingPrefixName.toLowerCase() === safeName.toLowerCase();
    const isKnownStaffPrefix = knownStaffNames.some(
      (n) => n && n.trim().toLowerCase() === existingPrefixName.toLowerCase()
    );
    const isGenericLabel = COMMON_MESSAGE_LABELS.has(existingPrefixName.toLowerCase());

    const isAttendantPrefix =
      isSelfPrefix ||
      isKnownStaffPrefix ||
      (!isGenericLabel && (knownStaffNames.length === 0 || isKnownStaffPrefix));

    // Remove prefixo SOMENTE se for atendente e NÃO um cabeçalho legítimo de texto digitado pelo usuário.
    if (isAttendantPrefix && !isGenericLabel) {
      rawBody = match[2].trim();
    }
  }

  // 2. Aplicar a política
  if (policy === 'NUNCA') {
    return rawBody;
  }

  if (policy === 'SEMPRE') {
    return `*${safeName}:*\n${rawBody}`;
  }

  // Se AUTOMATICO: somente prefixar se houver 2 ou mais atendentes operacionais ativos e autorizados
  if (activeAttendantsCount >= 2) {
    return `*${safeName}:*\n${rawBody}`;
  }

  return rawBody;
}

/**
 * Remove o prefixo do atendente exclusivamente para exibição interna no balão de chat,
 * evitando que o nome apareça duplicado (no cabeçalho em negrito e dentro da mensagem).
 * Suporta tanto o novo formato com negrito "*Nome:*\n" quanto formatos legados "Nome:\n".
 */
export function stripAttendantPrefixFromContent(content?: string | null, attendantName?: string | null): string {
  if (!content) return '';
  const trimmed = content.trim();

  // Se o nome do atendente for conhecido, remove se começar com "*Nome:*\n" ou "Nome:\n"
  if (attendantName && attendantName.trim()) {
    const safeAttendant = attendantName.trim();
    const escaped = safeAttendant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^\\*?${escaped}\\*?:\\*?\\n([\\s\\S]*)$`, 'i');
    const match = trimmed.match(regex);
    if (match) return match[1].trim();
  }

  return trimmed;
}

