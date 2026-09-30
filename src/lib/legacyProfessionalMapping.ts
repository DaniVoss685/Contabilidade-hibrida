// Proposta de mapeamento "dentista do sistema anterior → profissional atual".
//
// SÓ PROPÕE. Nada aqui grava mapeamento, cria usuário ou cria profissional: o resultado é
// uma sugestão para o usuário confirmar (a confirmação humana é obrigatória mesmo para
// confiança ALTA). Dentista sem correspondência segura permanece com o nome legado
// (`legacy_dentist_name` / `professional_name`), nunca é atribuído a outra pessoa por
// aproximação fraca.
//
// Regras de correspondência (nome apenas — não há CRO/CPF no arquivo legado):
//  - títulos (DR, DRA, DOUTOR(A), PROF...) e acentos/pontuação são ignorados;
//  - nomes iguais após normalização → ALTA;
//  - todas as palavras do nome legado presentes no profissional atual (ex.: "AMANDA FERRAZ"
//    ⊂ "Amanda Ferraz Dantas") com pelo menos 2 palavras → MEDIA;
//  - só 1 palavra em comum, ou 2+ candidatos empatados → sem sugestão (mantém legado).

export interface ProfessionalCandidate {
  id: string;
  name: string;
}

export type ProposalConfidence = 'ALTA' | 'MEDIA' | 'NENHUMA';

export interface ProfessionalProposal {
  legacyName: string;
  /** Quantos prontuários do arquivo carregam este dentista (quando informado). */
  recordCount: number;
  candidate: ProfessionalCandidate | null;
  confidence: ProposalConfidence;
  reason: string;
  /** Sempre falso: a proposta nunca se confirma sozinha. */
  confirmed: false;
  /** O que acontece se o usuário não decidir: o nome legado é preservado como está. */
  fallback: 'KEEP_LEGACY_NAME';
}

const TITLE_TOKENS = new Set(['DR', 'DRA', 'DRS', 'DOUTOR', 'DOUTORA', 'PROF', 'PROFA', 'PROFESSOR', 'PROFESSORA']);

export function professionalNameTokens(name: string): string[] {
  const cleaned = (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ');
  return cleaned
    .split(/\s+/)
    .filter((t) => t && !TITLE_TOKENS.has(t));
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t) => b.includes(t));
}

export function proposeProfessionalMapping(
  legacyDentists: Array<{ name: string; count?: number }>,
  professionals: ProfessionalCandidate[]
): ProfessionalProposal[] {
  const profTokens = professionals.map((p) => ({ prof: p, tokens: professionalNameTokens(p.name) }));

  return legacyDentists.map(({ name, count }) => {
    const legacyTokens = professionalNameTokens(name);
    const base = {
      legacyName: name,
      recordCount: count ?? 0,
      confirmed: false as const,
      fallback: 'KEEP_LEGACY_NAME' as const,
    };

    if (legacyTokens.length === 0) {
      return { ...base, candidate: null, confidence: 'NENHUMA' as const, reason: 'Nome legado vazio.' };
    }

    const exact = profTokens.filter((p) => sameSet(legacyTokens, p.tokens));
    if (exact.length === 1) {
      return {
        ...base,
        candidate: exact[0].prof,
        confidence: 'ALTA' as const,
        reason: 'Mesmo nome (ignorando título e acentos). Ainda exige confirmação.',
      };
    }
    if (exact.length > 1) {
      return { ...base, candidate: null, confidence: 'NENHUMA' as const, reason: 'Mais de um profissional com o mesmo nome — decidir manualmente.' };
    }

    const contained = profTokens.filter(
      (p) => legacyTokens.length >= 2 && legacyTokens.every((t) => p.tokens.includes(t))
    );
    if (contained.length === 1) {
      const extra = contained[0].tokens.filter((t) => !legacyTokens.includes(t));
      return {
        ...base,
        candidate: contained[0].prof,
        confidence: 'MEDIA' as const,
        reason: `Nome legado contido no cadastro atual (faltam: ${extra.join(' ') || '—'}). Confirmar se é a mesma pessoa.`,
      };
    }
    if (contained.length > 1) {
      return { ...base, candidate: null, confidence: 'NENHUMA' as const, reason: 'Mais de um profissional compatível — decidir manualmente.' };
    }

    return {
      ...base,
      candidate: null,
      confidence: 'NENHUMA' as const,
      reason: 'Nenhum profissional atual corresponde com segurança — o nome legado será preservado.',
    };
  });
}

// ─── Mapeamento DEFINITIVO confirmado pelo usuário ─────────────────────────────────

export interface ConfirmedProfessionalMapping {
  /** Nome legado como gravado no mapa (df_legacy_import_map.legacy_id, entity_type 'professional'). */
  legacyName: string;
  professionalId: string;
}

/** Chave estável de comparação de nome de dentista: ignora título, acento, pontuação e ordem de espaços. */
export function professionalNameKey(name: string): string {
  return professionalNameTokens(name).join(' ');
}

/**
 * Procura o mapeamento confirmado do dentista legado. "DRA AMANDA FERRAZ" e "DRA. AMANDA FERRAZ"
 * são o mesmo dentista (mesma chave). Sem mapeamento -> undefined (o nome legado é preservado).
 */
export function findConfirmedProfessional(
  legacyName: string,
  confirmed: ConfirmedProfessionalMapping[]
): ConfirmedProfessionalMapping | undefined {
  const key = professionalNameKey(legacyName);
  if (!key) return undefined;
  return confirmed.find((c) => professionalNameKey(c.legacyName) === key);
}

/**
 * Mapa no formato usado por buildRecordCommitRow: só os dentistas CONFIRMADOS viram
 * profissional atual; os demais ficam com o nome legado (keepLegacy). O nome original do dentista
 * é sempre preservado em legacy_dentist_name pelo commit do prontuário.
 */
export function buildProfessionalMappingFromConfirmed(
  legacyDentists: string[],
  confirmed: ConfirmedProfessionalMapping[],
  professionals: ProfessionalCandidate[]
): Record<string, { professionalId?: string; displayName: string; keepLegacy: boolean }> {
  const out: Record<string, { professionalId?: string; displayName: string; keepLegacy: boolean }> = {};
  for (const legacy of legacyDentists) {
    const hit = findConfirmedProfessional(legacy, confirmed);
    const prof = hit ? professionals.find((p) => p.id === hit.professionalId) : undefined;
    out[legacy] = prof
      ? { professionalId: prof.id, displayName: prof.name, keepLegacy: false }
      : { displayName: legacy, keepLegacy: true };
  }
  return out;
}
