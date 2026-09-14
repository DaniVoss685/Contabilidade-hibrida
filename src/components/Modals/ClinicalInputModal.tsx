import React, { useState, useEffect } from 'react';
import {
  Package,
  X,
  Calculator,
  Layers,
  Tag,
  CheckCircle2,
  Sparkles,
  Info,
} from 'lucide-react';
import { ClinicalInput, InputUsageUnit } from '../../types';
import { formatCurrency } from '../../lib/masks';
import { CustomSelect, CurrencyInput, useToast, SuccessDialog } from '../UI';

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

export const ClinicalInputModal: React.FC<ClinicalInputModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const toast = useToast();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('Dentística & Resinas');
  const [purchasePackageName, setPurchasePackageName] = useState('');
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [packageQuantity, setPackageQuantity] = useState<number>(1);
  const [usageUnit, setUsageUnit] = useState<InputUsageUnit>('un');
  const [unitHelper, setUnitHelper] = useState<'direct' | 'litro_ml' | 'kg_g'>('direct');
  const [notes, setNotes] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedItemName, setSavedItemName] = useState('');

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setBrand(initialData.brand || '');
      setCategory(initialData.category || 'Geral / Outros');
      setPurchasePackageName(initialData.purchasePackageName || '');
      setPurchasePrice(initialData.purchasePrice || 0);
      setPackageQuantity(initialData.packageQuantity || 1);
      setUsageUnit(initialData.usageUnit || 'un');
      setNotes(initialData.notes || '');
      setUnitHelper('direct');
    } else {
      setName('');
      setBrand('');
      setCategory('Dentística & Resinas');
      setPurchasePackageName('');
      setPurchasePrice(0);
      setPackageQuantity(1);
      setUsageUnit('un');
      setUnitHelper('direct');
      setNotes('');
    }
  }, [initialData, isOpen]);

  // Handle unit change presets
  const handleUnitChange = (unit: InputUsageUnit) => {
    setUsageUnit(unit);
    if (unit === 'ml' && packageQuantity === 1) {
      setUnitHelper('litro_ml');
      setPackageQuantity(1000); // default 1L = 1000ml
    } else if (unit === 'g' && packageQuantity === 1) {
      setPackageQuantity(4); // default seringa resina 4g
    } else if (unit === 'tubete' && packageQuantity === 1) {
      setPackageQuantity(50); // default caixa anestésico 50 tubetes
    } else if (unit === 'un' && packageQuantity === 1) {
      setPackageQuantity(100); // default caixa luvas 100un
    }
  };

  // Helper for quick conversions
  const handleHelperChange = (helper: 'direct' | 'litro_ml' | 'kg_g') => {
    setUnitHelper(helper);
    if (helper === 'litro_ml') {
      setUsageUnit('ml');
      setPackageQuantity(1000);
    } else if (helper === 'kg_g') {
      setUsageUnit('g');
      setPackageQuantity(1000);
    }
  };

  // Calculated unit cost
  const calculatedUnitCost =
    packageQuantity > 0 && purchasePrice > 0
      ? Number((purchasePrice / packageQuantity).toFixed(4))
      : 0;

  const resetForm = () => {
    setName('');
    setBrand('');
    setCategory('Dentística & Resinas');
    setPurchasePackageName('');
    setPurchasePrice(0);
    setPackageQuantity(1);
    setUsageUnit('un');
    setUnitHelper('direct');
    setNotes('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning('Por favor, informe o nome do insumo.');
      return;
    }
    if (purchasePrice <= 0) {
      toast.warning('O preço de compra da embalagem deve ser maior que zero.');
      return;
    }
    if (packageQuantity <= 0) {
      toast.warning('A quantidade ou rendimento na embalagem deve ser maior que zero.');
      return;
    }

    onSave({
      name: name.trim(),
      brand: brand.trim() || undefined,
      category,
      purchasePackageName: purchasePackageName.trim() || `${name} (${packageQuantity} ${usageUnit})`,
      purchasePrice,
      packageQuantity,
      usageUnit,
      unitCost: calculatedUnitCost,
      active: true,
      notes: notes.trim() || undefined,
    });

    setSavedItemName(name.trim());
    setShowSuccess(true);
  };

  if (!isOpen) return null;

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
              <h2 className="text-base font-semibold text-slate-900">
                {initialData ? 'Editar Insumo Clínico' : 'Cadastrar Novo Insumo Clínico'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure a apresentação de compra e o fracionamento por unidade de uso
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nome e Marca */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nome do Insumo / Material *
              </label>
              <input
                type="text"
                placeholder="Ex: Anestésico Mepivacaína 2%, Resina Z350, Clorexidina..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-xs font-medium rounded-lg border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Marca / Fabricante
              </label>
              <input
                type="text"
                placeholder="Ex: 3M, DFL, Maquira"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full text-xs font-medium rounded-lg border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Especialidade / Categoria
            </label>
            <CustomSelect
              value={category}
              onChange={(val) => setCategory(val)}
              options={CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
              searchable
            />
          </div>

          {/* Unidade Fracionada de Consumo */}
          <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/90 space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Como esse material é consumido no atendimento? (Unidade de Uso) *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { unit: 'tubete', label: 'Tubete', desc: 'Anestésicos odontológicos' },
                  { unit: 'ml', label: 'Mililitro (ml)', desc: 'Líquidos, soluções e géis' },
                  { unit: 'g', label: 'Grama (g)', desc: 'Resinas, cimentos e pós' },
                  { unit: 'un', label: 'Unidade (un)', desc: 'Luvas, agulhas, sugadores' },
                  { unit: 'dose', label: 'Dose / Aplicação', desc: 'Gotas e doses únicas' },
                  { unit: 'kit', label: 'Kit descartável', desc: 'Conjuntos e campos estéreis' },
                ].map((item) => {
                  const isSelected = usageUnit === item.unit;
                  return (
                    <button
                      key={item.unit}
                      type="button"
                      onClick={() => handleUnitChange(item.unit as InputUsageUnit)}
                      className={`p-2.5 text-left rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-teal-50 border-teal-600 ring-2 ring-teal-500/20 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300 hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${isSelected ? 'text-teal-900' : 'text-slate-800'}`}>
                          {item.label}
                        </span>
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            isSelected ? 'border-teal-600 bg-teal-600' : 'border-slate-300'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] mt-1 line-clamp-1 font-medium ${
                          isSelected ? 'text-teal-700' : 'text-slate-400'
                        }`}
                      >
                        {item.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Conversor rápido se for ml ou g */}
            {(usageUnit === 'ml' || usageUnit === 'g') && (
              <div className="flex items-center gap-2 text-xs pt-1">
                <span className="text-slate-500 font-semibold">Conversão da embalagem:</span>
                {usageUnit === 'ml' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleHelperChange('litro_ml')}
                      className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                        unitHelper === 'litro_ml'
                          ? 'bg-teal-100 text-teal-800 border border-teal-300'
                          : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      Comprei em Litros (1L = 1000 ml)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleHelperChange('direct')}
                      className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                        unitHelper === 'direct'
                          ? 'bg-teal-100 text-teal-800 border border-teal-300'
                          : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      Comprei direto em ML
                    </button>
                  </>
                )}
                {usageUnit === 'g' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleHelperChange('kg_g')}
                      className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                        unitHelper === 'kg_g'
                          ? 'bg-teal-100 text-teal-800 border border-teal-300'
                          : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      Comprei em Kg (1kg = 1000 g)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleHelperChange('direct')}
                      className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                        unitHelper === 'direct'
                          ? 'bg-teal-100 text-teal-800 border border-teal-300'
                          : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      Comprei direto em Gramas
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Apresentação de Compra e Custos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Preço da Embalagem (R$) *
              </label>
              <CurrencyInput
                value={purchasePrice}
                onChange={setPurchasePrice}
                className="w-full text-xs font-bold text-slate-900 rounded-lg border border-slate-300 bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Rendimento na Embalagem *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  placeholder="Ex: 50, 1000, 4"
                  value={packageQuantity || ''}
                  onChange={(e) => setPackageQuantity(parseFloat(e.target.value) || 0)}
                  className="w-full pr-14 pl-3 py-2 text-xs font-bold text-slate-900 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 uppercase">
                  {usageUnit}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Quantos(as) {usageUnit} vêm na embalagem?
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Descrição da Embalagem
              </label>
              <input
                type="text"
                placeholder="Ex: Caixa c/ 50 tubetes, Frasco 1L..."
                value={purchasePackageName}
                onChange={(e) => setPurchasePackageName(e.target.value)}
                className="w-full text-xs font-medium rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Destaque do Custo Unitário Calculado */}
          <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/60 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-teal-800 uppercase tracking-wider flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-teal-600" />
                Custo Unitário Calculado
              </div>
              <div className="text-xl font-black text-teal-900 mt-0.5">
                R$ {calculatedUnitCost.toFixed(calculatedUnitCost < 0.1 ? 3 : 2)}{' '}
                <span className="text-xs font-normal text-teal-700">/ por {usageUnit}</span>
              </div>
              <div className="text-[11px] text-teal-700 mt-0.5">
                Divisão: R$ {purchasePrice.toFixed(2)} ÷ {packageQuantity} {usageUnit}
              </div>
            </div>

            <div className="text-right">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-600 text-white shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Pronto para Vincular
              </span>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Observações Clínicas (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Proporção recomendada, tempo de polimerização, etc."
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
              className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              {initialData ? 'Salvar Alterações' : 'Cadastrar Insumo'}
            </button>
          </div>
        </form>
      </div>

      <SuccessDialog
        isOpen={showSuccess}
        title={initialData ? 'Insumo Atualizado!' : 'Insumo Cadastrado!'}
        message={`O insumo clínico "${savedItemName}" foi registrado com sucesso com custo unitário de R$ ${calculatedUnitCost.toFixed(calculatedUnitCost < 0.1 ? 3 : 2).replace('.', ',')} por ${usageUnit}.`}
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
