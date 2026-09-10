import React, { useState, useMemo } from 'react';
import {
  Package,
  Search,
  PlusCircle,
  Download,
  Trash2,
  Edit,
  RotateCcw,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  Scale,
  DollarSign,
  Tag,
  FlaskConical,
} from 'lucide-react';
import { ClinicalInput, InputUsageUnit } from '../../types';
import { formatCurrency } from '../../lib/masks';
import { exportToCsv } from '../../lib/exportUtils';
import { db } from '../../lib/db';
import { ClinicalInputModal } from '../Modals/ClinicalInputModal';

interface SuppliesViewProps {
  onSelectInputForProcedure?: (input: ClinicalInput) => void;
}

const UNIT_LABELS: Record<InputUsageUnit, { label: string; color: string }> = {
  tubete: { label: 'Tubete', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  ml: { label: 'ml', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  g: { label: 'grama (g)', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  un: { label: 'Unidade', color: 'bg-slate-100 text-slate-800 border-slate-300' },
  dose: { label: 'Dose', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  kit: { label: 'Kit', color: 'bg-teal-100 text-teal-800 border-teal-300' },
};

export const SuppliesView: React.FC<SuppliesViewProps> = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedUnit, setSelectedUnit] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInput, setEditingInput] = useState<ClinicalInput | null>(null);

  // Sync with DB
  const inputs = db.getClinicalInputs();

  // Categories present in database
  const categories = useMemo(() => {
    const set = new Set(inputs.map((i) => i.category));
    return Array.from(set).sort();
  }, [inputs]);

  // Filtered List
  const filteredInputs = useMemo(() => {
    return inputs.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.brand && item.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
        item.purchasePackageName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCat =
        selectedCategory === 'ALL' || item.category === selectedCategory;

      const matchesUnit =
        selectedUnit === 'ALL' || item.usageUnit === selectedUnit;

      return matchesSearch && matchesCat && matchesUnit;
    });
  }, [inputs, searchTerm, selectedCategory, selectedUnit]);

  // Bulk Handlers
  const handleSelectAll = () => {
    if (selectedIds.size === filteredInputs.length && filteredInputs.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInputs.map((i) => i.id)));
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

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (
      confirm(
        `ATENÇÃO: Deseja realmente excluir ${count} insumo(s) selecionado(s) do catálogo?`
      )
    ) {
      db.batchDeleteClinicalInputs(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const handleDeleteSingle = (id: string, name: string) => {
    if (confirm(`Deseja realmente excluir o insumo "${name}"?`)) {
      db.deleteClinicalInput(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleOpenNew = () => {
    setEditingInput(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: ClinicalInput) => {
    setEditingInput(item);
    setIsModalOpen(true);
  };

  const handleSaveModal = (data: Omit<ClinicalInput, 'id' | 'createdAt'>) => {
    if (editingInput) {
      db.updateClinicalInput(editingInput.id, data);
    } else {
      db.addClinicalInput(data);
    }
  };

  const handleResetToDemo = () => {
    if (
      confirm(
        'Deseja restaurar o catálogo de insumos para os padrões clínicos da clínica escola?'
      )
    ) {
      db.resetClinicalInputsToDemo();
      setSelectedIds(new Set());
    }
  };

  const handleExport = () => {
    const headers = [
      'Insumo',
      'Marca',
      'Categoria',
      'Embalagem Compra',
      'Preço Compra',
      'Rendimento',
      'Unidade Uso',
      'Custo Unitário',
    ];
    const rows = filteredInputs.map((i) => [
      i.name,
      i.brand || '',
      i.category,
      i.purchasePackageName,
      i.purchasePrice,
      i.packageQuantity,
      i.usageUnit,
      i.unitCost,
    ]);
    exportToCsv('catalogo_insumos_clinicos', [headers, ...rows]);
  };

  // KPIs
  const totalCount = inputs.length;
  const unitDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of inputs) {
      map[item.usageUnit] = (map[item.usageUnit] || 0) + 1;
    }
    return map;
  }, [inputs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-teal-600" />
            Catálogo de Insumos & Materiais Clínicos
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Cadastro de embalagens, preços de aquisição e custo fracionado por tubete, ml, grama, dose, kit ou unidade
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleResetToDemo}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-xs"
            title="Restaurar lista padrão de insumos odontológicos"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar Padrão
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>

          <button
            onClick={handleOpenNew}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            Novo Insumo
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Insumos no Catálogo</span>
            <Package className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Prontos para precificação</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Anestésicos & Tubetes</span>
            <Scale className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-700">
            {unitDistribution['tubete'] || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Custo unitário por tubete</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Resinas & Gramas</span>
            <Layers className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-black text-purple-700">
            {unitDistribution['g'] || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Fracionado em gramas (g)</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Líquidos & Antissépticos</span>
            <FlaskConical className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-blue-700">
            {unitDistribution['ml'] || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Fracionado em mililitros (ml)</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome do insumo, marca, embalagem ou categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        {/* Category Filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="text-xs font-medium rounded-lg border border-slate-300 p-2 bg-slate-50 focus:ring-2 focus:ring-teal-500 focus:outline-none cursor-pointer"
        >
          <option value="ALL">Categoria: Todas</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        {/* Unit Filter */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs overflow-x-auto">
          {[
            { id: 'ALL', label: 'Todas' },
            { id: 'tubete', label: 'Tubete' },
            { id: 'ml', label: 'ml' },
            { id: 'g', label: 'g' },
            { id: 'un', label: 'Unidade' },
            { id: 'dose', label: 'Dose' },
            { id: 'kit', label: 'Kit' },
          ].map((u) => (
            <button
              key={u.id}
              onClick={() => setSelectedUnit(u.id)}
              className={`px-2.5 py-1 rounded-md font-semibold text-[11px] whitespace-nowrap transition-all cursor-pointer ${
                selectedUnit === u.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-lg border border-slate-800 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="bg-teal-500 text-slate-950 text-xs font-extrabold px-2.5 py-0.5 rounded-full">
              {selectedIds.size}
            </span>
            <span className="text-xs font-semibold text-slate-200">
              insumo(s) selecionado(s)
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
                    title={
                      selectedIds.size === filteredInputs.length && filteredInputs.length > 0
                        ? 'Desmarcar todos'
                        : 'Selecionar todos'
                    }
                  >
                    {filteredInputs.length > 0 &&
                    selectedIds.size === filteredInputs.length ? (
                      <CheckSquare className="w-4 h-4 text-teal-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4">Insumo / Material</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4">Embalagem de Aquisição</th>
                <th className="py-3 px-4 text-right">Preço Compra</th>
                <th className="py-3 px-4 text-center">Rendimento</th>
                <th className="py-3 px-4 text-center">Unidade de Uso</th>
                <th className="py-3 px-4 text-right font-black text-teal-900">
                  Custo Unitário
                </th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {filteredInputs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Nenhum insumo encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredInputs.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  const unitMeta = UNIT_LABELS[item.usageUnit] || {
                    label: item.usageUnit,
                    color: 'bg-slate-100 text-slate-800 border-slate-300',
                  };

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-teal-50/60' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(item.id)}
                          className="cursor-pointer text-slate-600 hover:text-slate-900"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-teal-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                          )}
                        </button>
                      </td>

                      {/* Insumo */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{item.name}</div>
                        {item.brand && (
                          <div className="text-[10px] text-slate-500">
                            Marca: {item.brand}
                          </div>
                        )}
                        {item.notes && (
                          <div className="text-[10px] text-teal-700 italic mt-0.5">
                            {item.notes}
                          </div>
                        )}
                      </td>

                      {/* Categoria */}
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {item.category}
                        </span>
                      </td>

                      {/* Embalagem */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-800">
                        {item.purchasePackageName}
                      </td>

                      {/* Preço Compra */}
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-900">
                        {formatCurrency(item.purchasePrice)}
                      </td>

                      {/* Rendimento */}
                      <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-700">
                        {item.packageQuantity} {item.usageUnit}
                      </td>

                      {/* Unidade */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${unitMeta.color}`}
                        >
                          {unitMeta.label}
                        </span>
                      </td>

                      {/* Custo Unitário */}
                      <td className="py-3.5 px-4 text-right font-black text-teal-800 font-mono text-sm">
                        R$ {item.unitCost.toFixed(item.unitCost < 0.1 ? 3 : 2)}
                        <span className="text-[10px] font-normal text-slate-500 ml-1">
                          /{item.usageUnit}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                            title="Editar insumo"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSingle(item.id, item.name)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Excluir insumo"
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

      {/* Modal */}
      <ClinicalInputModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveModal}
        initialData={editingInput}
      />
    </div>
  );
};
