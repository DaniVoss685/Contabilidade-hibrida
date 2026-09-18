/**
 * appointmentDateUtils.ts
 *
 * Funções canônicas de tratamento de datas e contexto temporal relativo para
 * agendamentos e lembretes de WhatsApp do Dental Finance.
 *
 * Regras:
 * - Toda comparação utiliza o timezone local da clínica (padrão: 'America/Sao_Paulo').
 * - Mesmo dia local de calendário: 'HOJE'
 * - Dia local seguinte de calendário: 'AMANHÃ'
 * - Qualquer outra data: 'DATA'
 *
 * Variável semântica {{quando}}:
 * - HOJE -> "hoje, DD/MM/YYYY"
 * - AMANHÃ -> "amanhã, DD/MM/YYYY"
 * - DATA -> "DD/MM/YYYY"
 */

export type RelativeDayLabel = 'HOJE' | 'AMANHÃ' | 'DATA';

/**
 * Formata data ISO (YYYY-MM-DD) para padrão brasileiro DD/MM/YYYY
 */
export function formatDateBr(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Extrai a data local no formato YYYY-MM-DD considerando o timezone da clínica.
 */
export function getLocalDateString(date: Date, timezone: string = 'America/Sao_Paulo'): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // Retorna "YYYY-MM-DD"
}

/**
 * Retorna o rótulo canônico de contexto temporal relativo:
 * - 'HOJE' se a consulta for no mesmo dia local
 * - 'AMANHÃ' se a consulta for no dia local imediatamente seguinte
 * - 'DATA' para qualquer outro dia
 */
export function getAppointmentRelativeDayLabel(
  appointmentDate: string, // "YYYY-MM-DD"
  tenantTimezone: string = 'America/Sao_Paulo',
  now: Date = new Date()
): RelativeDayLabel {
  if (!appointmentDate) return 'DATA';

  const todayStr = getLocalDateString(now, tenantTimezone);

  const [curY, curM, curD] = todayStr.split('-').map(Number);
  const [apptY, apptM, apptD] = appointmentDate.split('-').map(Number);

  if (isNaN(curY) || isNaN(apptY)) return 'DATA';

  // Usar Date.UTC para obter a diferença exata em dias de calendário independentemente de horário
  const curMidnightUtc = Date.UTC(curY, curM - 1, curD);
  const apptMidnightUtc = Date.UTC(apptY, apptM - 1, apptD);

  const diffDays = Math.round((apptMidnightUtc - curMidnightUtc) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return 'HOJE';
  } else if (diffDays === 1) {
    return 'AMANHÃ';
  } else {
    return 'DATA';
  }
}

/**
 * Renderiza o texto semântico correspondente à tag {{quando}}:
 * - 'HOJE' -> "hoje, DD/MM/YYYY"
 * - 'AMANHÃ' -> "amanhã, DD/MM/YYYY"
 * - 'DATA' -> "DD/MM/YYYY"
 */
export function formatAppointmentWhen(
  appointmentDate: string,
  tenantTimezone: string = 'America/Sao_Paulo',
  now: Date = new Date()
): string {
  const label = getAppointmentRelativeDayLabel(appointmentDate, tenantTimezone, now);
  const dateFormatted = formatDateBr(appointmentDate);

  if (label === 'HOJE') {
    return `hoje, ${dateFormatted}`;
  } else if (label === 'AMANHÃ') {
    return `amanhã, ${dateFormatted}`;
  } else {
    return dateFormatted;
  }
}

/**
 * Previne inconsistências semânticas em templates legados que possuem
 * a palavra "amanhã" codificada de forma estática no texto.
 */
export function sanitizeTemplateText(
  template: string,
  appointmentDate: string,
  tenantTimezone: string = 'America/Sao_Paulo',
  now: Date = new Date()
): string {
  if (!template) return '';
  const label = getAppointmentRelativeDayLabel(appointmentDate, tenantTimezone, now);

  let sanitized = template;

  // Se o template legado usa "marcada para amanhã, *{{data}}*" ou "amanhã, {{data}}"
  // converte para "marcada para {{quando}}" ou "{{quando}}"
  sanitized = sanitized.replace(/para\s+amanh[aã],?\s*(\*?\{\{data\}\}\*?)/gi, 'para {{quando}}');
  sanitized = sanitized.replace(/amanh[aã],?\s*(\*?\{\{data\}\}\*?)/gi, '{{quando}}');

  // Proteção contra a palavra "amanhã" avulsa no template quando a consulta é HOJE ou OUTRA DATA
  if (label === 'HOJE') {
    // Se ainda restar "amanhã", substitui por "hoje"
    sanitized = sanitized.replace(/\bamanh[aã]\b/gi, 'hoje');
  } else if (label === 'DATA') {
    // Se a consulta for em outra data (ex: daqui a 3 dias), remove a menção incorreta a "amanhã,"
    sanitized = sanitized.replace(/\bamanh[aã],?\s*/gi, '');
  }

  return sanitized;
}

/**
 * Renderiza um template preenchendo todas as variáveis dinâmicas e semânticas:
 * {{paciente}}, {{quando}}, {{data}}, {{hora}}, {{profissional}}, {{procedimento}}, {{clinica}}
 */
export function renderAppointmentTemplate(
  template: string,
  variables: {
    paciente: string;
    appointmentDate: string; // YYYY-MM-DD
    data?: string;
    hora: string;
    profissional: string;
    procedimento?: string;
    clinica?: string;
  },
  tenantTimezone: string = 'America/Sao_Paulo',
  now: Date = new Date()
): string {
  if (!template) return '';

  // 1. Sanitizar template para eliminar falsos "amanhã" legados
  const sanitized = sanitizeTemplateText(template, variables.appointmentDate, tenantTimezone, now);

  // 2. Calcular valores semânticos
  const quandoText = formatAppointmentWhen(variables.appointmentDate, tenantTimezone, now);
  const dataText = variables.data || formatDateBr(variables.appointmentDate);

  // 3. Interpolar variáveis
  return sanitized
    .replace(/\{\{paciente\}\}/gi, variables.paciente || 'Paciente')
    .replace(/\{\{quando\}\}/gi, quandoText)
    .replace(/\{\{data\}\}/gi, dataText)
    .replace(/\{\{hora\}\}/gi, variables.hora || '')
    .replace(/\{\{profissional\}\}/gi, variables.profissional || '')
    .replace(/\{\{procedimento\}\}/gi, variables.procedimento || 'Consulta')
    .replace(/\{\{clinica\}\}/gi, variables.clinica || '');
}
