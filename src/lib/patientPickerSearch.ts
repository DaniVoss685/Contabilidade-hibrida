// Busca em memória dos seletores de paciente (Nova Receita, Agenda...).
//
// A clínica pode ter milhares de pacientes já carregados no cliente. Renderizar todos
// os botões no popover trava a tela; o seletor mostra só as primeiras PICKER_RESULT_LIMIT
// correspondências e diz quantas ficaram de fora ("refine sua busca"). A busca em si
// continua varrendo TODOS os pacientes — o teto vale só para o que é desenhado.
//
// Paciente legado pode não ter CPF/telefone: o filtro nunca assume que existem.

import { normalizeSearchText } from './masks';

export const PICKER_RESULT_LIMIT = 50;

export interface PickerPatient {
  id: string;
  name: string;
  cpf?: string;
  phone?: string;
}

export interface PickerResult<T extends PickerPatient> {
  /** No máximo `limit` pacientes, na ordem original. */
  items: T[];
  /** Total de correspondências (antes do teto). */
  total: number;
  /** Correspondências que não couberam na lista (total - items.length). */
  hiddenCount: number;
}

export function filterPickerPatients<T extends PickerPatient>(
  patients: T[],
  query: string,
  limit: number = PICKER_RESULT_LIMIT,
  selectedId?: string
): PickerResult<T> {
  const trimmed = query.trim();
  let matches: T[];

  if (!trimmed) {
    matches = patients;
  } else {
    const normQuery = normalizeSearchText(trimmed);
    const digitsOnly = trimmed.replace(/\D/g, '');
    matches = patients.filter((p) => {
      if (normalizeSearchText(p.name).includes(normQuery)) return true;
      if (digitsOnly.length < 3) return false;
      const cleanCpf = (p.cpf || '').replace(/\D/g, '');
      if (cleanCpf && cleanCpf.includes(digitsOnly)) return true;
      const cleanPhone = (p.phone || '').replace(/\D/g, '');
      return cleanPhone.length > 0 && cleanPhone.includes(digitsOnly);
    });
  }

  const total = matches.length;
  let items = matches.length > limit ? matches.slice(0, limit) : matches;

  // Sem busca, o paciente já selecionado não pode sumir só porque está além do teto.
  if (!trimmed && selectedId && total > limit && !items.some((p) => p.id === selectedId)) {
    const selected = matches.find((p) => p.id === selectedId);
    if (selected) items = [selected, ...items.slice(0, limit - 1)];
  }

  return { items, total, hiddenCount: total - items.length };
}
