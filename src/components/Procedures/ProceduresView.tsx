import React, { useState, useMemo } from 'react';
import {
  Activity,
  Search,
  PlusCircle,
  Download,
  Trash2,
  Edit,
  Clock,
  DollarSign,
  Package,
  Layers,
  RotateCcw,
  Sparkles,
  CheckSquare,
  Square,
  Copy,
  FlaskConical,
} from 'lucide-react';
import { DentalProcedure } from '../../types';
import { formatCurrency } from '../../lib/masks';
import { safeMargin, formatPercent, safeDivide } from '../../lib/mathUtils';
import { exportToCsv } from '../../lib/exportUtils';
import { db } from '../../lib/db';
import { ProcedureModal } from '../Modals/ProcedureModal';
import { SuppliesView } from '../Supplies/SuppliesView';
import { CustomSelect, ConfirmDialog, useToast, SortableHeader } from '../UI';
import { useSortableData } from '../../hooks/useSortableData';

interface ProceduresViewProps {
  procedures: DentalProcedure[];
  onOpenNewProcedure?: () => void;
  initialOpenNewModal?: boolean;
  onClearAction?: () => void;
}

const CATEGORY_NAMES: Record<DentalProcedure['category'], string> = {
  PREVENTIVA: 'Preventiva',
  DENTISTICA: 'Dentística',
  ENDODONTIA: 'Endodontia',
  PERIODONTIA: 'Periodontia',
  CIRURGIA: 'Cirurgia',
  PROTESE: 'Prótese',
  IMPLANTODONTIA: 'Implante',
  ORTODONTIA: 'Ortodontia',
  ESTETICA: 'Estética',
  OUTROS: 'Outros',
};

export const ProceduresView: React.FC<ProceduresViewProps> = ({
  procedures,
  initialOpenNewModal = false,
  onClearAction,
}) => {
  const toast = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'procedures' | 'supplies'>('procedures');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(initialOpenNewModal);
  const [editingProcedure, setEditingProcedure] = useState<DentalProcedure | null>(null);

  React.useEffect(() => {
    if (initialOpenNewModal) {
      setEditingProcedure(null);
      setIsModalOpen(true);
      if (onClearAction) onClearAction();
    }
  }, [initialOpenNewModal, onClearAction]);

  // Filtered Procedures
  const filteredProcedures = useMemo(() => {
    return procedures.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCat =
        selectedCategory === 'ALL' || p.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [procedures, searchTerm, selectedCategory]);

  const {
    sortedItems: displayProcedures,
    sortKey,
    sortDirection,
    handleSort,
  } = useSortableData(filteredProcedures, {
    customComparators: {
      directCost: (a, b) => (a.totalDirectCost || 0) - (b.totalDirectCost || 0),
      defaultPrice: (a, b) => (a.defaultPrice || 0) - (b.defaultPrice || 0),
      netProfit: (a, b) => ((a.defaultPrice || 0) - (a.totalDirectCost || 0)) - ((b.defaultPrice || 0) - (b.totalDirectCost || 0)),
      markupMargin: (a, b) => {
        const mA = safeMargin(a.defaultPrice || 0, a.totalDirectCost || 0);
        const mB = safeMargin(b.defaultPrice || 0, b.totalDirectCost || 0);
        return (mA.status === 'OK' ? mA.marginPercent : -999) - (mB.status === 'OK' ? mB.marginPercent : -999);
      },
    },
  });

  // Key KPI Metrics
  const metrics = useMemo(() => {
    const count = procedures.length;
    if (count === 0) {
      return { count: 0, avgCost: 0, avgPrice: 0, avgMargin: null };
    }
    const totalCost = procedures.reduce((acc, p) => acc + (p.totalDirectCost || 0), 0);
    const totalPrice = procedures.reduce((acc, p) => acc + (p.defaultPrice || 0), 0);
    const marginRes = safeMargin(totalPrice, totalCost);
    const avgMargin = marginRes.status === 'OK' ? marginRes.marginPercent : null;

    return {
      count,
      avgCost: safeDivide(totalCost, count, 0),
      avgPrice: safeDivide(totalPrice, count, 0),
      avgMargin,
    };
  }, [procedures]);

  // Bulk Selection Handlers
  const handleSelectAll = () => {
    if (selectedIds.size === displayProcedures.length && displayProcedures.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayProcedures.map((p) => p.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    consequence?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setConfirmState({
      isOpen: true,
      title: `Excluir ${count} procedimentos`,
      description: `Deseja realmente excluir os ${count} procedimentos selecionados do catálogo?`,
      consequence: 'Esta ação não poderá ser desfeita.',
      variant: 'danger',
      onConfirm: () => {
        db.batchDeleteProcedures(Array.from(selectedIds));
        setSelectedIds(new Set());
      },
    });
  };

  // Single Action Handlers
  const handleEdit = (proc: DentalProcedure) => {
    setEditingProcedure(proc);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Excluir Procedimento',
      description: `Deseja realmente excluir o procedimento "${name}" do catálogo?`,
      consequence: 'O procedimento não aparecerá mais em novos lançamentos.',
      variant: 'danger',
      onConfirm: () => {
        db.deleteProcedure(id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.success('Procedimento excluído do catálogo.');
      },
    });
  };

  const handleDuplicate = (proc: DentalProcedure) => {
    db.addProcedure({
      ...proc,
      code: `${proc.code}-COPIA`,
      name: `${proc.name} (Cópia)`,
    });
    toast.success('Procedimento duplicado com sucesso.');
  };

  const handleResetToDemo = () => {
    setConfirmState({
      isOpen: true,
      title: 'Restaurar Catálogo Padrão',
      description: 'Deseja restaurar a tabela padrão de procedimentos clínicos com custos e precificação configurados?',
      consequence: 'Procedimentos personalizados serão substituídos pelos modelos iniciais.',
      variant: 'warning',
      onConfirm: () => {
        db.resetProceduresToDemo();
        setSelectedIds(new Set());
        toast.success('Catálogo de procedimentos restaurado.');
      },
    });
  };

  const handleSaveProcedure = (procData: Omit<DentalProcedure, 'id'>) => {
    if (editingProcedure) {
      db.updateProcedure(editingProcedure.id, procData);
      toast.success('Procedimento atualizado com sucesso.');
    } else {
      db.addProcedure(procData);
      toast.success('Procedimento cadastrado com sucesso.');
    }
    setEditingProcedure(null);
  };

  const handleExportCsv = () => {
    const headers = [
      'Código',
      'Nome do Procedimento',
      'Especialidade',
      'Tempo de Cadeira (min)',
      'Custo Hora Dentista',
      'Custo Insumos',
      'Custo Laboratório',
      'Custo Direto Total',
      'Preço de Tabela',
      'Margem de Lucro (%)',
      'Lucro Bruto (R$)',
    ];

    const rows = filteredProcedures.map((p) => {
      const marginInfo = safeMargin(p.defaultPrice, p.totalDirectCost);
      const marginStr = marginInfo.status === 'OK' ? `${marginInfo.marginPercent}%` : '—';
      const profit = (p.defaultPrice - p.totalDirectCost).toFixed(2);

      return [
        p.code,
        p.name,
        CATEGORY_NAMES[p.category] || p.category,
        p.clinicalDurationMinutes,
        p.costProfessionalTime,
        p.costInputsTotal,
        p.labCost,
        p.totalDirectCost,
        p.defaultPrice,
        marginStr,
        profit,
      ];
    });

    exportToCsv('tabela_procedimentos_e_custos', [headers, ...rows]);
  };

  const allSelected =
    filteredProcedures.length > 0 && selectedIds.size === filteredProcedures.length;

  return (
    <div className="space-y-6">
      {/* Sub-tabs Navigation */}
      <div className="flex items-center gap-1.5 bg-slate-200/70 p-1.5 rounded-xl border border-slate-300/80 w-fit">
        <button
          type="button"
          onClick={() => setActiveSubTab('procedures')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'procedures'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Activity className="w-4 h-4 text-teal-600" />
          Procedimentos & Precificação ({procedures.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('supplies')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'supplies'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FlaskConical className="w-4 h-4 text-teal-600" />
          Catálogo de Insumos & Materiais ({db.getClinicalInputs().length})
        </button>
      </div>

      {activeSubTab === 'supplies' ? (
        <SuppliesView />
      ) : (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Activity className="w-5 h-5 text-teal-600" />
                Catálogo de Procedimentos & Precificação
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cadastre tratamentos, insumos clínicos, custo de cadeira do dentista e defina preços com margem real
              </p>
            </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleResetToDemo}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Restaurar tabela modelo"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar Padrões</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={() => {
              setEditingProcedure(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-md active:scale-98 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ NOVO PROCEDIMENTO</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Procedimentos Cadastrados</div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            {metrics.count}
          </div>
          <div className="text-[11px] text-teal-600 font-semibold mt-0.5">
            Disponíveis para vendas rápidas
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Custo Direto Médio</div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            {formatCurrency(metrics.avgCost)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Insumos + Hora Clínica + Prótese
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Preço Médio Praticado</div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            {formatCurrency(metrics.avgPrice)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Tabela de honorários
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Margem Média de Contribuição</div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-1">
            {formatPercent(metrics.avgMargin)}
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
            Lucro após custos diretos
          </div>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-lg border border-slate-800 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="bg-teal-500 text-slate-950 text-xs font-extrabold px-2.5 py-0.5 rounded-full">
              {selectedIds.size}
            </span>
            <span className="text-xs font-semibold text-slate-200">
              procedimento(s) selecionado(s)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir em Lote
            </button>

            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Desmarcar
            </button>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, código ou descrição do procedimento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
          />
        </div>

        <div className="w-full md:w-64">
          <CustomSelect
            options={[
              { value: 'ALL', label: 'Todas as Especialidades' },
              { value: 'DENTISTICA', label: 'Dentística' },
              { value: 'PREVENTIVA', label: 'Preventiva' },
              { value: 'ENDODONTIA', label: 'Endodontia' },
              { value: 'CIRURGIA', label: 'Cirurgia' },
              { value: 'PROTESE', label: 'Prótese' },
              { value: 'IMPLANTODONTIA', label: 'Implante' },
              { value: 'ESTETICA', label: 'Estética' },
              { value: 'PERIODONTIA', label: 'Periodontia' },
              { value: 'ORTODONTIA', label: 'Ortodontia' },
            ]}
            value={selectedCategory}
            onChange={(val) => setSelectedCategory(val)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[11px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="cursor-pointer text-slate-600 hover:text-slate-900"
                  >
                    {allSelected ? (
                      <CheckSquare className="w-4 h-4 text-teal-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <SortableHeader
                  label="Código / Procedimento"
                  sortKey="name"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="left"
                />
                <SortableHeader
                  label="Especialidade"
                  sortKey="category"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="left"
                />
                <SortableHeader
                  label="Tempo Clínico"
                  sortKey="estimatedTimeMinutes"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                <SortableHeader
                  label="Custo Direto"
                  sortKey="directCost"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="Preço de Tabela"
                  sortKey="defaultPrice"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="Margem Lucro"
                  sortKey="markupMargin"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                <SortableHeader
                  label="Lucro Líquido"
                  sortKey="netProfit"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {displayProcedures.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Nenhum procedimento encontrado. Clique em "+ NOVO PROCEDIMENTO" para cadastrar.
                  </td>
                </tr>
              ) : (
                displayProcedures.map((proc) => {
                  const isSelected = selectedIds.has(proc.id);
                  const marginInfo = safeMargin(proc.defaultPrice, proc.totalDirectCost);
                  const profitBrl = proc.defaultPrice - proc.totalDirectCost;

                  return (
                    <tr
                      key={proc.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-teal-50/50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(proc.id)}
                          className="cursor-pointer text-slate-500 hover:text-slate-800"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-teal-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </button>
                      </td>

                      {/* Code & Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-bold text-slate-900 text-sm">{proc.name}</div>
                          {proc.isIncomplete && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              Cadastro Incompleto
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                            {proc.code}
                          </span>
                          {proc.description && (
                            <span className="text-[11px] text-slate-500 truncate max-w-xs">
                              {proc.description}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {CATEGORY_NAMES[proc.category] || proc.category}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {proc.clinicalDurationMinutes < 60
                            ? `${proc.clinicalDurationMinutes} min`
                            : `${Math.floor(proc.clinicalDurationMinutes / 60)}h${
                                proc.clinicalDurationMinutes % 60 ? ` ${proc.clinicalDurationMinutes % 60}min` : ''
                              }`}
                        </span>
                      </td>

                      {/* Direct Cost */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-bold text-slate-800">
                          {formatCurrency(proc.totalDirectCost)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Insumos: {formatCurrency(proc.costInputsTotal)}
                        </div>
                      </td>

                      {/* Default Price */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-black text-slate-900 text-sm">
                          {formatCurrency(proc.defaultPrice)}
                        </div>
                        {proc.suggestedPrice && (
                          <div className="text-[10px] text-teal-700">
                            Sugerido: {formatCurrency(proc.suggestedPrice)}
                          </div>
                        )}
                      </td>

                      {/* Margin % */}
                      <td className="py-3.5 px-4 text-center">
                        {marginInfo.status === 'NO_PRICE' ? (
                          <span className="text-slate-400 font-medium text-[11px]">—</span>
                        ) : marginInfo.status === 'WAITING_COSTS' ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded-full font-bold text-[10px] bg-slate-100 text-slate-600"
                            title="Aguardando cadastro de insumos e custos diretos"
                          >
                            Aguardando custos
                          </span>
                        ) : (
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full font-black text-[11px] ${
                              marginInfo.marginPercent !== null && marginInfo.marginPercent >= 60
                                ? 'bg-emerald-100 text-emerald-800'
                                : marginInfo.marginPercent !== null && marginInfo.marginPercent >= 40
                                ? 'bg-teal-100 text-teal-800'
                                : marginInfo.marginPercent !== null && marginInfo.marginPercent >= 20
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {formatPercent(marginInfo.marginPercent)}
                          </span>
                        )}
                      </td>

                      {/* Profit BRL */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-bold text-emerald-700">
                          +{formatCurrency(profitBrl)}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEdit(proc)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                            title="Editar procedimento e precificação"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDuplicate(proc)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Duplicar procedimento"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDelete(proc.id, proc.name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Excluir procedimento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* Procedure Modal */}
      <ProcedureModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProcedure(null);
        }}
        onSave={handleSaveProcedure}
        initialProcedure={editingProcedure}
      />
      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        description={confirmState.description}
        consequence={confirmState.consequence}
        variant={confirmState.variant}
      />
    </div>
  );
};
