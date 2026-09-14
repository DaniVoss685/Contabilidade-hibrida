import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Upload,
  AlertTriangle,
  Sliders,
  CheckCircle2,
  FileText,
  Building2,
  User,
  HelpCircle,
  Receipt,
  Calendar,
  Wallet,
  Loader2,
} from 'lucide-react';
import { db } from '../../lib/db';
import {
  Expense,
  ExpenseEntity,
  LivroCaixaPfDedutibilidade,
  PaymentMethod,
  ExpenseCategory,
  BankAccount,
  AttachmentMetadata,
} from '../../types';
import { DatePicker, CurrencyInput, CustomSelect, useToast, ReceiptUploader, ConfirmDialog } from '../UI';
import { formatCpf, formatCnpj } from '../../lib/masks';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  bankAccounts: BankAccount[];
  onExpenseCreated?: () => void;
  expenseToEdit?: Expense | null;
}

export interface CounterpartyMeta {
  counterpartyLabel: string;
  counterpartyPlaceholder: string;
  counterpartyRequired: boolean;
  docLabel: string;
  docPlaceholder: string;
  showDoc: boolean;
  descriptionPlaceholder: string;
}

function getCounterpartyMeta(
  categoryName = '',
  groupName = '',
  entity: ExpenseEntity = 'CPF'
): CounterpartyMeta {
  const norm = `${categoryName} ${groupName}`.toLowerCase();

  // 1. Tributos, Impostos e Obrigações Legais
  if (
    norm.includes('imposto') ||
    norm.includes('tribut') ||
    norm.includes('das') ||
    norm.includes('cro') ||
    norm.includes('alvará') ||
    norm.includes('alvara') ||
    norm.includes('taxa') ||
    norm.includes('iptu') ||
    norm.includes('darf') ||
    norm.includes('receita federal')
  ) {
    return {
      counterpartyLabel: 'Órgão / Entidade Arrecadadora',
      counterpartyPlaceholder: 'Ex: Receita Federal, CRO-SP, Prefeitura Municipal...',
      counterpartyRequired: false,
      docLabel: 'Código / Nº da Guia',
      docPlaceholder: 'Ex: 0190, 8630, Nº da Guia...',
      showDoc: false,
      descriptionPlaceholder: 'Ex: Guia DAS Simples Nacional, Anuidade CRO-SP...',
    };
  }

  // 2. Pessoal, Folha, Salários, Férias, Encargos e Pró-labore
  if (
    norm.includes('salário') ||
    norm.includes('salario') ||
    norm.includes('pró-labore') ||
    norm.includes('pro-labore') ||
    norm.includes('folha') ||
    norm.includes('férias') ||
    norm.includes('ferias') ||
    norm.includes('inss') ||
    norm.includes('fgts') ||
    norm.includes('benefício') ||
    norm.includes('beneficio') ||
    norm.includes('colaborador') ||
    norm.includes('funcionário') ||
    norm.includes('funcionario')
  ) {
    return {
      counterpartyLabel: 'Colaborador / Funcionário',
      counterpartyPlaceholder: 'Ex: Dra. Juliana (ASB), Dra. Camila (Dentista), Recepcionista Beatriz...',
      counterpartyRequired: false,
      docLabel: 'CPF do Colaborador',
      docPlaceholder: '000.000.000-00',
      showDoc: true,
      descriptionPlaceholder: 'Ex: Folha de pagamento mensal, Adiantamento salarial...',
    };
  }

  // 3. Aluguel, Imóvel e Condomínio do Consultório
  if (
    norm.includes('aluguel') ||
    norm.includes('locação') ||
    norm.includes('locacao') ||
    norm.includes('imobili') ||
    norm.includes('condomínio') ||
    norm.includes('condominio')
  ) {
    return {
      counterpartyLabel: 'Locador / Imobiliária / Condomínio',
      counterpartyPlaceholder: 'Ex: Imobiliária Central, Dr. Roberto (Proprietário), Condomínio Plaza...',
      counterpartyRequired: false,
      docLabel: entity === 'CPF' ? 'CPF do Locador' : 'CNPJ / CPF do Locador',
      docPlaceholder: entity === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00',
      showDoc: true,
      descriptionPlaceholder: 'Ex: Aluguel da sala clínica referente ao mês...',
    };
  }

  // 4. Serviços Prestados por Terceiros (Laboratório, Prótese, Contabilidade, Software, Manutenção)
  if (
    norm.includes('serviço') ||
    norm.includes('servico') ||
    norm.includes('laborat') ||
    norm.includes('prótese') ||
    norm.includes('protese') ||
    norm.includes('contab') ||
    norm.includes('advoc') ||
    norm.includes('manuten') ||
    norm.includes('software') ||
    norm.includes('marketing') ||
    norm.includes('honorário') ||
    norm.includes('honorario')
  ) {
    return {
      counterpartyLabel: 'Prestador de Serviço',
      counterpartyPlaceholder: 'Ex: Lab Odonto Express, Dr. Marcelo (Protético), Assessoria Contábil...',
      counterpartyRequired: true,
      docLabel: entity === 'CPF' ? 'CPF do Prestador' : 'CNPJ do Prestador',
      docPlaceholder: entity === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00',
      showDoc: true,
      descriptionPlaceholder: 'Ex: Confecção de coroa cerâmica sobre implante, mensalidade do sistema...',
    };
  }

  // 5. Contas de Consumo / Concessionárias (Energia, Água, Internet, Telefonia)
  if (
    norm.includes('energia') ||
    norm.includes('luz') ||
    norm.includes('água') ||
    norm.includes('agua') ||
    norm.includes('esgoto') ||
    norm.includes('telefone') ||
    norm.includes('telefonia') ||
    norm.includes('internet')
  ) {
    return {
      counterpartyLabel: 'Empresa / Concessionária',
      counterpartyPlaceholder: 'Ex: Enel Distribuição, Vivo Fibra, Sabesp...',
      counterpartyRequired: false,
      docLabel: 'Código do Cliente / CNPJ',
      docPlaceholder: 'Ex: 00.000.000/0000-00 ou Código do Cliente',
      showDoc: true,
      descriptionPlaceholder: 'Ex: Fatura mensal de energia elétrica do consultório...',
    };
  }

  // 6. Materiais Odontológicos / Insumos Clínicos (Padrão)
  return {
    counterpartyLabel: 'Fornecedor',
    counterpartyPlaceholder: 'Ex: Dental Cremer, Dental Speed, Surya Dental...',
    counterpartyRequired: true,
    docLabel: entity === 'CPF' ? 'CPF do Fornecedor' : 'CNPJ do Fornecedor',
    docPlaceholder: entity === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00',
    showDoc: true,
    descriptionPlaceholder: 'Ex: Aquisição de resinas compostas, luvas e anestésicos...',
  };
}

export const NewExpenseModal: React.FC<NewExpenseModalProps> = ({
  isOpen,
  onClose,
  categories,
  bankAccounts,
  onExpenseCreated,
  expenseToEdit,
}) => {
  const toast = useToast();
  if (!isOpen) return null;

  const isEditing = Boolean(expenseToEdit);

  // Active categories only
  const activeCategories = categories.filter((c) => c.active);
  const defaultCat = activeCategories[0] || categories[0];

  // Form State
  const [supplierName, setSupplierName] = useState('');
  const [supplierCpfCnpj, setSupplierCpfCnpj] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(defaultCat?.id || '');
  const [subCategory, setSubCategory] = useState('');
  const [value, setValue] = useState<number>(350);
  const [competenceDate, setCompetenceDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [dueDate, setDueDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [isPaid, setIsPaid] = useState(true);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id || '');
  const [documentNumber, setDocumentNumber] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<AttachmentMetadata | null>(null);
  const [notes, setNotes] = useState('');

  // UI state for double-click protection and dirty tracking
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Entity selector: CPF (PF) / CNPJ (PJ)
  const [entity, setEntity] = useState<ExpenseEntity>('CPF');

  // 3 Essential Attributes
  const [dedutivelLivroCaixaPf, setDedutivelLivroCaixaPf] =
    useState<LivroCaixaPfDedutibilidade>(
      defaultCat?.dedutivelLivroCaixaPf || 'SIM'
    );
  const [impactaFatorRPj, setImpactaFatorRPj] = useState<boolean>(
    defaultCat?.impactaFatorRPj || false
  );
  const [despesaOperacionalPj, setDespesaOperacionalPj] = useState<boolean>(
    defaultCat?.despesaOperacionalPj || true
  );

  // Manual override state with required justification
  const [isOverridden, setIsOverridden] = useState<boolean>(false);
  const [overrideJustification, setOverrideJustification] = useState<string>('');
  const [showConfirmDiscard, setShowConfirmDiscard] = useState<boolean>(false);

  // Safe Close Handler
  const handleSafeClose = () => {
    if (isDirty) {
      setShowConfirmDiscard(true);
    } else {
      onClose();
    }
  };

  // Load fields when editing or opening
  useEffect(() => {
    if (expenseToEdit) {
      setSupplierName(expenseToEdit.supplierName || '');
      const rawDoc = (expenseToEdit.supplierCpfCnpj || '').replace(/\D/g, '');
      const currentEntity = expenseToEdit.entity || 'CPF';
      setEntity(currentEntity);
      setSupplierCpfCnpj(
        currentEntity === 'CPF'
          ? formatCpf(rawDoc.slice(0, 11))
          : formatCnpj(rawDoc.slice(0, 14))
      );
      setDescription(expenseToEdit.description || '');
      setCategoryId(expenseToEdit.categoryId || defaultCat?.id || '');
      setSubCategory(expenseToEdit.subCategory || '');
      setValue(expenseToEdit.value || 0);
      setCompetenceDate(expenseToEdit.competenceDate || new Date().toISOString().split('T')[0]);
      setDueDate(expenseToEdit.dueDate || new Date().toISOString().split('T')[0]);
      setIsPaid(expenseToEdit.status === 'PAGO');
      setPaymentDate(expenseToEdit.paymentDate || new Date().toISOString().split('T')[0]);
      setPaymentMethod(expenseToEdit.paymentMethod || 'PIX');
      setBankAccountId(expenseToEdit.bankAccountId || bankAccounts[0]?.id || '');
      setDocumentNumber(expenseToEdit.documentNumber || '');
      setAttachmentName(expenseToEdit.attachmentName || '');
      if (expenseToEdit.attachmentName) {
        setAttachmentFile({
          name: expenseToEdit.attachmentName,
          size: 150000,
          type: expenseToEdit.attachmentName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
          uploadedAt: new Date().toISOString(),
        });
      } else {
        setAttachmentFile(null);
      }
      setNotes(expenseToEdit.notes || '');
      setDedutivelLivroCaixaPf(expenseToEdit.dedutivelLivroCaixaPf || 'SIM');
      setImpactaFatorRPj(expenseToEdit.impactaFatorRPj || false);
      setDespesaOperacionalPj(expenseToEdit.despesaOperacionalPj !== undefined ? expenseToEdit.despesaOperacionalPj : true);
      setIsOverridden(Boolean(expenseToEdit.isOverridden));
      setOverrideJustification(expenseToEdit.overrideJustification || '');
      setIsDirty(false);
    } else {
      setSupplierName('');
      setSupplierCpfCnpj('');
      setDescription('');
      setCategoryId(defaultCat?.id || '');
      setSubCategory('');
      setValue(0);
      setCompetenceDate(new Date().toISOString().split('T')[0]);
      setDueDate(new Date().toISOString().split('T')[0]);
      setIsPaid(true);
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('PIX');
      setBankAccountId(bankAccounts[0]?.id || '');
      setDocumentNumber('');
      setAttachmentName('');
      setAttachmentFile(null);
      setNotes('');
      setEntity('CPF');
      setDedutivelLivroCaixaPf(defaultCat?.dedutivelLivroCaixaPf || 'SIM');
      setImpactaFatorRPj(defaultCat?.impactaFatorRPj || false);
      setDespesaOperacionalPj(defaultCat?.despesaOperacionalPj || true);
      setIsOverridden(false);
      setOverrideJustification('');
      setIsDirty(false);
    }
  }, [expenseToEdit, isOpen, defaultCat]);

  // Handle entity change with document re-masking
  const handleEntitySelect = (newEntity: ExpenseEntity) => {
    setEntity(newEntity);
    setIsDirty(true);
    const raw = supplierCpfCnpj.replace(/\D/g, '');
    if (raw) {
      if (newEntity === 'CPF') {
        setSupplierCpfCnpj(formatCpf(raw.slice(0, 11)));
      } else {
        setSupplierCpfCnpj(formatCnpj(raw.slice(0, 14)));
      }
    }
  };

  // Handle Supplier doc change
  const handleSupplierDocChange = (val: string) => {
    setIsDirty(true);
    const raw = val.replace(/\D/g, '');
    if (entity === 'CPF') {
      setSupplierCpfCnpj(formatCpf(raw.slice(0, 11)));
    } else {
      setSupplierCpfCnpj(formatCnpj(raw.slice(0, 14)));
    }
  };

  // Handle Category Change -> Auto-fill attributes
  const handleCategoryChange = (catId: string) => {
    setCategoryId(catId);
    const cat = categories.find((c) => c.id === catId);
    if (cat) {
      setDedutivelLivroCaixaPf(cat.dedutivelLivroCaixaPf);
      setImpactaFatorRPj(cat.impactaFatorRPj);
      setDespesaOperacionalPj(cat.despesaOperacionalPj);
      setIsOverridden(false);
      setOverrideJustification('');
    }
  };

  const selectedCategory = useMemo(() => {
    return categories.find((c) => c.id === categoryId) || defaultCat;
  }, [categories, categoryId, defaultCat]);

  const counterpartyMeta = useMemo(() => {
    return getCounterpartyMeta(selectedCategory?.name, selectedCategory?.groupName, entity);
  }, [selectedCategory, entity]);

  const categoryOptions = activeCategories.map((c) => ({
    value: c.id,
    label: `${c.code} - ${c.name}`,
    description: c.groupName,
  }));

  const paymentMethodOptions = [
    { value: 'PIX', label: 'PIX' },
    { value: 'BOLETO', label: 'Boleto Bancário' },
    { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito' },
    { value: 'CARTAO_DEBITO', label: 'Cartão de Débito' },
    { value: 'TRANSFERENCIA', label: 'Transferência Bancária' },
    { value: 'DINHEIRO', label: 'Dinheiro em Espécie' },
  ];

  const bankAccountOptions = bankAccounts.map((b) => ({
    value: b.id,
    label: b.name,
    description: b.bankName || 'Conta Bancária',
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (counterpartyMeta.counterpartyRequired && !supplierName.trim()) {
      toast.warning(`Por favor informe o ${counterpartyMeta.counterpartyLabel.toLowerCase()}.`);
      return;
    }

    if (value <= 0) {
      toast.warning('O valor da despesa deve ser maior que zero.');
      return;
    }

    if (isOverridden && !overrideJustification.trim()) {
      toast.warning('Para alterar manualmente a classificação tributária padrão, é obrigatório informar a justificativa.');
      return;
    }

    setIsSubmitting(true);
    try {
      const cat = selectedCategory;
      const finalAttachmentName = attachmentFile?.name || attachmentName.trim() || undefined;
      // Fallback seguro se o campo opcional não foi preenchido
      const finalSupplierName = supplierName.trim() || description.trim() || cat.name;
      const finalDescription = description.trim() || cat.name;

      if (isEditing && expenseToEdit) {
        db.updateExpense(expenseToEdit.id, {
          supplierName: finalSupplierName,
          supplierCpfCnpj: supplierCpfCnpj.trim() || undefined,
          description: finalDescription,
          categoryId: cat.id,
          categoryCode: cat.code,
          categoryName: cat.name,
          subCategory: subCategory.trim() || undefined,
          value,
          competenceDate,
          dueDate,
          paymentDate: isPaid ? paymentDate : undefined,
          paymentMethod: isPaid ? paymentMethod : undefined,
          bankAccountId: isPaid ? bankAccountId : undefined,
          documentNumber: documentNumber.trim() || undefined,
          attachmentName: finalAttachmentName,
          notes: notes.trim() || undefined,
          entity,
          dedutivelLivroCaixaPf,
          impactaFatorRPj,
          despesaOperacionalPj,
          isOverridden,
          overrideJustification: isOverridden ? overrideJustification.trim() : undefined,
          status: isPaid ? 'PAGO' : 'A_PAGAR',
        });
        toast.success('Despesa atualizada com sucesso.');
      } else {
        db.addExpense({
          supplierName: finalSupplierName,
          supplierCpfCnpj: supplierCpfCnpj.trim() || undefined,
          description: finalDescription,
          categoryId: cat.id,
          categoryCode: cat.code,
          categoryName: cat.name,
          subCategory: subCategory.trim() || undefined,
          value,
          competenceDate,
          dueDate,
          paymentDate: isPaid ? paymentDate : undefined,
          paymentMethod: isPaid ? paymentMethod : undefined,
          bankAccountId: isPaid ? bankAccountId : undefined,
          documentNumber: documentNumber.trim() || undefined,
          attachmentName: finalAttachmentName,
          notes: notes.trim() || undefined,
          entity,
          dedutivelLivroCaixaPf,
          impactaFatorRPj,
          despesaOperacionalPj,
          isOverridden,
          overrideJustification: isOverridden ? overrideJustification.trim() : undefined,
          status: isPaid ? 'PAGO' : 'A_PAGAR',
        });
        toast.success('Despesa cadastrada com sucesso.');
      }

      if (onExpenseCreated) onExpenseCreated();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                <Receipt className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                {isEditing ? 'Editar Despesa / Conta a Pagar' : 'Nova Despesa / Conta a Pagar'}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 pl-9">
              {isEditing
                ? 'Atualize dados cadastrais, valores e a classificação fiscal da despesa.'
                : 'Classificação tributária automatizada para Livro Caixa PF e Fator R da PJ.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSafeClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* Section 1: Entity Selector */}
          <div>
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              1. Titularidade da Despesa <span className="text-rose-500">*</span>
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleEntitySelect('CPF')}
                className={`py-3 px-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                  entity === 'CPF'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <div className={`p-2 rounded-lg mt-0.5 ${entity === 'CPF' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <span className={`text-xs font-bold block ${entity === 'CPF' ? 'text-emerald-950' : 'text-slate-800'}`}>
                    Pessoa Física (PF)
                  </span>
                  <span className="text-[11px] text-slate-500 leading-snug mt-0.5 block">
                    CPF do Dentista • Livro Caixa Carnê-Leão
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleEntitySelect('CNPJ')}
                className={`py-3 px-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                  entity === 'CNPJ'
                    ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <div className={`p-2 rounded-lg mt-0.5 ${entity === 'CNPJ' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <span className={`text-xs font-bold block ${entity === 'CNPJ' ? 'text-blue-950' : 'text-slate-800'}`}>
                    Pessoa Jurídica (PJ)
                  </span>
                  <span className="text-[11px] text-slate-500 leading-snug mt-0.5 block">
                    CNPJ da Clínica • Fator R & Simples Nacional
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Section 2: Plano de Contas */}
          <div className="space-y-3">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              2. Categoria do Plano de Contas <span className="text-rose-500">*</span>
            </span>

            <div>
              <CustomSelect
                label="Selecione a Categoria Financeira"
                required
                options={categoryOptions}
                value={categoryId}
                onChange={handleCategoryChange}
                placeholder="Selecione o plano de contas"
              />
            </div>
          </div>

          {/* Section 3: Identificação Contextual do Lançamento */}
          <div className="space-y-4">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              3. Identificação do Lançamento
            </span>

            {/* Descrição Detalhada */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Descrição Detalhada do Gasto <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder={counterpartyMeta.descriptionPlaceholder}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none transition-all"
                required
              />
            </div>

            {/* Contraparte Contextual e Documento */}
            <div className={`grid grid-cols-1 ${counterpartyMeta.showDoc ? 'sm:grid-cols-2' : ''} gap-3.5`}>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>
                    {counterpartyMeta.counterpartyLabel}{' '}
                    {counterpartyMeta.counterpartyRequired ? (
                      <span className="text-rose-500">*</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-normal">(Opcional)</span>
                    )}
                  </span>
                </label>
                <input
                  type="text"
                  placeholder={counterpartyMeta.counterpartyPlaceholder}
                  value={supplierName}
                  onChange={(e) => {
                    setSupplierName(e.target.value);
                    setIsDirty(true);
                  }}
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none transition-all"
                  required={counterpartyMeta.counterpartyRequired}
                />
              </div>

              {counterpartyMeta.showDoc && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>{counterpartyMeta.docLabel}</span>
                    <span className="text-[10px] text-slate-400 font-normal">Opcional</span>
                  </label>
                  <input
                    type="text"
                    placeholder={counterpartyMeta.docPlaceholder}
                    value={supplierCpfCnpj}
                    onChange={(e) => handleSupplierDocChange(e.target.value)}
                    maxLength={18}
                    className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-slate-900 font-mono placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none transition-all"
                  />
                </div>
              )}
            </div>

            {/* Subcategoria opcional */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Subcategoria ou Especificação Técnica</span>
                <span className="text-[10px] text-slate-400 font-normal">Opcional</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Resina Z350, Brocas diamantadas, Consultoria especializada..."
                value={subCategory}
                onChange={(e) => {
                  setSubCategory(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Section 4: Smart Tax Classification Card */}
          <div className="space-y-2">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              4. Atributos Tributários Automáticos
            </span>
            <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-slate-500" />
                  Classificação Fiscal pelo Plano de Contas
                </span>
                <button
                  type="button"
                  onClick={() => setIsOverridden(!isOverridden)}
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer"
                >
                  {isOverridden ? 'Restaurar Padrão' : 'Alterar Manualmente'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* 1. dedutivel_livro_caixa_pf */}
                <div className="bg-white p-2.5 rounded-lg border border-slate-200/70">
                  <span className="block text-[11px] text-slate-500 font-medium">Livro Caixa (PF)</span>
                  {!isOverridden ? (
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 rounded-md text-xs font-bold ${
                        dedutivelLivroCaixaPf === 'SIM'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : dedutivelLivroCaixaPf === 'CONDICIONAL'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {dedutivelLivroCaixaPf}
                    </span>
                  ) : (
                    <CustomSelect
                      value={dedutivelLivroCaixaPf}
                      onChange={(val) => setDedutivelLivroCaixaPf(val as LivroCaixaPfDedutibilidade)}
                      options={[
                        { value: 'SIM', label: 'SIM' },
                        { value: 'CONDICIONAL', label: 'CONDICIONAL' },
                        { value: 'NAO', label: 'NÃO' },
                      ]}
                      className="mt-1"
                    />
                  )}
                </div>

                {/* 2. impacta_fator_r_pj */}
                <div className="bg-white p-2.5 rounded-lg border border-slate-200/70">
                  <span className="block text-[11px] text-slate-500 font-medium">Fator R (PJ)</span>
                  {!isOverridden ? (
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 rounded-md text-xs font-bold ${
                        impactaFatorRPj
                          ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {impactaFatorRPj ? 'SIM' : 'NÃO'}
                    </span>
                  ) : (
                    <CustomSelect
                      value={impactaFatorRPj ? 'true' : 'false'}
                      onChange={(val) => setImpactaFatorRPj(val === 'true')}
                      options={[
                        { value: 'true', label: 'SIM' },
                        { value: 'false', label: 'NÃO' },
                      ]}
                      className="mt-1"
                    />
                  )}
                </div>

                {/* 3. despesa_operacional_pj */}
                <div className="bg-white p-2.5 rounded-lg border border-slate-200/70">
                  <span className="block text-[11px] text-slate-500 font-medium">Operacional PJ</span>
                  {!isOverridden ? (
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 rounded-md text-xs font-bold ${
                        despesaOperacionalPj
                          ? 'bg-blue-50 text-blue-800 border border-blue-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {despesaOperacionalPj ? 'SIM' : 'NÃO'}
                    </span>
                  ) : (
                    <CustomSelect
                      value={despesaOperacionalPj ? 'true' : 'false'}
                      onChange={(val) => setDespesaOperacionalPj(val === 'true')}
                      options={[
                        { value: 'true', label: 'SIM' },
                        { value: 'false', label: 'NÃO' },
                      ]}
                      className="mt-1"
                    />
                  )}
                </div>
              </div>

              {dedutivelLivroCaixaPf === 'CONDICIONAL' && (
                <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-snug">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Aviso Tributário:</strong> Dedução condicionada à relação direta com o exercício odontológico e documentação idônea.
                  </span>
                </div>
              )}

              {isOverridden && (
                <div className="pt-2 border-t border-slate-200/70">
                  <label className="block text-xs font-bold text-rose-700 mb-1">
                    Justificativa Obrigatória para Alteração Manual:
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Parecer contábil para despesa extraordinária da clínica"
                    value={overrideJustification}
                    onChange={(e) => setOverrideJustification(e.target.value)}
                    className="w-full text-xs rounded-xl border border-rose-200 p-2.5 bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none"
                    required={isOverridden}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Section 5: Values and Dates */}
          <div className="space-y-4">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              5. Valores & Competência
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <CurrencyInput
                  label="Valor da Despesa"
                  required
                  value={value}
                  onChange={setValue}
                />
              </div>

              <div>
                <DatePicker
                  label="Data de Competência"
                  required
                  value={competenceDate}
                  onChange={setCompetenceDate}
                />
              </div>

              <div>
                <DatePicker
                  label="Data de Vencimento"
                  required
                  value={dueDate}
                  onChange={setDueDate}
                />
              </div>
            </div>
          </div>

          {/* Section 4: Settlement / Payment */}
          <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/40 space-y-4">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isPaid}
                onChange={(e) => setIsPaid(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
              <span className="text-xs font-bold text-slate-800">
                Despesa já foi paga (Liquidação imediata)
              </span>
            </label>

            {isPaid && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <DatePicker
                  label="Data do Pagamento"
                  required={isPaid}
                  value={paymentDate}
                  onChange={setPaymentDate}
                />

                <CustomSelect
                  label="Forma de Pagamento"
                  options={paymentMethodOptions}
                  value={paymentMethod}
                  onChange={(v) => setPaymentMethod(v as PaymentMethod)}
                />

                <CustomSelect
                  label="Conta Bancária"
                  options={bankAccountOptions}
                  value={bankAccountId}
                  onChange={setBankAccountId}
                />
              </div>
            )}
          </div>

          {/* Section 5: Document and Proof */}
          <div className="space-y-4">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              4. Documento & Comprovante
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nº Comprovante / NF
                </label>
                <input
                  type="text"
                  placeholder="Ex: NF-e 9845 ou Autenticação bancária"
                  value={documentNumber}
                  onChange={(e) => {
                    setDocumentNumber(e.target.value);
                    setIsDirty(true);
                  }}
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <ReceiptUploader
                  file={attachmentFile}
                  onFileChange={(file) => {
                    setAttachmentFile(file);
                    setAttachmentName(file?.name || '');
                    setIsDirty(true);
                  }}
                  label="Anexo do Comprovante"
                  hint="PDF, PNG ou JPG até 5MB"
                />
              </div>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleSafeClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                isEditing ? 'Salvar Alterações' : 'Salvar Despesa'
              )}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        isOpen={showConfirmDiscard}
        title="Descartar alterações?"
        description="Você tem alterações não salvas nesta despesa. Tem certeza de que deseja descartar tudo e sair?"
        confirmText="Descartar alterações"
        cancelText="Continuar editando"
        variant="danger"
        onConfirm={() => {
          setShowConfirmDiscard(false);
          onClose();
        }}
        onCancel={() => setShowConfirmDiscard(false)}
      />
    </div>
  );
};
