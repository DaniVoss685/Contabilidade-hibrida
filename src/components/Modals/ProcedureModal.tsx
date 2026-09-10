import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Clock,
  DollarSign,
  Package,
  Layers,
  Sparkles,
  Calculator,
  HelpCircle,
  FlaskConical,
  PlusCircle,
  Tag,
} from 'lucide-react';
import { DentalProcedure, ProcedureInputItem, ClinicalInput, InputUsageUnit } from '../../types';
import { formatCurrency } from '../../lib/masks';
import { db } from '../../lib/db';
import { ClinicalInputModal } from './ClinicalInputModal';

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
  if (!isOpen) return null;

  // Catalog inputs from database
  const catalogInputs = db.getClinicalInputs();

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

  // Inputs list
  const [inputs, setInputs] = useState<ProcedureInputItem[]>(
    initialProcedure?.inputs || [
      {
        id: 'inp_1',
        name: 'Kit Biossegurança Descartável',
        quantity: 1,
        unit: 'kit',
        unitCost: 15,
        totalCost: 15,
      },
    ]
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
    initialProcedure?.defaultPrice || 350
  );

  // Dynamic Calculations
  const costProfessionalTime = useMemo(() => {
    return Number(((clinicalDurationMinutes / 60) * professionalHourlyRate).toFixed(2));
  }, [clinicalDurationMinutes, professionalHourlyRate]);

  const costInputsTotal = useMemo(() => {
    return Number(inputs.reduce((sum, item) => sum + (item.totalCost || 0), 0).toFixed(2));
  }, [inputs]);

  const totalDirectCost = useMemo(() => {
    return Number(
      (
        costProfessionalTime +
        costInputsTotal +
        (Number(labCost) || 0) +
        (Number(otherDirectCosts) || 0)
      ).toFixed(2)
    );
  }, [costProfessionalTime, costInputsTotal, labCost, otherDirectCosts]);

  // Suggested Price = TotalDirectCost / (1 - (margin / 100))
  const calculatedSuggestedPrice = useMemo(() => {
    const marginRatio = suggestedMarginPercent / 100;
    if (marginRatio >= 0.95) return totalDirectCost * 2;
    const price = totalDirectCost / (1 - marginRatio);
    return Math.round(price);
  }, [totalDirectCost, suggestedMarginPercent]);

  // Realized Gross Margin on current default price
  const realizedGrossMarginPercent = useMemo(() => {
    if (defaultPrice <= 0) return 0;
    const margin = ((defaultPrice - totalDirectCost) / defaultPrice) * 100;
    return Number(margin.toFixed(1));
  }, [defaultPrice, totalDirectCost]);

  // Input list handlers
  const handleAddCustomInput = () => {
    const newItem: ProcedureInputItem = {
      id: `inp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: '',
      quantity: 1,
      unit: 'un',
      unitCost: 0,
      totalCost: 0,
    };
    setInputs([...inputs, newItem]);
  };

  const handleAddFromCatalog = (catalogItem: ClinicalInput) => {
    const newItem: ProcedureInputItem = {
      id: `inp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      inputId: catalogItem.id,
      name: catalogItem.name,
      quantity: 1,
      unit: catalogItem.usageUnit,
      unitCost: catalogItem.unitCost,
      totalCost: Number(catalogItem.unitCost.toFixed(2)),
    };
    setInputs([...inputs, newItem]);
    setSelectedCatalogInputId('');
  };

  const handleUpdateInput = (
    id: string,
    field: keyof ProcedureInputItem,
    val: string | number
  ) => {
    setInputs(
      inputs.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: val };
        if (field === 'quantity' || field === 'unitCost') {
          const qty = field === 'quantity' ? Number(val) : item.quantity;
          const cost = field === 'unitCost' ? Number(val) : item.unitCost;
          updated.totalCost = Number((qty * cost).toFixed(2));
        }
        return updated;
      })
    );
  };

  const handleRemoveInput = (id: string) => {
    setInputs(inputs.filter((i) => i.id !== id));
  };

  const handleApplySuggestedPrice = () => {
    setDefaultPrice(calculatedSuggestedPrice);
  };

  const handleCreateNewInputInCatalog = (data: Omit<ClinicalInput, 'id' | 'createdAt'>) => {
    const created = db.addClinicalInput(data);
    // Automatically attach newly created input to the current procedure
    handleAddFromCatalog(created);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Por favor, informe o nome do procedimento.');
      return;
    }

    if (defaultPrice <= 0) {
      alert('O preço de tabela deve ser maior que zero.');
      return;
    }

    onSave({
      name: name.trim(),
      code: code.trim(),
      category,
      description: description.trim() || undefined,
      clinicalDurationMinutes,
      professionalHourlyRate,
      costProfessionalTime,
      inputs,
      costInputsTotal,
      labCost: Number(labCost) || 0,
      otherDirectCosts: Number(otherDirectCosts) || 0,
      totalDirectCost,
      suggestedMarginPercent,
      suggestedPrice: calculatedSuggestedPrice,
      defaultPrice,
      active,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-teal-500/20 text-teal-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                {initialProcedure ? 'Editar Procedimento & Precificação' : 'Novo Procedimento Odontológico'}
              </h2>
              <p className="text-xs text-slate-400">
                Formação do preço de venda com base no tempo clínico, insumos cadastrados e margem real
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Section 1: Dados Gerais do Procedimento */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-teal-600" />
                1. Identificação do Procedimento
              </h3>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
                Procedimento Ativo no Catálogo
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Procedimento *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Restauração Resina 2 Faces, Exodontia Simples..."
                  className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Código Interno
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Ex: REST-01"
                  className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Especialidade Odontológica *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DentalProcedure['category'])}
                  className="w-full text-xs font-semibold rounded-lg border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none cursor-pointer"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descrição / Detalhes Clínicos
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Inclui anestesia e acabamento/polimento"
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Tempo Clínico de Cadeira e Valor da Hora do Dentista */}
          <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-3">
            <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-600" />
                2. Tempo de Cadeira & Custo da Hora Profissional
              </span>
              <span className="text-indigo-800 font-extrabold text-sm">
                Custo de Cadeira: {formatCurrency(costProfessionalTime)}
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Duração Clínica Média (minutos)
                  </label>
                  <span className="text-xs font-bold text-indigo-700">
                    {clinicalDurationMinutes} min
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="15"
                    max="240"
                    step="5"
                    value={clinicalDurationMinutes}
                    onChange={(e) => setClinicalDurationMinutes(parseInt(e.target.value) || 15)}
                    className="w-full accent-indigo-600"
                  />
                  <span className="text-xs font-semibold text-slate-500 min-w-[50px]">
                    {clinicalDurationMinutes >= 60
                      ? `${(clinicalDurationMinutes / 60).toFixed(1)}h`
                      : `${clinicalDurationMinutes} min`}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Valor da Hora Clínica do Dentista (R$/hora)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    R$
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={professionalHourlyRate}
                    onChange={(e) => setProfessionalHourlyRate(parseFloat(e.target.value) || 0)}
                    className="w-full pl-9 pr-3 py-2 text-sm font-bold text-slate-900 rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <p className="text-[10px] text-indigo-700 mt-1">
                  Base recomendada: R$ 180 a R$ 350/h (cobre pró-labore e custos fixos da clínica).
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Insumos e Materiais Consumidos (com puxador do catálogo de insumos) */}
          <div className="p-4 rounded-xl border border-teal-100 bg-teal-50/40 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-teal-600" />
                  3. Insumos e Materiais Clínicos
                </h3>
                <p className="text-[11px] text-teal-800">
                  Total de Insumos: <span className="font-bold">{formatCurrency(costInputsTotal)}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCatalogModalOpen(true)}
                  className="px-2.5 py-1.5 rounded-lg border border-teal-300 bg-white hover:bg-teal-50 text-teal-800 font-bold text-xs shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                  title="Cadastrar novo insumo no catálogo com conversão de unidade"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-teal-600" />
                  + Novo Insumo
                </button>

                <button
                  type="button"
                  onClick={handleAddCustomInput}
                  className="px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Item Avulso
                </button>
              </div>
            </div>

            {/* Insumos Selector from Catalog */}
            <div className="p-3 bg-white rounded-xl border border-teal-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1">
                <label className="block text-[11px] font-bold text-teal-950 mb-1 flex items-center gap-1">
                  <FlaskConical className="w-3.5 h-3.5 text-teal-600" />
                  Puxar Insumo Cadastrado do Catálogo:
                </label>
                <select
                  value={selectedCatalogInputId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedCatalogInputId(id);
                    if (id) {
                      const item = catalogInputs.find((i) => i.id === id);
                      if (item) handleAddFromCatalog(item);
                    }
                  }}
                  className="w-full text-xs font-semibold rounded-lg border border-teal-300 p-2 bg-teal-50/30 focus:ring-2 focus:ring-teal-500 focus:outline-none cursor-pointer"
                >
                  <option value="">-- Selecione um insumo cadastrado para puxar custo e unidade --</option>
                  {catalogInputs.map((inp) => (
                    <option key={inp.id} value={inp.id}>
                      {inp.name} ({inp.category}) - R$ {inp.unitCost.toFixed(inp.unitCost < 0.1 ? 3 : 2)} / {inp.usageUnit}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Template Chips */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Insumos Mais Utilizados (clique para incluir no procedimento):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {catalogInputs.slice(0, 6).map((inp) => (
                  <button
                    key={inp.id}
                    type="button"
                    onClick={() => handleAddFromCatalog(inp)}
                    className="px-2 py-1 rounded-md text-[11px] font-medium bg-white text-teal-900 border border-teal-200 hover:bg-teal-100/70 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>+ {inp.name}</span>
                    <span className="font-bold text-teal-700">
                      (R$ {inp.unitCost.toFixed(inp.unitCost < 0.1 ? 3 : 2)}/{inp.usageUnit})
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs Table */}
            <div className="bg-white rounded-lg border border-teal-200/80 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-teal-100/50 text-teal-900 font-bold text-[10px] uppercase">
                  <tr>
                    <th className="py-2 px-3 text-left">Insumo / Material</th>
                    <th className="py-2 px-2 text-center w-24">Qtd. Utilizada</th>
                    <th className="py-2 px-2 text-center w-28">Unidade</th>
                    <th className="py-2 px-2 text-right w-28">Custo Unit.</th>
                    <th className="py-2 px-3 text-right w-28">Total</th>
                    <th className="py-2 px-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inputs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400 text-xs">
                        Nenhum insumo adicionado a este procedimento. Selecione no catálogo acima ou crie um avulso.
                      </td>
                    </tr>
                  ) : (
                    inputs.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="py-1.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => handleUpdateInput(item.id, 'name', e.target.value)}
                              placeholder="Nome do insumo..."
                              className="w-full text-xs rounded border border-slate-200 p-1.5 bg-white font-medium"
                            />
                            {item.inputId && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-100 text-teal-800 shrink-0">
                                Catálogo
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Qtd Utilizada */}
                        <td className="py-1.5 px-2">
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={item.quantity}
                            onChange={(e) =>
                              handleUpdateInput(item.id, 'quantity', parseFloat(e.target.value) || 0)
                            }
                            className="w-full text-xs text-center rounded border border-slate-200 p-1.5 font-bold bg-white"
                          />
                        </td>

                        {/* Unidade: kit, ml, g, un, dose, tubete */}
                        <td className="py-1.5 px-2">
                          <select
                            value={item.unit}
                            onChange={(e) => handleUpdateInput(item.id, 'unit', e.target.value)}
                            className="w-full text-xs font-semibold text-center rounded border border-slate-200 p-1.5 bg-white cursor-pointer"
                          >
                            {USAGE_UNITS.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.label}
                              </option>
                            ))}
                            {/* Option for custom if not in standard list */}
                            {!USAGE_UNITS.some((u) => u.id === item.unit) && (
                              <option value={item.unit}>{item.unit}</option>
                            )}
                          </select>
                        </td>

                        {/* Custo Unitário */}
                        <td className="py-1.5 px-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={item.unitCost}
                            onChange={(e) =>
                              handleUpdateInput(item.id, 'unitCost', parseFloat(e.target.value) || 0)
                            }
                            className="w-full text-xs text-right rounded border border-slate-200 p-1.5 bg-white font-mono"
                          />
                        </td>

                        {/* Total */}
                        <td className="py-1.5 px-3 text-right font-bold text-slate-800 font-mono">
                          {formatCurrency(item.totalCost)}
                        </td>

                        {/* Delete */}
                        <td className="py-1.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveInput(item.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors cursor-pointer"
                            title="Remover insumo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Custos Laboratoriais / Terceiros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Custo de Laboratório de Prótese / Terceiros (R$)
              </label>
              <input
                type="number"
                min="0"
                step="10"
                value={labCost}
                onChange={(e) => setLabCost(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Para coroas, facetas, blocos, alinhadores, próteses móveis, etc.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Outros Custos Diretos / Esterilização / Exames (R$)
              </label>
              <input
                type="number"
                min="0"
                step="5"
                value={otherDirectCosts}
                onChange={(e) => setOtherDirectCosts(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Custos específicos adicionais não incluídos na lista de insumos.
              </p>
            </div>
          </div>

          {/* Section 5: Precificação e Formação de Margem de Lucro */}
          <div className="p-5 rounded-xl border-2 border-teal-500 bg-teal-50/40 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-teal-950 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-teal-600" />
                4. Formação do Preço de Venda (Markup & Lucro Real)
              </h3>
              <span className="text-xs font-bold text-slate-700">
                Custo Direto Total: <span className="text-slate-900 font-mono">{formatCurrency(totalDirectCost)}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
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
                    className="w-full pl-3 pr-8 py-2 text-sm font-bold text-slate-900 rounded-lg border border-slate-300 bg-white"
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
                <label className="block text-xs font-bold text-teal-900 mb-1">
                  Preço Sugerido (Fórmula)
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 py-2 px-3 rounded-lg bg-teal-100 border border-teal-300 font-black text-teal-900 text-sm font-mono">
                    {formatCurrency(calculatedSuggestedPrice)}
                  </div>
                  <button
                    type="button"
                    onClick={handleApplySuggestedPrice}
                    className="px-3 py-2 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors cursor-pointer shadow-xs whitespace-nowrap"
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
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  Preço Praticado de Tabela (R$) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    R$
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="10"
                    required
                    value={defaultPrice}
                    onChange={(e) => setDefaultPrice(parseFloat(e.target.value) || 0)}
                    className="w-full pl-9 pr-3 py-2 text-base font-black text-slate-900 rounded-lg border-2 border-teal-600 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                </div>
                <p className="text-[10px] font-bold text-emerald-700 mt-1">
                  Margem real praticada: {realizedGrossMarginPercent}% (Lucro: {formatCurrency(defaultPrice - totalDirectCost)})
                </p>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              {initialProcedure ? 'Salvar Alterações' : 'Salvar e Cadastrar Procedimento'}
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
    </div>
  );
};
