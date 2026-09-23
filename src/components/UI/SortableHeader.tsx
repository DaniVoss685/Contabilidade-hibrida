import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { SortDirection } from '../../hooks/useSortableData';

export interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSortKey: string | null;
  currentDirection: SortDirection;
  onSort: (key: string) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export const SortableHeader: React.FC<SortableHeaderProps> = ({
  label,
  sortKey,
  currentSortKey,
  currentDirection,
  onSort,
  align = 'center',
  className = '',
}) => {
  const isSorted = currentSortKey === sortKey && currentDirection !== null;

  const alignClass =
    align === 'left'
      ? 'justify-start text-left'
      : align === 'right'
      ? 'justify-end text-right'
      : 'justify-center text-center';

  const ariaSortValue = isSorted
    ? currentDirection === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';

  return (
    <th
      scope="col"
      className={`py-3 px-4 ${className}`}
      aria-sort={ariaSortValue}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group inline-flex items-center gap-1.5 cursor-pointer uppercase font-bold text-[11px] tracking-wider transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded px-1 -mx-1 ${
          isSorted
            ? 'text-teal-700 font-black'
            : 'text-slate-500 hover:text-slate-800'
        } ${alignClass} w-full`}
        title={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        <span className="shrink-0 transition-transform">
          {isSorted ? (
            currentDirection === 'asc' ? (
              <ArrowUp className="w-3 h-3 text-teal-600 stroke-[2.5]" />
            ) : (
              <ArrowDown className="w-3 h-3 text-teal-600 stroke-[2.5]" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition-colors opacity-80" />
          )}
        </span>
      </button>
    </th>
  );
};
