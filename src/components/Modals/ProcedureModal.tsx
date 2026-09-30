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
  Calculator,
  PlusCircle,
  Loader2,
  ChevronDown,
  Lock,
  Info,
} from 'lucide-react';
import { DentalProcedure, ProcedureInputItem, ClinicalInput, InputUsageUnit } from '../../types';
import { formatCurrency } from '../../lib/masks';
import { db } from '../../lib/db';
import { getPricingAccess } from '../../lib/permissions';
import {
  BASE_UNITS,
  baseUnitLabel,
  buildAdHocProcedureItem,
  buildCatalogProcedureItem,
  computePriceMargin,
  computeProcedureCosts,
  computeSuggestedPrice,
  DURATION_SLIDER_MAX,
  DURATION_SLIDER_MIN,
  DURATION_SLIDER_STEP,
  durationToSliderPosition,
  evaluateMargin,
  formatDurationMinutes,
  formatMarginPercent,
  formatQuantity,
  formatUnitCost,
  isCatalogItem,
  joinDuration,
  resolvePricingParams,
  splitDuration,
  updateProcedureItem,
} from '../../lib/procedureCosting';
import { ClinicalInputModal } from './ClinicalInputModal';
import { CurrencyInput, CustomSelect, Slider, useToast, SuccessDialog } from '../UI';

interface ProcedureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (procData: Omit<DentalProcedure, 'id'>, eligibleProfessionalIds?: string[]) => void;
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

const durationFieldClass =
  'w-16 text-center text-sm font-bold rounded-xl border border-slate-200 px-2 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all';

const inputClass =
  'w-full text-xs rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium';

export const ProcedureModal: React.FC<ProcedureModalProps> = ({ isOpen, onClose, onSave, initialProcedure }) => {
  const toast = useToast();

  // Quem pode ver custos / editar preço (RBAC existente). Sem acesso financeiro, nada sensível é renderizado.
  const access = useMemo(() => {
    const u = db.getUser();
    return getPricingAccess(u?.role, u?.permissions, u?.isPrimary);
  }, [isOpen]);
  const { canViewCosts, canEditPrice } = access;

  // Parâmetros da CLÍNICA (Configurações → Precificação). Nunca digitados em cada procedimento.
  const pricing = useMemo(() => resolvePricingParams(db.getPreferences().pricing), [isOpen]);

  // Catálogo de insumos (reativo)
  const [catalogVersion, setCatalogVersion] = useState(0);
  const catalogInputs = useMemo(() => db.getClinicalInputs(), [catalogVersion, isOpen]);

  // Profissionais habilitados a executar (roster clínico). Sem nenhum selecionado = disponível a
  // todos os profissionais ativos (ver resolveEligibleProfessionals, src/lib/professionalScheduling.ts).
  const activeProfessionals = useMemo(() => db.getClinicalProfessionals().filter((p) => p.isActive), [isOpen]);
  const [selectedProfessionalIds, setSelectedProfessionalIds] = useState<string[]>(
    () => db.getProcedureProfessionalLinks()[initialProcedure?.id || ''] || []
  );
  const toggleProfessional = (id: string) => {
    setSelectedProfessionalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Identificação
  const [name, setName] = useState(initialProcedure?.name || '');
  const [code, setCode] = useState(initialProcedure?.code || `PROC-${Math.floor(100 + Math.random() * 900)}`);
  const [category, setCategory] = useState<DentalProcedure['category']>(initialProcedure?.category || 'DENTISTICA');
  const [description, setDescription] = useState(initialProcedure?.description || '');
  const [active] = useState(initialProcedure?.active ?? true);

  // Duração: o campo operacional que fica sempre em evidência
  const [clinicalDurationMinutes, setClinicalDurationMinutes] = useState<number>(initialProcedure?.clinicalDurationMinutes || 45);

  // Custos por hora: procedimento novo herda a clínica; procedimento existente mantém o que foi gravado
  // (o custo histórico não muda sozinho) e pode ser realinhado pelo botão da composição do custo.
  const [hourlyRate, setHourlyRate] = useState<number>(
    initialProcedure ? initialProcedure.professionalHourlyRate || pricing.clinicalHourRate : pricing.clinicalHourRate
  );
  const [structureRate, setStructureRate] = useState<number>(
    initialProcedure ? initialProcedure.structureCostPerHour || 0 : pricing.structureCostPerHour
  );

  // Insumos
  const [inputs, setInputs] = useState<ProcedureInputItem[]>(initialProcedure?.inputs || []);
  const [selectedCatalogInputId, setSelectedCatalogInputId] = useState<string>('');
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);

  // Composição do custo (só editável por quem vê custos)
  const [labCost, setLabCost] = useState<number>(initialProcedure?.labCost || 0);
  const [otherDirectCosts, setOtherDirectCosts] = useState<number>(initialProcedure?.otherDirectCosts || 0);
  const [showComposition, setShowComposition] = useState(false);

  // Preço
  const [defaultPrice, setDefaultPrice] = useState<number>(initialProcedure?.defaultPrice || 0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedProcedureName, setSavedProcedureName] = useState('');

  // Horas + minutos exibidos são derivados do MESMO estado (minutos) que o slider e o cálculo usam.
  const durationParts = splitDuration(clinicalDurationMinutes);

  // --- Custos, preço sugerido e margem (lógica única em lib/procedureCosting) ---
  const costs = useMemo(
    () =>
      computeProcedureCosts({
        durationMinutes: clinicalDurationMinutes,
        clinicalHourRate: hourlyRate,
        structureCostPerHour: structureRate,
        inputs,
        labCost,
        otherDirectCosts,
      }),
    [clinicalDurationMinutes, hourlyRate, structureRate, inputs, labCost, otherDirectCosts]
  );
  const suggestedPrice = useMemo(
    () => computeSuggestedPrice(costs.totalDirectCost, pricing.targetMarginPercent),
    [costs.totalDirectCost, pricing.targetMarginPercent]
  );
  const priceMargin = useMemo(() => computePriceMargin(defaultPrice, costs.totalDirectCost), [defaultPrice, costs.totalDirectCost]);
  const verdict = evaluateMargin(priceMargin.marginPercent, pricing);

  const rateDiffersFromClinic =
    Boolean(initialProcedure) &&
    (Math.abs(hourlyRate - pricing.clinicalHourRate) > 0.004 || Math.abs(structureRate - pricing.structureCostPerHour) > 0.004);

  // --- Insumos ---
  const handleAddFromCatalog = (catalogItem: ClinicalInput) => {
    // A unidade e o custo base vêm do cadastro do insumo; o usuário só informa a QUANTIDADE UTILIZADA.
    setInputs((prev) => [...prev, buildCatalogProcedureItem(catalogItem, 1)]);
    setSelectedCatalogInputId('');
  };
  const handleAddCustomInput = () => setInputs((prev) => [...prev, buildAdHocProcedureItem()]);
  const handleUpdateInput = (id: string, field: 'name' | 'quantity' | 'unit' | 'unitCost', val: string | number) =>
    setInputs((prev) => prev.map((item) => (item.id === id ? updateProcedureItem(item, field, val) : item)));
  const handleRemoveInput = (id: string) => setInputs((prev) => prev.filter((i) => i.id !== id));

  const handleCreateNewInputInCatalog = (inputData: Omit<ClinicalInput, 'id' | 'createdAt'>) => {
    const created = db.addClinicalInput(inputData);
    setCatalogVersion((v) => v + 1);
    setIsCatalogModalOpen(false);
    handleAddFromCatalog(created);
  };

  const handleUseSuggestedPrice = () => setDefaultPrice(suggestedPrice);

  const handleAlignWithClinic = () => {
    setHourlyRate(pricing.clinicalHourRate);
    setStructureRate(pricing.structureCostPerHour);
    toast.info('Custos por hora atualizados para os parâmetros atuais da clínica.');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!name.trim()) {
      toast.warning('Por favor informe o nome do procedimento.');
      return;
    }
    if (!clinicalDurationMinutes || clinicalDurationMinutes <= 0) {
      toast.warning('Informe a duração do procedimento em minutos.');
      return;
    }
    if (canEditPrice && defaultPrice <= 0) {
      toast.warning('Informe o preço praticado do procedimento (maior que zero).');
      return;
    }

    // Quem não edita preço/custos pode cadastrar o procedimento; o que faltar fica sinalizado para a gestão completar.
    const adHocWithoutCost = inputs.some((i) => !isCatalogItem(i) && (!i.unitCost || i.unitCost <= 0));
    const isIncomplete = defaultPrice <= 0 || adHocWithoutCost;

    setIsSubmitting(true);
    try {
      onSave({
        name: name.trim(),
        code: code.trim(),
        category,
        description: description.trim(),
        active,
        clinicalDurationMinutes,
        professionalHourlyRate: hourlyRate,
        professionalCost: costs.professionalCost,
        costProfessionalTime: costs.professionalCost,
        structureCostPerHour: structureRate,
        inputs,
        inputsCost: costs.inputsCost,
        costInputsTotal: costs.inputsCost,
        labCost: costs.labCost,
        otherCosts: costs.structureCost, // custo de estrutura/cadeira (indireto)
        otherDirectCosts: costs.otherDirectCosts,
        totalCost: costs.totalDirectCost,
        totalDirectCost: costs.totalDirectCost,
        targetMarginPercent: pricing.targetMarginPercent,
        suggestedMarginPercent: pricing.targetMarginPercent,
        suggestedPrice,
        defaultPrice,
        isIncomplete,
      }, activeProfessionals.length > 0 ? selectedProfessionalIds : undefined);
      setSavedProcedureName(name.trim());
      setShowSuccess(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryOptions = CATEGORIES.map((cat) => ({ value: cat, label: CATEGORY_LABELS[cat] }));

  const catalogSelectOptions = [
    { value: '', label: '-- Selecione um insumo do catálogo --' },
    ...catalogInputs.map((inp) => ({
      value: inp.id,
      label: `${inp.name} (${inp.category})`,
      description: canViewCosts ? `${formatUnitCost(inp.unitCost, 'compact')} por ${inp.usageUnit}` : `Unidade: ${inp.usageUnit}`,
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
                {initialProcedure ? 'Editar Procedimento' : 'Novo Procedimento'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Duração, insumos utilizados e preço cobrado do paciente</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* 1. Identificação */}
          <div className="space-y-4">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">1. Identificação</span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nome do procedimento <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  data-testid="proc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Código interno</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={`${inputClass} font-mono`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <CustomSelect
                label="Especialidade"
                required
                options={categoryOptions}
                value={category}
                onChange={(v) => setCategory(v as DentalProcedure['category'])}
              />
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Descrição</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          {/* 2. Duração — o campo operacional que sempre fica evidente. Controle principal: slider (mesmo componente do
              design system usado antes nesta tela); o campo numérico permite qualquer valor e os dois ficam sincronizados. */}
          <div className="p-4.5 rounded-2xl border border-indigo-100 bg-indigo-50/40 space-y-3" data-testid="proc-duration-section">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-600" />
                2. Duração do procedimento
              </span>
              <span className="text-sm font-black text-indigo-900 whitespace-nowrap" data-testid="proc-duration-label" aria-live="polite">
                {formatDurationMinutes(clinicalDurationMinutes)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span id="proc-duration-title" className="text-xs font-semibold text-slate-700">
                Tempo de atendimento
              </span>
              <div className="flex items-center gap-1.5 shrink-0" role="group" aria-labelledby="proc-duration-title">
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={1}
                  inputMode="numeric"
                  aria-label="Horas"
                  data-testid="proc-duration-hours"
                  value={durationParts.hours}
                  onChange={(e) => setClinicalDurationMinutes(joinDuration(e.target.value, durationParts.minutes))}
                  className={durationFieldClass}
                />
                <span className="text-xs font-semibold text-slate-500">h</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  step={5}
                  inputMode="numeric"
                  aria-label="Minutos"
                  data-testid="proc-duration-minutes"
                  value={durationParts.minutes}
                  onChange={(e) => setClinicalDurationMinutes(joinDuration(durationParts.hours, e.target.value))}
                  className={durationFieldClass}
                />
                <span className="text-xs font-semibold text-slate-500">min</span>
              </div>
            </div>

            <Slider
              min={DURATION_SLIDER_MIN}
              max={DURATION_SLIDER_MAX}
              step={DURATION_SLIDER_STEP}
              value={durationToSliderPosition(clinicalDurationMinutes)}
              onChange={setClinicalDurationMinutes}
              ariaLabel="Duração do procedimento em minutos"
              ariaValueText={formatDurationMinutes(clinicalDurationMinutes)}
              valueFormatter={formatDurationMinutes}
              marks={[
                { value: 15, label: '15m' },
                { value: 60, label: '1h' },
                { value: 120, label: '2h' },
                { value: 240, label: '4h' },
              ]}
              color="indigo"
              comfortable
            />

            {canViewCosts && (
              <p className="text-[11px] text-slate-500" data-testid="proc-duration-cost">
                Tempo clínico: {formatDurationMinutes(clinicalDurationMinutes)} × {formatCurrency(hourlyRate)}/h ={' '}
                <strong className="text-slate-700 font-mono">{formatCurrency(costs.professionalCost)}</strong>
              </p>
            )}
          </div>

          {/* Profissionais habilitados (roster clínico) — nenhum marcado = disponível a todos */}
          {activeProfessionals.length > 0 && (
            <div className="p-4.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2.5" data-testid="proc-eligible-professionals">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Profissionais habilitados a executar
              </span>
              <p className="text-[11px] text-slate-500">
                Nenhuma marcada = disponível a todos os profissionais ativos da clínica.
              </p>
              <div className="flex flex-wrap gap-2">
                {activeProfessionals.map((p) => {
                  const checked = selectedProfessionalIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                        checked
                          ? 'bg-teal-600 border-teal-600 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-teal-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProfessional(p.id)}
                        className="sr-only"
                      />
                      {p.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Insumos utilizados */}
          <div className="p-4.5 rounded-2xl border border-teal-100 bg-teal-50/40 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-teal-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-teal-600" />
                  3. Insumos utilizados
                </span>
                {canViewCosts && (
                  <p className="text-xs text-teal-800 mt-0.5 font-medium">
                    Total de insumos: <strong className="font-mono text-teal-950">{formatCurrency(costs.inputsCost)}</strong>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCatalogModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl border border-teal-200 bg-white hover:bg-teal-50 text-teal-800 font-bold text-xs shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                  title="Cadastrar novo insumo no catálogo"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-teal-600" />
                  Novo insumo
                </button>
                <button
                  type="button"
                  data-testid="proc-add-adhoc"
                  onClick={handleAddCustomInput}
                  className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Item avulso
                </button>
              </div>
            </div>

            <CustomSelect
              label="Adicionar insumo do catálogo"
              options={catalogSelectOptions}
              value={selectedCatalogInputId}
              onChange={(id) => {
                setSelectedCatalogInputId(id);
                if (id) {
                  const item = catalogInputs.find((i) => i.id === id);
                  if (item) handleAddFromCatalog(item);
                }
              }}
              placeholder="Pesquise o insumo para adicionar..."
              searchable={true}
            />

            {inputs.length === 0 ? (
              <div className="bg-slate-50/80 rounded-2xl border-2 border-dashed border-teal-200/90 p-6 text-center shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200/80 text-teal-600 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                  <PackageOpen className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">Nenhum insumo adicionado</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                  Escolha um insumo do catálogo e informe só a quantidade utilizada.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-teal-200/80 overflow-x-auto shadow-2xs">
                <table className="w-full text-xs min-w-[520px]">
                  <thead className="bg-teal-50/80 text-teal-950 font-bold text-[10px] uppercase tracking-wider border-b border-teal-100">
                    <tr>
                      <th className="py-2.5 px-3 text-left">Insumo</th>
                      <th className="py-2.5 px-2 text-center w-40">Quantidade utilizada</th>
                      {canViewCosts && <th className="py-2.5 px-2 text-right w-32">Custo base</th>}
                      {canViewCosts && <th className="py-2.5 px-3 text-right w-28">Custo no procedimento</th>}
                      <th className="py-2.5 px-2 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {inputs.map((item) => {
                      const fromCatalog = isCatalogItem(item);
                      return (
                        <tr key={item.id} data-testid={fromCatalog ? 'proc-item-catalog' : 'proc-item-adhoc'} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-3">
                            {fromCatalog ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-900">{item.name}</span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-100 text-teal-800 shrink-0">CATÁLOGO</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={item.name}
                                  onChange={(e) => handleUpdateInput(item.id, 'name', e.target.value)}
                                  placeholder="Nome do item..."
                                  className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1 bg-white font-medium focus:outline-none focus:border-teal-500"
                                />
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 shrink-0">AVULSO</span>
                              </div>
                            )}
                          </td>

                          <td className="py-2 px-2">
                            <div className="flex items-center justify-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                data-testid="proc-item-qty"
                                value={item.quantity === 0 ? '' : item.quantity}
                                onChange={(e) => handleUpdateInput(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-20 text-xs text-center rounded-lg border border-slate-200 px-1 py-1 font-bold font-mono bg-white focus:outline-none focus:border-teal-500"
                              />
                              {fromCatalog ? (
                                <span className="text-[11px] font-semibold text-slate-500" data-testid="proc-item-unit">
                                  {item.unit}
                                </span>
                              ) : (
                                <div className="w-24">
                                  <CustomSelect
                                    value={item.unit}
                                    onChange={(val) => handleUpdateInput(item.id, 'unit', val)}
                                    options={BASE_UNITS.map((u: { id: InputUsageUnit; label: string }) => ({ value: u.id, label: u.id }))}
                                  />
                                </div>
                              )}
                            </div>
                          </td>

                          {canViewCosts && (
                            <td className="py-2 px-2 text-right">
                              {fromCatalog ? (
                                <span className="font-mono text-slate-600" data-testid="proc-item-base-cost">
                                  {formatUnitCost(item.unitCost)}/{item.unit}
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.0001"
                                  inputMode="decimal"
                                  data-testid="proc-item-adhoc-cost"
                                  value={item.unitCost === 0 ? '' : item.unitCost}
                                  placeholder="0,00"
                                  onChange={(e) => handleUpdateInput(item.id, 'unitCost', parseFloat(e.target.value) || 0)}
                                  className="w-full text-xs text-right rounded-lg border border-slate-200 px-2 py-1 bg-white font-mono focus:outline-none focus:border-teal-500"
                                />
                              )}
                            </td>
                          )}

                          {canViewCosts && (
                            <td className="py-2 px-3 text-right font-bold text-slate-800 font-mono tabular-nums" data-testid="proc-item-total">
                              {formatCurrency(item.totalCost)}
                            </td>
                          )}

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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. Preço do procedimento — a pergunta principal: quanto será cobrado do paciente? */}
          <div className="p-5 rounded-2xl border-2 border-teal-500/80 bg-teal-50/30 space-y-4" data-testid="proc-price-section">
            <span className="text-xs font-black text-teal-950 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-teal-600" />
              4. Preço do procedimento
            </span>

            <div className={`grid grid-cols-1 ${canViewCosts ? 'lg:grid-cols-5' : ''} gap-4 items-start`}>
              <div className={canViewCosts ? 'lg:col-span-2' : ''}>
                <label className="block text-sm font-bold text-teal-950 mb-1.5">Quanto será cobrado do paciente?</label>
                {canEditPrice ? (
                  <CurrencyInput
                    label="Preço praticado"
                    required
                    value={defaultPrice}
                    onChange={setDefaultPrice}
                    className="text-lg font-black"
                    id="proc-price"
                  />
                ) : (
                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase">Preço praticado</div>
                    <div className="text-xl font-black text-slate-900 font-mono">
                      {defaultPrice > 0 ? formatCurrency(defaultPrice) : 'A definir'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> O preço é definido pela gestão da clínica.
                    </div>
                  </div>
                )}
              </div>

              {canViewCosts && (
                <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="proc-price-helpers">
                  <div className="p-3 rounded-xl bg-teal-100/70 border border-teal-200 flex flex-col justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-bold text-teal-800 uppercase tracking-wider">Preço sugerido pela clínica</div>
                      <div className="text-base font-black text-teal-950 font-mono" data-testid="proc-suggested-price">
                        {suggestedPrice > 0 ? formatCurrency(suggestedPrice) : '—'}
                      </div>
                    </div>
                    {canEditPrice && (
                      <button
                        type="button"
                        data-testid="proc-use-suggested"
                        onClick={handleUseSuggestedPrice}
                        disabled={suggestedPrice <= 0}
                        className="px-2.5 py-1.5 text-[11px] font-bold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer shadow-xs"
                      >
                        Usar preço sugerido
                      </button>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Custo estimado</div>
                    <div className="text-base font-black text-slate-900 font-mono" data-testid="proc-total-cost">
                      {formatCurrency(costs.totalDirectCost)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Tempo + insumos + demais custos</div>
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {priceMargin.status === 'OK' ? 'Margem real' : 'Margem-alvo da clínica'}
                    </div>
                    <div className="text-base font-black text-slate-900 font-mono" data-testid="proc-margin">
                      {priceMargin.status === 'OK'
                        ? formatMarginPercent(priceMargin.marginPercent)
                        : `${pricing.targetMarginPercent}%`}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5" data-testid="proc-profit">
                      {priceMargin.status === 'OK'
                        ? `Lucro bruto ${formatCurrency(priceMargin.grossProfit)}`
                        : priceMargin.status === 'WAITING_COSTS'
                        ? 'Aguardando custos'
                        : 'Informe o preço praticado'}
                    </div>
                    {verdict && (
                      <span
                        data-testid="proc-margin-verdict"
                        className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          verdict === 'HEALTHY' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {verdict === 'HEALTHY' ? 'Margem saudável' : `Abaixo da margem-alvo (${pricing.targetMarginPercent}%)`}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 5. Composição do custo — modo avançado, recolhido, só para quem vê custos */}
          {canViewCosts && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50" data-testid="proc-composition">
              <button
                type="button"
                onClick={() => setShowComposition((v) => !v)}
                aria-expanded={showComposition}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-700 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-slate-500" />
                  Ver composição do custo
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showComposition ? 'rotate-180' : ''}`} />
              </button>

              {showComposition && (
                <div className="px-4 pb-4 space-y-3 text-xs">
                  {!pricing.configured && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2">
                      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        A clínica ainda não configurou os parâmetros de precificação: estão valendo os padrões do sistema (hora clínica{' '}
                        {formatCurrency(pricing.clinicalHourRate)}, margem {pricing.targetMarginPercent}%). Configure em{' '}
                        <strong>Configurações → Precificação</strong>.
                      </span>
                    </div>
                  )}

                  {rateDiffersFromClinic && (
                    <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 flex items-center justify-between gap-3">
                      <span>
                        Este procedimento usa {formatCurrency(hourlyRate)}/h de hora clínica
                        {structureRate > 0 ? ` + ${formatCurrency(structureRate)}/h de estrutura` : ''}; os parâmetros atuais da clínica são{' '}
                        {formatCurrency(pricing.clinicalHourRate)}/h
                        {pricing.structureCostPerHour > 0 ? ` + ${formatCurrency(pricing.structureCostPerHour)}/h` : ''}.
                      </span>
                      <button
                        type="button"
                        onClick={handleAlignWithClinic}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold whitespace-nowrap cursor-pointer"
                      >
                        Usar parâmetros da clínica
                      </button>
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-slate-600">
                        Tempo clínico ({formatDurationMinutes(clinicalDurationMinutes)} × {formatCurrency(hourlyRate)}/h)
                        {!rateDiffersFromClinic && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500">PARÂMETRO DA CLÍNICA</span>
                        )}
                      </span>
                      <span className="font-mono font-bold text-slate-800">{formatCurrency(costs.professionalCost)}</span>
                    </div>
                    {structureRate > 0 && (
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-slate-600">Estrutura / cadeira ({formatCurrency(structureRate)}/h)</span>
                        <span className="font-mono font-bold text-slate-800">{formatCurrency(costs.structureCost)}</span>
                      </div>
                    )}
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-slate-600">Insumos</span>
                      <span className="font-mono font-bold text-slate-800">{formatCurrency(costs.inputsCost)}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-3 py-3">
                      <div>
                        <CurrencyInput label="Laboratório de prótese / terceiros" value={labCost} onChange={setLabCost} placeholder="R$ 0,00" />
                        <p className="text-[10px] text-slate-500 mt-1">Coroas, facetas, blocos, alinhadores, próteses móveis.</p>
                      </div>
                      <div>
                        <CurrencyInput label="Outros custos diretos" value={otherDirectCosts} onChange={setOtherDirectCosts} placeholder="R$ 0,00" />
                        <p className="text-[10px] text-slate-500 mt-1">Esterilização, exames e outros custos específicos.</p>
                      </div>
                    </div>
                    <div className="flex justify-between px-3 py-2.5 bg-slate-50 rounded-b-xl">
                      <span className="font-bold text-slate-800">Custo direto total</span>
                      <span className="font-mono font-black text-slate-900">{formatCurrency(costs.totalDirectCost)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

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
              data-testid="proc-save"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>{initialProcedure ? 'Salvar alterações' : 'Cadastrar procedimento'}</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Submodal para cadastrar um novo insumo no catálogo */}
      <ClinicalInputModal
        isOpen={isCatalogModalOpen}
        onClose={() => setIsCatalogModalOpen(false)}
        onSave={handleCreateNewInputInCatalog}
      />

      <SuccessDialog
        isOpen={showSuccess}
        title={initialProcedure ? 'Procedimento atualizado!' : 'Procedimento cadastrado!'}
        message={
          canViewCosts
            ? `O procedimento "${savedProcedureName}" foi registrado com preço ${defaultPrice > 0 ? formatCurrency(defaultPrice) : 'a definir'} e custo estimado de ${formatCurrency(costs.totalDirectCost)}.`
            : `O procedimento "${savedProcedureName}" foi registrado${defaultPrice > 0 ? ` com preço ${formatCurrency(defaultPrice)}` : ' (preço a definir pela gestão)'}.`
        }
        primaryActionLabel="Concluir"
        onClose={() => {
          setShowSuccess(false);
          onClose();
        }}
      />
    </div>
  );
};
