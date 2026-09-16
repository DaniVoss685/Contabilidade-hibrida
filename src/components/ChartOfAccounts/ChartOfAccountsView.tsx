import React, { useState, useMemo } from 'react';
import {
  FolderTree,
  Search,
  Filter,
  Plus,
  Edit2,
  CheckCircle,
  AlertTriangle,
  Info,
  X,
  Sliders,
  RotateCcw,
} from 'lucide-react';
import { ExpenseCategory, LivroCaixaPfDedutibilidade } from '../../types';
import { db } from '../../lib/db';
import {
  OPERATIONAL_EXPENSE_GROUPS,
  getOperationalGroup,
} from '../../lib/chartOfAccountsData';
import { CustomSelect, useToast } from '../UI';

interface ChartOfAccountsViewProps {
  categories: ExpenseCategory[];
}

export const ChartOfAccountsView: React.FC<ChartOfAccountsViewProps> = ({
  categories,
}) => {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [deductibleFilter, setDeductibleFilter] = useState<string>('ALL');
  const [fatorRFilter, setFatorRFilter] = useState<string>('ALL');

  // Edit / Add modal
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Form State
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formGroupCode, setFormGroupCode] = useState('01');
  const [formGroupName, setFormGroupName] = useState('01 - Salários e Equipe (Pessoal & Folha)');
  const [formDedutivelPf, setFormDedutivelPf] = useState<LivroCaixaPfDedutibilidade>('SIM');
  const [formImpactaFatorR, setFormImpactaFatorR] = useState(false);
  const [formDespesaOpPj, setFormDespesaOpPj] = useState(true);
  const [formNoticeText, setFormNoticeText] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Groups list
  const uniqueGroups = useMemo(() => {
    return Array.from(new Set(categories.map((c) => c.groupName))).sort();
  }, [categories]);

  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      const matchesSearch =
        cat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cat.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (cat.noticeText && cat.noticeText.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesGroup = groupFilter === 'ALL' || cat.groupName === groupFilter;
      const matchesDed =
        deductibleFilter === 'ALL' || cat.dedutivelLivroCaixaPf === deductibleFilter;
      const matchesFatorR =
        fatorRFilter === 'ALL' ||
        (fatorRFilter === 'SIM' && cat.impactaFatorRPj) ||
        (fatorRFilter === 'NAO' && !cat.impactaFatorRPj);

      return matchesSearch && matchesGroup && matchesDed && matchesFatorR;
    });
  }, [categories, searchTerm, groupFilter, deductibleFilter, fatorRFilter]);

  const handleOpenEdit = (cat: ExpenseCategory) => {
    const gCode = cat.groupCode || (cat.code ? cat.code.split('.')[0] : '01');
    const groupDef = getOperationalGroup(gCode);
    setEditingCategory(cat);
    setFormCode(cat.code);
    setFormName(cat.name);
    setFormGroupCode(gCode);
    setFormGroupName(cat.groupName || groupDef.name);
    setFormDedutivelPf(cat.dedutivelLivroCaixaPf);
    setFormImpactaFatorR(cat.impactaFatorRPj);
    setFormDespesaOpPj(cat.despesaOperacionalPj);
    setFormNoticeText(cat.noticeText || '');
    setIsAddingNew(false);
  };

  const handleOpenAdd = () => {
    const defaultGroupCode = '04';
    const groupDef = getOperationalGroup(defaultGroupCode);
    const existingInGroup = categories.filter(
      (c) => (c.groupCode || (c.code ? c.code.split('.')[0] : '')) === defaultGroupCode
    );
    const nextSeq = existingInGroup.length + 1;
    setEditingCategory(null);
    setFormCode(`${defaultGroupCode}.${nextSeq < 10 ? '0' : ''}${nextSeq}`);
    setFormName('');
    setFormGroupCode(defaultGroupCode);
    setFormGroupName(groupDef.name);
    setFormDedutivelPf('SIM');
    setFormImpactaFatorR(false);
    setFormDespesaOpPj(true);
    setFormNoticeText('');
    setIsAddingNew(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCode.trim()) return;

    if (isAddingNew) {
      db.addCategory({
        code: formCode.trim(),
        groupCode: formGroupCode,
        groupName: formGroupName.trim(),
        name: formName.trim(),
        dedutivelLivroCaixaPf: formDedutivelPf,
        impactaFatorRPj: formImpactaFatorR,
        despesaOperacionalPj: formDespesaOpPj,
        noticeText: formNoticeText.trim() || undefined,
        active: true,
      });
      toast.success('Categoria contábil cadastrada com sucesso.');
    } else if (editingCategory) {
      db.updateCategory(editingCategory.id, {
        code: formCode.trim(),
        groupCode: formGroupCode,
        groupName: formGroupName.trim(),
        name: formName.trim(),
        dedutivelLivroCaixaPf: formDedutivelPf,
        impactaFatorRPj: formImpactaFatorR,
        despesaOperacionalPj: formDespesaOpPj,
        noticeText: formNoticeText.trim() || undefined,
      });
      toast.success('Categoria contábil atualizada com sucesso.');
    }

    setEditingCategory(null);
    setIsAddingNew(false);
  };

  const handleResetToStandard = () => {
    db.resetChartOfAccounts();
    setShowResetConfirm(false);
    toast.success('Plano de contas restaurado com sucesso.');
  };

  const handleToggleActive = (cat: ExpenseCategory) => {
    db.updateCategory(cat.id, { active: !cat.active });
    toast.info(!cat.active ? 'Categoria contábil ativada.' : 'Categoria contábil desativada.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-teal-600" />
            Plano de Contas Odontológico Padronizado
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Estrutura contábil com os 3 atributos tributários independentes por categoria
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all cursor-pointer shadow-xs"
            title="Restaura os grupos operacionais padrão e todas as categorias clínicas"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Restaurar Grupos Padrão</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-md active:scale-98 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Categoria</span>
          </button>
        </div>
      </div>

      {/* Attributes Explanation Box */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
        <div className="space-y-1">
          <span className="font-bold text-slate-900 flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            1. Dedutível Livro Caixa (PF)
          </span>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Abate diretamente a base de cálculo do IRPF Carnê-Leão (instruções normativas RFB). Pode ser Sim, Condicional ou Não.
          </p>
        </div>

        <div className="space-y-1">
          <span className="font-bold text-slate-900 flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
            2. Impacta Fator R (PJ)
          </span>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Compõe o total da Folha de Salários em 12 meses (FS12), influenciando o enquadramento no Anexo III (&ge; 28%) ou V.
          </p>
        </div>

        <div className="space-y-1">
          <span className="font-bold text-slate-900 flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            3. Despesa Operacional (PJ)
          </span>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Necessária para a apuração contábil do resultado societário e distribuição de lucros isentos aos sócios.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filtrar por código, nome ou nota explicativa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none"
          />
        </div>

        {/* Group Filter */}
        <div className="w-48">
          <CustomSelect
            value={groupFilter}
            onChange={(val) => setGroupFilter(val)}
            options={[
              { value: 'ALL', label: 'Todos os Grupos' },
              ...uniqueGroups.map((g) => ({ value: g, label: g })),
            ]}
            searchable
          />
        </div>

        {/* Livro Caixa Filter */}
        <div className="w-48">
          <CustomSelect
            value={deductibleFilter}
            onChange={(val) => setDeductibleFilter(val)}
            options={[
              { value: 'ALL', label: 'Livro Caixa: Todos' },
              { value: 'SIM', label: 'Dedutível (SIM)' },
              { value: 'CONDICIONAL', label: 'Condicional' },
              { value: 'NAO', label: 'Não Dedutível' },
            ]}
          />
        </div>

        {/* Fator R Filter */}
        <div className="w-44">
          <CustomSelect
            value={fatorRFilter}
            onChange={(val) => setFatorRFilter(val)}
            options={[
              { value: 'ALL', label: 'Fator R: Todos' },
              { value: 'SIM', label: 'Impacta Fator R' },
              { value: 'NAO', label: 'Não Impacta' },
            ]}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[11px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Nome da Categoria</th>
                <th className="py-3 px-4">Grupo Contábil</th>
                <th className="py-3 px-4 text-center">Dedutível Livro Caixa (PF)</th>
                <th className="py-3 px-4 text-center">Impacta Fator R (PJ)</th>
                <th className="py-3 px-4 text-center">Desp. Operacional (PJ)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {filteredCategories.map((cat) => {
                return (
                  <tr
                    key={cat.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      !cat.active ? 'opacity-50 bg-slate-50' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {cat.code}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{cat.name}</div>
                      {cat.noticeText && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{cat.noticeText}</div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-medium text-slate-600">
                      {cat.groupName}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold ${
                          cat.dedutivelLivroCaixaPf === 'SIM'
                            ? 'bg-emerald-100 text-emerald-800'
                            : cat.dedutivelLivroCaixaPf === 'CONDICIONAL'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {cat.dedutivelLivroCaixaPf}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold ${
                          cat.impactaFatorRPj
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {cat.impactaFatorRPj ? 'SIM' : 'NÃO'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold ${
                          cat.despesaOperacionalPj
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {cat.despesaOperacionalPj ? 'SIM' : 'NÃO'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleToggleActive(cat)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                          cat.active
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        {cat.active ? 'Ativa' : 'Inativa'}
                      </button>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleOpenEdit(cat)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Editar categoria e atributos fiscais"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Add Modal */}
      {(editingCategory || isAddingNew) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="text-base font-bold text-slate-900">
                {isAddingNew ? 'Nova Categoria no Plano de Contas' : `Editar Categoria ${formCode}`}
              </h3>
              <button
                onClick={() => {
                  setEditingCategory(null);
                  setIsAddingNew(false);
                }}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Código *</label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="w-full text-xs rounded border border-slate-300 p-2 font-mono"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nome da Categoria *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full text-xs rounded border border-slate-300 p-2"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Grupo Operacional *
                </label>
                <CustomSelect
                  value={formGroupCode}
                  onChange={(val) => {
                    const code = val;
                    const g = getOperationalGroup(code);
                    setFormGroupCode(code);
                    setFormGroupName(g.name);
                    if (isAddingNew) {
                      const count = categories.filter(
                        (c) => (c.groupCode || (c.code ? c.code.split('.')[0] : '')) === code
                      ).length + 1;
                      setFormCode(`${code}.${count < 10 ? '0' : ''}${count}`);
                    }
                  }}
                  options={Object.entries(OPERATIONAL_EXPENSE_GROUPS).map(([code, g]) => ({
                    value: code,
                    label: g.name,
                  }))}
                  searchable
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {getOperationalGroup(formGroupCode).description}
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-xs font-bold text-slate-800 uppercase block">
                  Configuração dos 3 Atributos Fiscais:
                </span>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Livro Caixa PF
                    </label>
                    <CustomSelect
                      value={formDedutivelPf}
                      onChange={(val) => setFormDedutivelPf(val as LivroCaixaPfDedutibilidade)}
                      options={[
                        { value: 'SIM', label: 'SIM' },
                        { value: 'CONDICIONAL', label: 'CONDICIONAL' },
                        { value: 'NAO', label: 'NÃO' },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Fator R (PJ)
                    </label>
                    <CustomSelect
                      value={formImpactaFatorR ? 'true' : 'false'}
                      onChange={(val) => setFormImpactaFatorR(val === 'true')}
                      options={[
                        { value: 'false', label: 'NÃO' },
                        { value: 'true', label: 'SIM' },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Operacional PJ
                    </label>
                    <CustomSelect
                      value={formDespesaOpPj ? 'true' : 'false'}
                      onChange={(val) => setFormDespesaOpPj(val === 'true')}
                      options={[
                        { value: 'true', label: 'SIM' },
                        { value: 'false', label: 'NÃO' },
                      ]}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nota Explicativa</label>
                <input
                  type="text"
                  value={formNoticeText}
                  onChange={(e) => setFormNoticeText(e.target.value)}
                  placeholder=""
                  className="w-full text-xs rounded border border-slate-300 p-2"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCategory(null);
                    setIsAddingNew(false);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Reset confirmation modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 border border-slate-200">
            <div className="flex items-center gap-2.5 text-amber-800 mb-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <RotateCcw className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Restaurar Plano de Contas Padrão?
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Esta ação irá restaurar todos os <strong>16 Grupos Operacionais Padronizados</strong> (Salários e Equipe, Imóveis e Ocupação, Insumos Odontológicos, Laboratório de Prótese, Impostos e Obrigações Fiscais, Investimentos em Ativo Imobilizado, etc.) com suas respectivas categorias e atributos tributários predefinidos.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleResetToStandard}
                className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-all cursor-pointer"
              >
                Confirmar e Restaurar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
