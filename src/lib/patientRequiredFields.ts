// Regras de obrigatoriedade dos campos do cadastro de paciente (PatientModal).
//
// Cadastro NOVO e paciente comum: CPF/CNPJ, telefone e (para Pessoa Física) data
// de nascimento continuam obrigatórios, como sempre foram.
//
// Paciente vindo de MIGRAÇÃO de sistema anterior (isLegacyImport): esses dados
// podem legitimamente nunca ter existido na origem. Editar o paciente (mudar
// nome, responsável, alerta de saúde...) não pode ficar bloqueado por um campo
// que estava vazio desde a importação — e a saída NUNCA é digitar um valor
// fictício (00000000000, 99999999999, data inventada). Regra: um campo que já
// estava vazio na origem deixa de ser obrigatório na EDIÇÃO; se o usuário
// preencher, o valor passa pela validação normal (formato, CPF único etc.).
//
// Exceção deliberada: quando o telefone é DO RESPONSÁVEL, ele é o telefone do
// guardian (fonte canônica, sincronizado para os dependentes) — nunca pode
// ficar vazio, senão a sincronização apagaria o telefone dos irmãos.

export type RequirableField = 'cpf' | 'phone' | 'birthDate';

export interface PatientFieldContext {
  isEdit: boolean;
  isLegacyImport: boolean;
  documentType: 'CPF' | 'CNPJ';
  phoneOwner: 'PATIENT' | 'RESPONSIBLE';
  /** Valores gravados quando o modal abriu (só em edição). */
  original: { cpf?: string; phone?: string; birthDate?: string } | null;
}

// CPF/telefone contam pelos dígitos (máscara não é valor); data de nascimento pelo texto.
const hasValue = (field: RequirableField, v: string | undefined | null): boolean =>
  field === 'birthDate' ? Boolean((v || '').trim()) : Boolean((v || '').replace(/\D/g, ''));

export function wasOriginallyEmpty(field: RequirableField, ctx: PatientFieldContext): boolean {
  if (!ctx.isEdit || !ctx.original) return false;
  return !hasValue(field, ctx.original[field]);
}

export function isFieldRequired(field: RequirableField, ctx: PatientFieldContext): boolean {
  if (field === 'birthDate' && ctx.documentType === 'CNPJ') return false; // empresa não tem nascimento

  const legacyLenient = ctx.isEdit && ctx.isLegacyImport && wasOriginallyEmpty(field, ctx);
  if (!legacyLenient) return true;

  if (field === 'phone' && ctx.phoneOwner === 'RESPONSIBLE') return true;
  return false;
}

/**
 * Texto discreto de "cadastro incompleto" para campo ausente em paciente legado
 * (nunca um erro). null quando não se aplica.
 */
export function missingFieldHint(field: RequirableField, ctx: PatientFieldContext, currentValue: string): string | null {
  if (!ctx.isEdit || !ctx.isLegacyImport) return null;
  if (!wasOriginallyEmpty(field, ctx)) return null;
  if (field === 'birthDate' && ctx.documentType === 'CNPJ') return null;
  if (hasValue(field, currentValue)) return null; // já preenchido nesta edição
  if (field === 'phone' && ctx.phoneOwner === 'RESPONSIBLE') return null;
  return 'Não informado no sistema anterior — pode ser completado depois.';
}

/**
 * Rótulo de exibição para campo ausente (ficha/listagem). Pacientes legados
 * dizem "no sistema anterior"; os demais, só "não informado".
 */
export function absentValueLabel(field: RequirableField, isLegacyImport: boolean): string {
  const base =
    field === 'cpf' ? 'CPF não informado' : field === 'phone' ? 'Sem telefone válido' : 'Nascimento não informado';
  return isLegacyImport ? `${base} (sistema anterior)` : base;
}

/**
 * Campos que o cadastro não tem (para o selo discreto "Cadastro incompleto").
 * Empresa (CNPJ) nunca "perde" nascimento.
 */
export function listMissingFields(p: {
  documentType?: 'CPF' | 'CNPJ';
  cpf?: string;
  phone?: string;
  birthDate?: string;
}): RequirableField[] {
  const missing: RequirableField[] = [];
  if (!hasValue('cpf', p.cpf)) missing.push('cpf');
  if (!hasValue('phone', p.phone)) missing.push('phone');
  if (p.documentType !== 'CNPJ' && !hasValue('birthDate', p.birthDate)) missing.push('birthDate');
  return missing;
}

const FIELD_NAME: Record<RequirableField, string> = { cpf: 'CPF', phone: 'telefone', birthDate: 'data de nascimento' };

/** "Sem CPF, telefone e data de nascimento" — texto do tooltip do selo. */
export function describeMissingFields(fields: RequirableField[]): string {
  const names = fields.map((f) => FIELD_NAME[f]);
  if (names.length === 0) return '';
  if (names.length === 1) return `Sem ${names[0]}`;
  return `Sem ${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}
