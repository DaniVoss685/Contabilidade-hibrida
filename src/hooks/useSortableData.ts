import { useState, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface UseSortableDataOptions<T = any> {
  defaultKey?: string | null;
  defaultDirection?: SortDirection;
  customComparators?: Record<string, (a: any, b: any) => number>;
}

/**
 * Hook reutilizável de ordenação de dados em memória.
 * - Suporta números, datas (ISO ou pt-BR), strings (com acentuação pt-BR) e nulos.
 * - Ciclo de clique: 'asc' -> 'desc' -> null (retorna à ordenação original).
 * - Imutável: nunca altera o array original.
 */
export function useSortableData<T>(
  items: T[],
  options: UseSortableDataOptions<T> = {}
) {
  const {
    defaultKey = null,
    defaultDirection = null,
    customComparators = {},
  } = options;

  const [sortKey, setSortKey] = useState<string | null>(defaultKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection);

  const handleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
    } else if (sortDirection === 'desc') {
      setSortKey(null);
      setSortDirection(null);
    } else {
      setSortDirection('asc');
    }
  };

  const sortedItems = useMemo(() => {
    if (!sortKey || !sortDirection || items.length === 0) {
      return items;
    }

    const directionMult = sortDirection === 'asc' ? 1 : -1;

    return [...items].sort((a, b) => {
      // 1. Comparador customizado fornecido pelo chamador
      if (customComparators[sortKey]) {
        return directionMult * customComparators[sortKey]!(a, b);
      }

      // 2. Extração do valor da chave (suporta caminhos pontilhados ex: "patient.name")
      const getVal = (obj: any, path: string) => {
        if (!obj) return null;
        if (!path.includes('.')) return obj[path];
        return path.split('.').reduce((acc, part) => (acc ? acc[part] : null), obj);
      };

      const valA = getVal(a, sortKey);
      const valB = getVal(b, sortKey);

      // 3. Regra determinística para nulos / indefinidos / strings vazias: sempre no final
      const isEmptyA = valA === null || valA === undefined || valA === '';
      const isEmptyB = valB === null || valB === undefined || valB === '';

      if (isEmptyA && isEmptyB) return 0;
      if (isEmptyA) return 1; // nulos sempre no final
      if (isEmptyB) return -1;

      // 4. Comparação numérica
      if (typeof valA === 'number' && typeof valB === 'number') {
        return directionMult * (valA - valB);
      }

      // 5. Comparação de datas
      if (typeof valA === 'string' && typeof valB === 'string') {
        // Se for data formato pt-BR "DD/MM/YYYY"
        if (/^\d{2}\/\d{2}\/\d{4}/.test(valA) && /^\d{2}\/\d{2}\/\d{4}/.test(valB)) {
          const [dA, mA, yA] = valA.split('/').map(Number);
          const [dB, mB, yB] = valB.split('/').map(Number);
          const dateA = new Date(yA, mA - 1, dA).getTime();
          const dateB = new Date(yB, mB - 1, dB).getTime();
          return directionMult * (dateA - dateB);
        }

        // Se for data ISO "YYYY-MM-DD"
        if (/^\d{4}-\d{2}-\d{2}/.test(valA) && /^\d{4}-\d{2}-\d{2}/.test(valB)) {
          const timeA = new Date(valA).getTime();
          const timeB = new Date(valB).getTime();
          if (!isNaN(timeA) && !isNaN(timeB)) {
            return directionMult * (timeA - timeB);
          }
        }
      }

      // 6. Comparação alfabética pt-BR (A-Z / Z-A)
      return directionMult * String(valA).localeCompare(String(valB), 'pt-BR', {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }, [items, sortKey, sortDirection, customComparators]);

  return {
    sortedItems,
    sortKey,
    sortDirection,
    handleSort,
    setSortKey,
    setSortDirection,
  };
}
