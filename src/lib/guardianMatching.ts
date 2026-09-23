// Critérios seguros para reaproveitar um responsável (guardian) já cadastrado
// no tenant, em vez de criar um duplicado. Usado por SupabaseService.upsertGuardian
// (src/lib/supabaseClient.ts) e será a MESMA lógica que o importador da
// Odonto Minas deve usar na próxima tarefa (ver CLAUDE.md "Guardian /
// responsável e telefone compartilhado" — contrato de importação).
//
// Critérios, em ordem de prioridade:
// 1. CPF válido e igual (dado forte, nunca ambíguo).
// 2. Nome normalizado + telefone normalizado iguais (par forte quando não há CPF).
// Um match só por telefone (sem nome) NÃO reutiliza — números são reciclados
// entre pessoas reais ao longo do tempo, e o "responsável" é uma identidade,
// não um número.

export interface GuardianCandidate {
  id: string;
  name: string;
  cpf?: string;
  phone?: string;
  email?: string;
}

export interface GuardianQuery {
  name: string;
  cpf?: string;
  phone?: string;
}

export function normalizeGuardianName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function resolveGuardianMatch(
  candidates: GuardianCandidate[],
  query: GuardianQuery
): GuardianCandidate | null {
  const cleanCpf = (query.cpf || '').replace(/\D/g, '');
  if (cleanCpf) {
    const byCpf = candidates.find((c) => (c.cpf || '').replace(/\D/g, '') === cleanCpf);
    if (byCpf) return byCpf;
  }

  const cleanPhone = (query.phone || '').replace(/\D/g, '');
  const normName = normalizeGuardianName(query.name || '');
  if (cleanPhone && normName) {
    const byNamePhone = candidates.find(
      (c) => (c.phone || '').replace(/\D/g, '') === cleanPhone && normalizeGuardianName(c.name) === normName
    );
    if (byNamePhone) return byNamePhone;
  }

  return null;
}
