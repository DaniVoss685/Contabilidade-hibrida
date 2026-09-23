import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Clock,
  DollarSign,
  Package,
  PackageOpen,
  Layers,
  Sparkles,
  Calculator,
  FlaskConical,
  PlusCircle,
  Tag,
  Loader2,
} from 'lucide-react';
import { DentalProcedure, ProcedureInputItem, ClinicalInput, InputUsageUnit } from '../../types';
import { formatCurrency } from '../../lib/masks';
import { safeMargin, formatPercent as safeFormatPercent } from '../../lib/mathUtils';
import { db } from '../../lib/db';
import { ClinicalInputModal } from './ClinicalInputModal';
import { CurrencyInput, CustomSelect, useToast, Slider, SuccessDialog } from '../UI';

interface ProcedureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (procData: Omit<DentalProcedure, 'id'>) => void;
  initialProcedure?: DentalProcedure | null;
}

const CATEGORIES: DentalProcedure['category'][] = [
  'PREVENTIVA',
  'DENTISTICA',
  'ENDODONTIA',
  'PERIODONTIA',
  'CIRURGIA',
  'PROTESE',
  'IMPLANTODONTIA',
  'ORTODONTIA',
  'ESTETICA',
  'OUTROS',
];

const CATEGORY_LABELS: Record<DentalProcedure['category'], string> = {
  PREVENTIVA: 'Preventiva / Profilaxia',
  DENTISTICA: 'Dentística Restauradora',
  ENDODONTIA: 'Endodontia (Canal)',
  PERIODONTIA: 'Periodontia',
  CIRURGIA: 'Cirurgia Oral / Exodontia',
  PROTESE: 'Prótese Dentária',
  IMPLANTODONTIA: 'Implantodontia',
  ORTODONTIA: 'Ortodontia',
  ESTETICA: 'Estética / Harmonização',
  OUTROS: 'Outros Procedimentos',
};

const USAGE_UNITS: { id: InputUsageUnit; label: string }[] = [
  { id: 'tubete', label: 'Tubete' },
  { id: 'ml', label: 'ml' },
  { id: 'g', label: 'g (grama)' },
  { id: 'un', label: 'Unidade' },
  { id: 'dose', label: 'Dose' },
  { id: 'kit', label: 'Kit' },
];

export const ProcedureModal: React.FC<ProcedureModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialProcedure,
}) => {
  const toast = useToast();

  // Catalog inputs from database (reactive)
  const [catalogVersion, setCatalogVersion] = useState(0);
  const catalogInputs = useMemo(() => db.getClinicalInputs(), [catalogVersion, isOpen]);

  // Basic Info
  const [name, setName] = useState(initialProcedure?.name || '');
  const [code, setCode] = useState(
    initialProcedure?.code || `PROC-${Math.floor(100 + Math.random() * 900)}`
  );
  const [category, setCategory] = useState<DentalProcedure['category']>(
    initialProcedure?.category || 'DENTISTICA'
  );
  const [description, setDescription] = useState(initialProcedure?.description || '');
  const [active, setActive] = useState(initialProcedure?.active ?? true);

  // Time & Hourly Rate
  const [clinicalDurationMinutes, setClinicalDurationMinutes] = useState<number>(
    initialProcedure?.clinicalDurationMinutes || 45
  );
  const [professionalHourlyRate, setProfessionalHourlyRate] = useState<number>(
    initialProcedure?.professionalHourlyRate || 220
  );

  // Inputs list - clean start for new procedures, no fake inputs
  const [inputs, setInputs] = useState<ProcedureInputItem[]>(
    initialProcedure?.inputs || []
  );

  // Quick picker from catalog
  const [selectedCatalogInputId, setSelectedCatalogInputId] = useState<string>('');
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);

  // External Lab / Other Direct Costs
  const [labCost, setLabCost] = useState<number>(initialProcedure?.labCost || 0);
  const [otherDirectCosts, setOtherDirectCosts] = useState<number>(
    initialProcedure?.otherDirectCosts || 0
  );

  // Margins and Prices
  const [suggestedMarginPercent, setSuggestedMarginPercent] = useState<number>(
    initialProcedure?.suggestedMarginPercent || 65
  );
  const [defaultPrice, setDefaultPrice] = useState<number>(
    initialProcedure?.defaultPrice || 0
  );

  // --- Real-time Cost & Pricing Engine ---
  const costProfessionalTime = useMemo(() => {
    return (clinicalDurationMinutes / 60) * professionalHourlyRate;
  }, [clinicalDurationMinutes, professionalHourlyRate]);

  const costInputsTotal = useMemo(() => {
    return inputs.reduce((sum, item) => sum + (item.totalCost || 0), 0);
  }, [inputs]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedProcedureName, setSavedProcedureName] = useState('');

  const totalDirectCost = useMemo(() => {
    return costProfessionalTime + costInputsTotal + labCost + otherDirectCosts;
  }, [costProfessionalTime, costInputsTotal, labCost, otherDirectCosts]);

  const calculatedSuggestedPrice = useMemo(() => {
    const margin = Math.min(Math.max(suggestedMarginPercent, 0), 95);
    const divisor = 1 - margin / 100;
    if (divisor <= 0) return totalDirectCost * 2;
    return totalDirectCost / divisor;
  }, [totalDirectCost, suggestedMarginPercent]);

  const marginResult = useMemo(() => {
    return safeMargin(defaultPrice, totalDirectCost);
  }, [defaultPrice, totalDirectCost]);

  // Handlers for Inputs Management
  const handleAddFromCatalog = (catalogItem: ClinicalInput) => {
    const newItem: ProcedureInputItem = {
      id: `proc_inp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      inputId: catalogItem.id,
      name: catalogItem.name,
      quantity: 1,
      unit: catalogItem.usageUnit,
      unitCost: catalogItem.unitCost,
      totalCost: catalogItem.unitCost,
    };
    setInputs((prev) => [...prev, newItem]);
    setSelectedCatalogInputId('');
  };

  const handleAddCustomInput = () => {
    const newItem: ProcedureInputItem = {
      id: `custom_${Date.now()}`,
      name: '',
      quantity: 1,
      unit: 'un',
      unitCost: 0,
      totalCost: 0,
    };
    setInputs((prev) => [...prev, newItem]);
  };

  const handleUpdateInput = (
    id: string,
    field: keyof ProcedureInputItem,
    val: any
  ) => {
    setInputs((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: val };
        if (field === 'quantity' || field === 'unitCost') {
          updated.totalCost = Number(((updated.quantity || 0) * (updated.unitCost || 0)).toFixed(2));
        }
        return updated;
      })
    );
  };

  const handleRemoveInput = (id: string) => {
    setInputs((prev) => prev.filter((i) => i.id !== id));
  };

  const handleApplySuggestedPrice = () => {
    setDefaultPrice(Math.round(calculatedSuggestedPrice));
  };

  const handleCreateNewInputInCatalog = (inputData: Omit<ClinicalInput, 'id' | 'createdAt'>) => {
    const created = db.addClinicalInput(inputData);
    setCatalogVersion((v) => v + 1);
    setIsCatalogModalOpen(false);
    handleAddFromCatalog(created);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!name.trim()) {
      toast.warning('Por favor informe o nome do procedimento.');
      return;
    }
    if (defaultPrice <= 0) {
      toast.warning('O preço padrão do procedimento deve ser maior que zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      onSave({
        name: name.trim(),
        code: code.trim(),
        category,
        description: description.trim(),
        active,
        clinicalDurationMinutes,
        professionalHourlyRate,
        costProfessionalTime,
        inputs,
        costInputsTotal,
        labCost,
        otherDirectCosts,
        totalDirectCost,
        suggestedMarginPercent,
        defaultPrice,
        isIncomplete: false,
      });
      setSavedProcedureName(name.trim());
      setShowSuccess(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryOptions = CATEGORIES.map((cat) => ({
    value: cat,
    label: CATEGORY_LABELS[cat],
  }));

  const catalogSelectOptions = [
    { value: '', label: '-- Selecione um insumo do catálogo para puxar custo --' },
    ...catalogInputs.map((inp) => ({
      value: inp.id,
      label: `${inp.name} (${inp.category})`,
      description: `R$ ${inp.unitCost.toFixed(inp.unitCost < 0.1 ? 3 : 2)} por ${inp.usageUnit}`,
    })),
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                {initialProcedure ? 'Editar Procedimento Odontológico' : 'Novo Procedimento Odontológico'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Custos diretos, tempo clínico, insumos e formação inteligente de preço de venda (Markup)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Section 1: Dados Gerais */}
          <div className="space-y-4">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              1. Identificação do Procedimento
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nome do Tratamento / Procedimento <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder=""
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Código Interno
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder=""
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <CustomSelect
                  label="Especialidade Odontológica"
                  required
                  options={categoryOptions}
                  value={category}
                  onChange={(v) => setCategory(v as DentalProcedure['category'])}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Descrição / Detalhes Clínicos
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder=""
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Tempo Clínico de Cadeira e Valor da Hora do Dentista */}
          <div className="p-4.5 rounded-2xl border border-indigo-100 bg-indigo-50/40 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-600" />
                2. Tempo de Cadeira & Custo da Hora Profissional
              </span>
              <span className="text-indigo-900 font-black text-sm font-mono tabular-nums">
                Custo de Cadeira: {formatCurrency(costProfessionalTime)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Slider
                  label="Duração Clínica Média"
                  min={15}
                  max={240}
                  step={15}
                  value={clinicalDurationMinutes}
                  onChange={setClinicalDurationMinutes}
                  valueFormatter={(val) => {
                    if (val < 60) return `${val} min`;
                    const h = Math.floor(val / 60);
                    const m = val % 60;
                    return m === 0 ? `${h}h` : `${h}h ${m}min`;
                  }}
                  marks={[
                    { value: 15, label: '15m' },
                    { value: 45, label: '45m' },
                    { value: 90, label: '1h 30' },
                    { value: 150, label: '2h 30' },
                    { value: 240, label: '4h' },
                  ]}
                  color="indigo"
                />
              </div>

              <div>
                <CurrencyInput
                  label="Valor da Hora Clínica do Dentista"
                  required
                  value={professionalHourlyRate}
                  onChange={setProfessionalHourlyRate}
                  placeholder="R$ 220,00"
                />
                <p className="text-[10px] text-indigo-600 mt-1">
                  Base recomendada: R$ 180 a R$ 350/h (cobre pró-labore e custos fixos da clínica).
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Insumos e Materiais Consumidos */}
          <div className="p-4.5 rounded-2xl border border-teal-100 bg-teal-50/40 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-teal-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-teal-600" />
                  3. Insumos e Materiais Clínicos
                </span>
                <p className="text-xs text-teal-800 mt-0.5 font-medium">
                  Total de Insumos: <strong className="font-mono text-teal-950">{formatCurrency(costInputsTotal)}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCatalogModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl border border-teal-200 bg-white hover:bg-teal-50 text-teal-800 font-bold text-xs shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                  title="Cadastrar novo insumo no catálogo"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-teal-600" />
                  + Novo Insumo
                </button>

                <button
                  type="button"
                  onClick={handleAddCustomInput}
                  className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Item Avulso
                </button>
              </div>
            </div>

            {/* Insumo Selector with Search */}
            <div>
              <CustomSelect
                label="Puxar Insumo Cadastrado do Catálogo"
                options={catalogSelectOptions}
                value={selectedCatalogInputId}
                onChange={(id) => {
                  setSelectedCatalogInputId(id);
                  if (id) {
                    const item = catalogInputs.find((i) => i.id === id);
                    if (item) handleAddFromCatalog(item);
                  }
                }}
                placeholder="Pesquise insumo para adicionar custo e unidade..."
                searchable={true}
              />
            </div>

            {/* Inputs Table or Empty State */}
            {inputs.length === 0 ? (
              <div className="bg-slate-50/80 rounded-2xl border-2 border-dashed border-teal-200/90 p-6 text-center shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200/80 text-teal-600 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                  <PackageOpen className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Nenhum insumo adicionado
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4 leading-relaxed">
                  Adicione materiais utilizados neste procedimento para calcular o custo direto.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const sel = document.querySelector('[placeholder*="Pesquise insumo"]') as HTMLElement;
                      sel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      sel?.focus();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                    Selecionar do Catálogo
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCatalogModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    + Novo Insumo
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomInput}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-teal-50 border border-teal-200 text-teal-800 font-bold text-xs shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 text-teal-600" />
                    + Item Avulso
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-teal-200/80 overflow-hidden shadow-2xs">
                <table className="w-full text-xs">
                  <thead className="bg-teal-50/80 text-teal-950 font-bold text-[10px] uppercase tracking-wider border-b border-teal-100">
                    <tr>
                      <th className="py-2.5 px-3 text-left">Insumo / Material</th>
                      <th className="py-2.5 px-2 text-center w-24">Qtd.</th>
                      <th className="py-2.5 px-2 text-center w-28">Unidade</th>
                      <th className="py-2.5 px-2 text-right w-28">Custo Unit.</th>
                      <th className="py-2.5 px-3 text-right w-28">Total</th>
                      <th className="py-2.5 px-2 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {inputs.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => handleUpdateInput(item.id, 'name', e.target.value)}
                              placeholder="Nome do insumo..."
                              className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1 bg-white font-medium focus:outline-none focus:border-teal-500"
                            />
                            {item.inputId && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-100 text-teal-800 shrink-0">
                                Catálogo
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={item.quantity}
                            onChange={(e) =>
                              handleUpdateInput(item.id, 'quantity', parseFloat(e.target.value) || 0)
                            }
                            className="w-full text-xs text-center rounded-lg border border-slate-200 px-1 py-1 font-bold font-mono bg-white focus:outline-none focus:border-teal-500"
                          />
                        </td>

                        <td className="py-2 px-2 min-w-[100px]">
                          <CustomSelect
                            value={item.unit}
                            onChange={(val) => handleUpdateInput(item.id, 'unit', val)}
                            options={USAGE_UNITS.map((u) => ({
                              value: u.id,
                              label: u.label,
                            }))}
                          />
                        </td>

                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={item.unitCost}
                            onChange={(e) =>
                              handleUpdateInput(item.id, 'unitCost', parseFloat(e.target.value) || 0)
                            }
                            className="w-full text-xs text-right rounded-lg border border-slate-200 px-2 py-1 bg-white font-mono focus:outline-none focus:border-teal-500"
                          />
                        </td>

                        <td className="py-2 px-3 text-right font-bold text-slate-800 font-mono tabular-nums">
                          {formatCurrency(item.totalCost)}
                        </td>

                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveInput(item.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                            title="Remover insumo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 4: Custos Laboratoriais / Terceiros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-4.5 rounded-2xl border border-slate-200 bg-slate-50/50">
            <div>
              <CurrencyInput
                label="Custo de Laboratório de Prótese / Terceiros"
                value={labCost}
                onChange={setLabCost}
                placeholder="R$ 0,00"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Para coroas, facetas, blocos, alinhadores, próteses móveis, etc.
              </p>
            </div>

            <div>
              <CurrencyInput
                label="Outros Custos Diretos / Esterilização / Exames"
                value={otherDirectCosts}
                onChange={setOtherDirectCosts}
                placeholder="R$ 0,00"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Custos específicos adicionais não incluídos na lista de insumos.
              </p>
            </div>
          </div>

          {/* Section 5: Precificação e Formação de Margem de Lucro */}
          <div className="p-5 rounded-2xl border-2 border-teal-500/80 bg-teal-50/30 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-teal-950 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-teal-600" />
                4. Formação do Preço de Venda (Markup & Lucro Real)
              </span>
              <span className="text-xs font-bold text-slate-700">
                Custo Direto Total: <strong className="text-slate-900 font-mono">{formatCurrency(totalDirectCost)}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Margem de Lucro Desejada (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="10"
                    max="90"
                    step="5"
                    value={suggestedMarginPercent}
                    onChange={(e) => setSuggestedMarginPercent(parseFloat(e.target.value) || 0)}
                    className="w-full pl-3 pr-8 py-2.5 text-xs font-bold text-slate-900 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-teal-500 font-mono"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    %
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Recomendado para odontologia: 60% a 75%.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-teal-900 mb-1.5">
                  Preço Sugerido (Fórmula)
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 py-2.5 px-3 rounded-xl bg-teal-100 border border-teal-200 font-black text-teal-950 text-xs font-mono">
                    {formatCurrency(calculatedSuggestedPrice)}
                  </div>
                  <button
                    type="button"
                    onClick={handleApplySuggestedPrice}
                    className="px-3 py-2.5 text-xs font-bold bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-xl transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                    title="Adotar o preço sugerido como preço de tabela"
                  >
                    Adotar
                  </button>
                </div>
                <p className="text-[10px] text-teal-800 mt-1">
                  Cobre custo de cadeira + insumos + margem.
                </p>
              </div>

              <div>
                <CurrencyInput
                  label="Preço Praticado de Tabela *"
                  required
                  value={defaultPrice}
                  onChange={setDefaultPrice}
                />
                {marginResult.status === 'NO_PRICE' && (
                  <p className="text-[10px] font-medium text-slate-500 mt-1">
                    Informe o preço para calcular a margem.
                  </p>
                )}
                {marginResult.status === 'WAITING_COSTS' && (
                  <p className="text-[10px] font-semibold text-amber-700 mt-1">
                    Aguardando composição de custos diretos.
                  </p>
                )}
                {marginResult.status === 'OK' && (
                  <p className={`text-[10px] font-bold mt-1 ${marginResult.marginPercent !== null && marginResult.marginPercent >= 40 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    Margem real: {safeFormatPercent(marginResult.marginPercent)} (Lucro: {formatCurrency(marginResult.profit)})
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>{initialProcedure ? 'Salvar Alterações' : 'Salvar e Cadastrar Procedimento'}</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Submodal to register new supply into catalog */}
      <ClinicalInputModal
        isOpen={isCatalogModalOpen}
        onClose={() => setIsCatalogModalOpen(false)}
        onSave={handleCreateNewInputInCatalog}
      />

      {/* Success Dialog */}
      <SuccessDialog
        isOpen={showSuccess}
        title={initialProcedure ? 'Procedimento Atualizado!' : 'Procedimento Cadastrado!'}
        message={`O procedimento "${savedProcedureName}" foi registrado com sucesso com preço de tabela ${formatCurrency(defaultPrice)} e custo direto apurado de ${formatCurrency(totalDirectCost)}.`}
        primaryActionLabel="Concluir"
        onClose={() => {
          setShowSuccess(false);
          onClose();
        }}
      />
    </div>
  );
};
