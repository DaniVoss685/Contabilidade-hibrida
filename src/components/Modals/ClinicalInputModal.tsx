import React, { useState, useEffect } from 'react';
import { Package, X, Calculator } from 'lucide-react';
import { ClinicalInput, InputUsageUnit } from '../../types';
import { CustomSelect, CurrencyInput, useToast, SuccessDialog } from '../UI';
import {
  BASE_UNITS,
  DEFAULT_PACKAGE_TYPE,
  PACKAGE_TYPES,
  buildPackageName,
  computeInputUnitCost,
  formatQuantity,
  formatUnitCost,
} from '../../lib/procedureCosting';

interface ClinicalInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<ClinicalInput, 'id' | 'createdAt'>) => void;
  initialData?: ClinicalInput | null;
}

const CATEGORIES = [
  'Anestésicos',
  'Dentística & Resinas',
  'Biossegurança & Descartáveis',
  'Cirurgia & Suturas',
  'Endodontia',
  'Prótese & Moldagem',
  'Periodontia',
  'Ortodontia',
  'Implantodontia',
  'Farmacologia & Antissépticos',
  'Geral / Outros',
];

// O cadastro do insumo representa a EMBALAGEM/COMPRA do fornecedor. Como ele é consumido em cada procedimento
// (quanto entra em cada atendimento) é responsabilidade do procedimento — aqui só se define a unidade base.
export const ClinicalInputModal: React.FC<ClinicalInputModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const toast = useToast();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('Dentística & Resinas');
  const [packageType, setPackageType] = useState<string>(DEFAULT_PACKAGE_TYPE);
  const [packageQuantity, setPackageQuantity] = useState<number>(0);
  const [usageUnit, setUsageUnit] = useState<InputUsageUnit>('un');
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedItemName, setSavedItemName] = useState('');
  const [savedUnitCost, setSavedUnitCost] = useState(0);
  const [savedUnit, setSavedUnit] = useState<string>('un');

  const resetForm = () => {
    setName('');
    setBrand('');
    setCategory('Dentística & Resinas');
    setPackageType(DEFAULT_PACKAGE_TYPE);
    setPackageQuantity(0);
    setUsageUnit('un');
    setPurchasePrice(0);
    setNotes('');
  };

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setBrand(initialData.brand || '');
      setCategory(initialData.category || 'Geral / Outros');
      setPackageType(initialData.packageType || 'Embalagem');
      setPackageQuantity(initialData.packageQuantity || 0);
      setUsageUnit(initialData.usageUnit || 'un');
      setPurchasePrice(initialData.purchasePrice || 0);
      setNotes(initialData.notes || '');
    } else {
      resetForm();
    }
  }, [initialData, isOpen]);

  // custo_base = preço da embalagem ÷ quantidade na embalagem (precisão de 6 casas; a UI arredonda só ao exibir)
  const unitCost = computeInputUnitCost(purchasePrice, packageQuantity);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning('Por favor, informe o nome do insumo.');
      return;
    }
    if (packageQuantity <= 0) {
      toast.warning('Informe a quantidade contida na embalagem (maior que zero).');
      return;
    }
    if (purchasePrice <= 0) {
      toast.warning('O preço da embalagem deve ser maior que zero.');
      return;
    }

    onSave({
      name: name.trim(),
      brand: brand.trim() || undefined,
      category,
      packageType,
      purchasePackageName: buildPackageName(packageType, packageQuantity, usageUnit),
      purchasePrice,
      packageQuantity,
      usageUnit,
      unitCost,
      active: true,
      notes: notes.trim() || undefined,
    });

    setSavedItemName(name.trim());
    setSavedUnitCost(unitCost);
    setSavedUnit(usageUnit);
    setShowSuccess(true);
  };

  if (!isOpen) return null;

  const inputClass =
    'w-full text-xs font-medium rounded-lg border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200/80 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="border-b border-slate-200/80 bg-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200/80 text-teal-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">{initialData ? 'Editar insumo' : 'Cadastrar insumo'}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cadastre como o insumo é comprado. O custo de cada unidade é calculado automaticamente.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Identificação */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome do insumo *</label>
              <input
                type="text"
                data-testid="input-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Marca / fabricante</label>
              <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Categoria</label>
            <CustomSelect
              value={category}
              onChange={(val) => setCategory(val)}
              options={CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
              searchable
            />
          </div>

          {/* Como o insumo é comprado */}
          <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/90 space-y-3.5">
            <div>
              <span className="block text-xs font-bold text-slate-800">Como este insumo é comprado?</span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Use os dados da embalagem do fornecedor. Ex.: caixa com 100 unidades por R$ 27,99.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <CustomSelect
                  label="Tipo de embalagem"
                  value={packageType}
                  onChange={(val) => setPackageType(val)}
                  options={PACKAGE_TYPES.map((t) => ({ value: t, label: t }))}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Quantidade na embalagem *</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  placeholder="Ex.: 100"
                  data-testid="input-package-quantity"
                  value={packageQuantity || ''}
                  onChange={(e) => setPackageQuantity(parseFloat(e.target.value) || 0)}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <CustomSelect
                  label="Unidade base *"
                  value={usageUnit}
                  onChange={(val) => setUsageUnit(val as InputUsageUnit)}
                  options={BASE_UNITS.map((u) => ({ value: u.id, label: u.label }))}
                />
              </div>
            </div>

            <div className="max-w-xs">
              <CurrencyInput label="Preço da embalagem (R$)" value={purchasePrice} onChange={setPurchasePrice} required />
            </div>
          </div>

          {/* Custo unitário calculado */}
          <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/60">
            <div className="text-[11px] font-semibold text-teal-800 uppercase tracking-wider flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-teal-600" />
              Custo unitário
            </div>
            <div className="text-xl font-black text-teal-900 mt-0.5" data-testid="input-unit-cost">
              {unitCost > 0 ? (
                <>
                  {formatUnitCost(unitCost)} <span className="text-xs font-normal text-teal-700">/ {usageUnit}</span>
                </>
              ) : (
                <span className="text-sm font-semibold text-teal-700">Informe a quantidade e o preço da embalagem</span>
              )}
            </div>
            {unitCost > 0 && (
              <div className="text-[11px] text-teal-700 mt-0.5">
                {purchasePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ÷ {formatQuantity(packageQuantity)} {usageUnit}
                {' • '}nos procedimentos este insumo é contado em <strong>{usageUnit}</strong>
              </div>
            )}
          </div>

          {/* Descrição opcional */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Descrição (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 p-2 bg-white"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              data-testid="input-save"
              className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              {initialData ? 'Salvar alterações' : 'Cadastrar insumo'}
            </button>
          </div>
        </form>
      </div>

      <SuccessDialog
        isOpen={showSuccess}
        title={initialData ? 'Insumo atualizado!' : 'Insumo cadastrado!'}
        message={`O insumo "${savedItemName}" foi registrado com custo de ${formatUnitCost(savedUnitCost)} por ${savedUnit}.`}
        primaryActionLabel="Concluir"
        onClose={() => {
          setShowSuccess(false);
          onClose();
        }}
        secondaryAction={
          !initialData
            ? {
                label: 'Cadastrar outro',
                onClick: () => {
                  setShowSuccess(false);
                  resetForm();
                },
              }
            : undefined
        }
      />
    </div>
  );
};
