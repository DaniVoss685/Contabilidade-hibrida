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
  Repeat,
  Layers,
  CalendarDays,
  Check,
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
import { formatCpf, formatCnpj, formatCurrency, formatDateBr } from '../../lib/masks';

function addMonthsToDateString(dateStr: string, monthsToAdd: number): string {
  if (!dateStr) return dateStr;
  const parts = dateStr.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const targetDate = new Date(y, m - 1 + monthsToAdd, 1);
  const daysInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
  const finalDay = Math.min(d, daysInMonth);
  const finalMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
  const finalDayStr = String(finalDay).padStart(2, '0');
  return `${targetDate.getFullYear()}-${finalMonth}-${finalDayStr}`;
}

function addWeeksToDateString(dateStr: string, weeksToAdd: number): string {
  if (!dateStr) return dateStr;
  const parts = dateStr.split('-').map(Number);
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  dt.setDate(dt.getDate() + weeksToAdd * 7);
  const finalMonth = String(dt.getMonth() + 1).padStart(2, '0');
  const finalDayStr = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${finalMonth}-${finalDayStr}`;
}

function addYearsToDateString(dateStr: string, yearsToAdd: number): string {
  if (!dateStr) return dateStr;
  const parts = dateStr.split('-').map(Number);
  return `${parts[0] + yearsToAdd}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
}

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  bankAccounts: BankAccount[];
  onExpenseCreated?: () => void;
  expenseToEdit?: Expense | null;
  initialExpenseType?: 'UNICA' | 'PARCELADA' | 'RECORRENTE';
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
      counterpartyPlaceholder: '',
      counterpartyRequired: false,
      docLabel: 'Código / Nº da Guia',
      docPlaceholder: '',
      showDoc: false,
      descriptionPlaceholder: '',
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
      counterpartyPlaceholder: '',
      counterpartyRequired: false,
      docLabel: 'CPF do Colaborador',
      docPlaceholder: '',
      showDoc: true,
      descriptionPlaceholder: '',
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
      counterpartyPlaceholder: '',
      counterpartyRequired: false,
      docLabel: entity === 'CPF' ? 'CPF do Locador' : 'CNPJ / CPF do Locador',
      docPlaceholder: '',
      showDoc: true,
      descriptionPlaceholder: '',
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
      counterpartyPlaceholder: '',
      counterpartyRequired: true,
      docLabel: entity === 'CPF' ? 'CPF do Prestador' : 'CNPJ do Prestador',
      docPlaceholder: '',
      showDoc: true,
      descriptionPlaceholder: '',
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
      counterpartyPlaceholder: '',
      counterpartyRequired: false,
      docLabel: 'Código do Cliente / CNPJ',
      docPlaceholder: '',
      showDoc: true,
      descriptionPlaceholder: '',
    };
  }

  // 6. Materiais Odontológicos / Insumos Clínicos (Padrão)
  return {
    counterpartyLabel: 'Fornecedor',
    counterpartyPlaceholder: '',
    counterpartyRequired: true,
    docLabel: entity === 'CPF' ? 'CPF do Fornecedor' : 'CNPJ do Fornecedor',
    docPlaceholder: '',
    showDoc: true,
    descriptionPlaceholder: '',
  };
}

export const NewExpenseModal: React.FC<NewExpenseModalProps> = ({
  isOpen,
  onClose,
  categories,
  bankAccounts,
  onExpenseCreated,
  expenseToEdit,
  initialExpenseType,
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
  const [isPaid, setIsPaid] = useState(bankAccounts.length > 0);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const preferredBank = bankAccounts.find((b) => b.isPreferred && b.isActive !== false) ||
                        bankAccounts.find((b) => b.isActive !== false) ||
                        bankAccounts[0];
  const [bankAccountId, setBankAccountId] = useState(preferredBank?.id || '');
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

  // Tipo de Lançamento: Único, Parcelado ou Recorrente
  const [expenseType, setExpenseType] = useState<'UNICA' | 'PARCELADA' | 'RECORRENTE'>(
    initialExpenseType || 'UNICA'
  );
  const [installmentsCount, setInstallmentsCount] = useState<number>(2);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<'MENSAL' | 'SEMANAL' | 'ANUAL'>('MENSAL');
  const [recurrenceCount, setRecurrenceCount] = useState<number>(12);
  const [editScope, setEditScope] = useState<'ONLY_THIS' | 'THIS_AND_FUTURE' | 'ALL_SERIES'>('ONLY_THIS');

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

      setExpenseType(expenseToEdit.expenseType || (expenseToEdit.totalInstallments ? 'PARCELADA' : expenseToEdit.recurrenceId ? 'RECORRENTE' : 'UNICA'));
      setInstallmentsCount(expenseToEdit.totalInstallments || 2);
      setRecurrenceFrequency(expenseToEdit.recurrenceFrequency || 'MENSAL');
      setRecurrenceCount(expenseToEdit.recurrenceCount || 12);
      setEditScope('ONLY_THIS');

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
      const preferredBank = bankAccounts.find((b) => b.isPreferred && b.isActive !== false) ||
                            bankAccounts.find((b) => b.isActive !== false) ||
                            bankAccounts[0];
      setBankAccountId(preferredBank?.id || '');
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

      setExpenseType(initialExpenseType || 'UNICA');
      setInstallmentsCount(2);
      setRecurrenceFrequency('MENSAL');
      setRecurrenceCount(12);
      setEditScope('ONLY_THIS');

      setIsDirty(false);
    }
  }, [expenseToEdit, isOpen, defaultCat, initialExpenseType]);

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
    label: c.name,
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
    label: `${b.isPreferred ? '⭐ ' : ''}${b.name}${b.isPreferred ? ' (Principal)' : ''}`,
    description: `${b.isPreferred ? 'Conta Padrão • ' : ''}${b.bankName || 'Conta Bancária'}`,
  }));

  const isSeriesExpense = Boolean(
    expenseToEdit && (expenseToEdit.installmentGroupId || expenseToEdit.recurrenceId)
  );

  const installmentPreview = useMemo(() => {
    if (expenseType !== 'PARCELADA' || value <= 0) return [];
    const count = Math.max(2, Math.min(60, installmentsCount || 2));
    const baseAmount = Math.floor((value / count) * 100) / 100;
    const remainder = Math.round((value - baseAmount * count) * 100) / 100;
    const list = [];
    for (let i = 1; i <= count; i++) {
      const instVal = i === count ? Math.round((baseAmount + remainder) * 100) / 100 : baseAmount;
      const instDueDate = addMonthsToDateString(dueDate, i - 1);
      list.push({
        number: i,
        total: count,
        value: instVal,
        dueDate: instDueDate,
        isLastWithAdjustment: i === count && remainder !== 0,
      });
    }
    return list;
  }, [expenseType, value, installmentsCount, dueDate]);

  const recurrencePreview = useMemo(() => {
    if (expenseType !== 'RECORRENTE' || value <= 0) return { total: 0, count: 0, previewDates: [] as string[] };
    const count = Math.max(2, Math.min(60, recurrenceCount || 12));
    const total = Math.round(value * count * 100) / 100;
    const previewDates: string[] = [];
    for (let i = 1; i <= Math.min(count, 3); i++) {
      const d =
        recurrenceFrequency === 'MENSAL'
          ? addMonthsToDateString(dueDate, i - 1)
          : recurrenceFrequency === 'SEMANAL'
          ? addWeeksToDateString(dueDate, i - 1)
          : addYearsToDateString(dueDate, i - 1);
      previewDates.push(d);
    }
    return { total, count, previewDates };
  }, [expenseType, value, recurrenceCount, recurrenceFrequency, dueDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!description.trim()) {
      toast.warning('A descrição da despesa é obrigatória.');
      return;
    }

    if (value <= 0) {
      toast.warning('O valor da despesa deve ser maior que zero.');
      return;
    }

    if (!dueDate || !dueDate.trim()) {
      toast.warning('A data de vencimento é obrigatória.');
      return;
    }

    if (isOverridden && !overrideJustification.trim()) {
      toast.warning('Para alterar manualmente a classificação tributária padrão, é obrigatório informar a justificativa.');
      return;
    }

    if (isPaid && (!bankAccountId || bankAccountId.trim() === '')) {
      toast.warning('A conta bancária é obrigatória para despesas pagas. Desmarque a liquidação imediata para salvar como "A Pagar" ou cadastre uma conta bancária.');
      return;
    }

    setIsSubmitting(true);
    try {
      const cat = selectedCategory;
      const finalAttachmentName = attachmentFile?.name || attachmentName.trim() || undefined;
      // Descrição é a identificação principal; fornecedor recebe a descrição se omitido
      const finalDescription = description.trim();
      const finalSupplierName = supplierName.trim() || finalDescription;
      const finalBankAccountId = isPaid ? bankAccountId : (bankAccountId || undefined);
      const finalCompetenceDate = dueDate
        ? `${dueDate.substring(0, 7)}-01`
        : new Date().toISOString().split('T')[0];

      if (isEditing && expenseToEdit) {
        if (expenseToEdit.installmentGroupId || expenseToEdit.recurrenceId) {
          db.updateExpenseSeries(
            expenseToEdit.id,
            {
              supplierName: finalSupplierName,
              supplierCpfCnpj: supplierCpfCnpj.trim() || undefined,
              description: finalDescription,
              categoryId: cat.id,
              categoryCode: cat.code,
              categoryName: cat.name,
              subCategory: subCategory.trim() || undefined,
              value,
              competenceDate: finalCompetenceDate,
              dueDate,
              paymentDate: isPaid ? paymentDate : undefined,
              paymentMethod: isPaid ? paymentMethod : undefined,
              bankAccountId: finalBankAccountId,
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
            },
            editScope
          );
          toast.success(
            editScope === 'ALL_SERIES'
              ? 'Todas as despesas da série foram atualizadas.'
              : editScope === 'THIS_AND_FUTURE'
              ? 'Esta e as despesas seguintes foram atualizadas.'
              : 'Despesa atualizada com sucesso.'
          );
        } else {
          db.updateExpense(expenseToEdit.id, {
            supplierName: finalSupplierName,
            supplierCpfCnpj: supplierCpfCnpj.trim() || undefined,
            description: finalDescription,
            categoryId: cat.id,
            categoryCode: cat.code,
            categoryName: cat.name,
            subCategory: subCategory.trim() || undefined,
            value,
            competenceDate: finalCompetenceDate,
            dueDate,
            paymentDate: isPaid ? paymentDate : undefined,
            paymentMethod: isPaid ? paymentMethod : undefined,
            bankAccountId: finalBankAccountId,
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
            expenseType: 'UNICA',
          });
          toast.success('Despesa atualizada com sucesso.');
        }
      } else {
        if (expenseType === 'PARCELADA') {
          const count = Math.max(2, Math.min(60, installmentsCount || 2));
          const baseAmount = Math.floor((value / count) * 100) / 100;
          const remainder = Math.round((value - baseAmount * count) * 100) / 100;
          const groupId = `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const items = [];

          for (let i = 1; i <= count; i++) {
            const instVal = i === count ? Math.round((baseAmount + remainder) * 100) / 100 : baseAmount;
            const isFirstPaid = isPaid && i === 1;
            items.push({
              supplierName: finalSupplierName,
              supplierCpfCnpj: supplierCpfCnpj.trim() || undefined,
              description: `${finalDescription} (${i}/${count})`,
              categoryId: cat.id,
              categoryCode: cat.code,
              categoryName: cat.name,
              subCategory: subCategory.trim() || undefined,
              value: instVal,
              competenceDate: addMonthsToDateString(finalCompetenceDate, i - 1),
              dueDate: addMonthsToDateString(dueDate, i - 1),
              paymentDate: isFirstPaid ? paymentDate : undefined,
              paymentMethod: isFirstPaid ? paymentMethod : undefined,
              bankAccountId: isFirstPaid ? finalBankAccountId : (finalBankAccountId || undefined),
              documentNumber: documentNumber.trim() || undefined,
              attachmentName: finalAttachmentName,
              notes: notes.trim() || undefined,
              entity,
              dedutivelLivroCaixaPf,
              impactaFatorRPj,
              despesaOperacionalPj,
              isOverridden,
              overrideJustification: isOverridden ? overrideJustification.trim() : undefined,
              status: isFirstPaid ? ('PAGO' as const) : ('A_PAGAR' as const),
              expenseType: 'PARCELADA' as const,
              installmentNumber: i,
              totalInstallments: count,
              installmentGroupId: groupId,
            });
          }
          db.addExpenses(items);
          toast.success(`Despesa parcelada em ${count}x cadastrada com sucesso.`);
        } else if (expenseType === 'RECORRENTE') {
          const count = Math.max(2, Math.min(60, recurrenceCount || 12));
          const recId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const items = [];

          for (let i = 1; i <= count; i++) {
            const isFirstPaid = isPaid && i === 1;
            const itemDueDate =
              recurrenceFrequency === 'MENSAL'
                ? addMonthsToDateString(dueDate, i - 1)
                : recurrenceFrequency === 'SEMANAL'
                ? addWeeksToDateString(dueDate, i - 1)
                : addYearsToDateString(dueDate, i - 1);
            const itemCompDate =
              recurrenceFrequency === 'MENSAL'
                ? addMonthsToDateString(finalCompetenceDate, i - 1)
                : recurrenceFrequency === 'SEMANAL'
                ? addWeeksToDateString(finalCompetenceDate, i - 1)
                : addYearsToDateString(finalCompetenceDate, i - 1);

            items.push({
              supplierName: finalSupplierName,
              supplierCpfCnpj: supplierCpfCnpj.trim() || undefined,
              description: `${finalDescription} (${i}/${count})`,
              categoryId: cat.id,
              categoryCode: cat.code,
              categoryName: cat.name,
              subCategory: subCategory.trim() || undefined,
              value: value,
              competenceDate: itemCompDate,
              dueDate: itemDueDate,
              paymentDate: isFirstPaid ? paymentDate : undefined,
              paymentMethod: isFirstPaid ? paymentMethod : undefined,
              bankAccountId: isFirstPaid ? finalBankAccountId : (finalBankAccountId || undefined),
              documentNumber: documentNumber.trim() || undefined,
              attachmentName: finalAttachmentName,
              notes: notes.trim() || undefined,
              entity,
              dedutivelLivroCaixaPf,
              impactaFatorRPj,
              despesaOperacionalPj,
              isOverridden,
              overrideJustification: isOverridden ? overrideJustification.trim() : undefined,
              status: isFirstPaid ? ('PAGO' as const) : ('A_PAGAR' as const),
              expenseType: 'RECORRENTE' as const,
              recurrenceFrequency,
              recurrenceCount: count,
              recurrenceIndex: i,
              recurrenceId: recId,
            });
          }
          db.addExpenses(items);
          toast.success(`Despesa recorrente com ${count} repetições cadastrada com sucesso.`);
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
            competenceDate: finalCompetenceDate,
            dueDate,
            paymentDate: isPaid ? paymentDate : undefined,
            paymentMethod: isPaid ? paymentMethod : undefined,
            bankAccountId: finalBankAccountId,
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
            expenseType: 'UNICA',
          });
          toast.success('Despesa cadastrada com sucesso.');
        }
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
          {/* Section 3: Identificação da Despesa */}
          <div className="space-y-4">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              3. Identificação da Despesa
            </span>

            {/* Descrição da Despesa */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Descrição da Despesa <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder=""
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none transition-all"
                required
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Nome principal da despesa nos resumos, relatórios, DRE e Fluxo de Caixa.
              </p>
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
                    placeholder=""
                    value={overrideJustification}
                    onChange={(e) => setOverrideJustification(e.target.value)}
                    className="w-full text-xs rounded-xl border border-rose-200 p-2.5 bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none"
                    required={isOverridden}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Section 5: Modalidade do Lançamento */}
          <div className="space-y-3">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              5. Modalidade do Lançamento <span className="text-rose-500">*</span>
            </span>

            {isEditing && isSeriesExpense ? (
              <div className="p-4 bg-purple-50/80 border border-purple-200 rounded-xl space-y-2.5">
                <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
                  <Repeat className="w-4 h-4 text-purple-700" />
                  <span>
                    Despesa Vinculada a uma Série ({expenseToEdit?.expenseType === 'PARCELADA'
                      ? `Parcela ${expenseToEdit.installmentNumber}/${expenseToEdit.totalInstallments}`
                      : `Recorrente ${expenseToEdit?.recurrenceIndex}/${expenseToEdit?.recurrenceCount}`})
                  </span>
                </div>
                <p className="text-[11px] text-purple-800 leading-relaxed">
                  Esta despesa faz parte de um grupo recorrente ou parcelado. Escolha o escopo de aplicação das suas alterações:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditScope('ONLY_THIS')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer text-center ${
                      editScope === 'ONLY_THIS'
                        ? 'bg-purple-700 text-white border-purple-800 shadow-xs'
                        : 'bg-white text-slate-700 border-purple-200 hover:bg-purple-100/50'
                    }`}
                  >
                    Apenas esta parcela
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditScope('THIS_AND_FUTURE')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer text-center ${
                      editScope === 'THIS_AND_FUTURE'
                        ? 'bg-purple-700 text-white border-purple-800 shadow-xs'
                        : 'bg-white text-slate-700 border-purple-200 hover:bg-purple-100/50'
                    }`}
                  >
                    Esta e as seguintes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditScope('ALL_SERIES')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer text-center ${
                      editScope === 'ALL_SERIES'
                        ? 'bg-purple-700 text-white border-purple-800 shadow-xs'
                        : 'bg-white text-slate-700 border-purple-200 hover:bg-purple-100/50'
                    }`}
                  >
                    Todas da série
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setExpenseType('UNICA');
                    setIsDirty(true);
                  }}
                  className={`py-3 px-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                    expenseType === 'UNICA'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-2xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs">Lançamento Único</span>
                  <span className="text-[10px] text-slate-400 font-normal">Gasto pontual</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExpenseType('PARCELADA');
                    setIsDirty(true);
                  }}
                  className={`py-3 px-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                    expenseType === 'PARCELADA'
                      ? 'border-amber-600 bg-amber-50 text-amber-950 font-bold shadow-2xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Layers className="w-4 h-4 text-amber-600" />
                  <span className="text-xs">Parcelada</span>
                  <span className="text-[10px] text-slate-400 font-normal">Ex: 2x a 60x</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExpenseType('RECORRENTE');
                    setIsDirty(true);
                  }}
                  className={`py-3 px-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                    expenseType === 'RECORRENTE'
                      ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold shadow-2xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Repeat className="w-4 h-4 text-purple-600" />
                  <span className="text-xs">Recorrente (Fixa)</span>
                  <span className="text-[10px] text-slate-400 font-normal">Aluguel, software...</span>
                </button>
              </div>
            )}
          </div>

          {/* Section 6: Values and Dates */}
          <div className="space-y-4">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              6. Valores & Prazos
            </span>

            {/* Section 6: Values & Due Date & Bank Account */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-start">
              <div>
                <CurrencyInput
                  label={
                    expenseType === 'PARCELADA'
                      ? 'Valor Total da Compra'
                      : expenseType === 'RECORRENTE'
                      ? 'Valor por Ocorrência'
                      : 'Valor da Despesa'
                  }
                  required
                  value={value}
                  onChange={setValue}
                />
              </div>

              <div>
                <DatePicker
                  label={expenseType === 'PARCELADA' ? 'Vencimento 1ª Parcela' : 'Data de Vencimento'}
                  required
                  value={dueDate}
                  onChange={setDueDate}
                />
              </div>

              <div>
                <CustomSelect
                  label={isPaid ? "Conta Bancária de Pagamento *" : "Conta Bancária (Opcional)"}
                  options={bankAccountOptions}
                  value={bankAccountId}
                  onChange={(v) => {
                    setBankAccountId(v);
                    setIsDirty(true);
                  }}
                  required={isPaid}
                  placeholder={bankAccounts.length === 0 ? "Nenhuma conta cadastrada" : isPaid ? "Selecione a conta bancária..." : "Conta bancária opcional..."}
                />
              </div>
            </div>

            {/* Custom Configuration for PARCELADA */}
            {expenseType === 'PARCELADA' && !isEditing && (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-600" />
                    Configuração do Parcelamento
                  </span>
                  <div className="flex items-center gap-1">
                    {[2, 3, 4, 6, 10, 12].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => {
                          setInstallmentsCount(cnt);
                          setIsDirty(true);
                        }}
                        className={`px-2 py-1 text-[11px] font-semibold rounded-md border transition-all cursor-pointer ${
                          installmentsCount === cnt
                            ? 'bg-amber-600 text-white border-amber-700'
                            : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/60'
                        }`}
                      >
                        {cnt}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Quantidade de Parcelas (2x a 60x):
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={60}
                      value={installmentsCount}
                      onChange={(e) => {
                        setInstallmentsCount(Math.max(2, Math.min(60, parseInt(e.target.value, 10) || 2)));
                        setIsDirty(true);
                      }}
                      className="w-full text-xs rounded-xl border border-amber-300 px-3 py-2 bg-white text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-amber-200 text-xs space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Valor Base por Parcela:</span>
                      <span className="font-bold text-slate-900">
                        {installmentPreview.length > 0 ? formatCurrency(installmentPreview[0].value) : 'R$ 0,00'}
                      </span>
                    </div>
                    {installmentPreview.some((p) => p.isLastWithAdjustment) && (
                      <div className="flex justify-between text-amber-700 text-[11px] font-medium">
                        <span>Última Parcela (com centavos):</span>
                        <span className="font-bold">
                          {formatCurrency(installmentPreview[installmentPreview.length - 1].value)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Breakdown List */}
                <div className="pt-2 border-t border-amber-200/70">
                  <span className="text-[11px] font-bold text-amber-900 block mb-1.5">
                    Cronograma de Vencimentos ({installmentPreview.length} parcelas):
                  </span>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {installmentPreview.map((inst) => (
                      <div
                        key={inst.number}
                        className="flex items-center justify-between text-[11px] py-1 px-2.5 rounded-lg bg-white border border-amber-100"
                      >
                        <span className="font-semibold text-slate-800">
                          Parcela {inst.number}/{inst.total}
                        </span>
                        <span className="text-slate-500 font-mono">
                          Vencimento: {formatDateBr(inst.dueDate)}
                        </span>
                        <span className="font-bold text-slate-900">
                          {formatCurrency(inst.value)}
                          {inst.isLastWithAdjustment && (
                            <span className="ml-1 text-[10px] text-amber-600 font-normal">(ajuste)</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-semibold mt-1.5 flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>
                      Soma exata das parcelas bate 100% com o total: {formatCurrency(value)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Custom Configuration for RECORRENTE */}
            {expenseType === 'RECORRENTE' && !isEditing && (
              <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                    <Repeat className="w-4 h-4 text-purple-600" />
                    Configuração da Recorrência
                  </span>
                  <div className="flex items-center gap-1">
                    {[3, 6, 12, 24].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => {
                          setRecurrenceCount(cnt);
                          setIsDirty(true);
                        }}
                        className={`px-2 py-1 text-[11px] font-semibold rounded-md border transition-all cursor-pointer ${
                          recurrenceCount === cnt
                            ? 'bg-purple-700 text-white border-purple-800'
                            : 'bg-white text-slate-700 border-purple-200 hover:bg-purple-100/60'
                        }`}
                      >
                        {cnt} meses
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Periodicidade:
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['MENSAL', 'SEMANAL', 'ANUAL'] as const).map((freq) => (
                        <button
                          key={freq}
                          type="button"
                          onClick={() => {
                            setRecurrenceFrequency(freq);
                            setIsDirty(true);
                          }}
                          className={`py-1.5 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer ${
                            recurrenceFrequency === freq
                              ? 'bg-purple-700 text-white border-purple-800'
                              : 'bg-white text-slate-700 border-purple-200 hover:bg-purple-100/50'
                          }`}
                        >
                          {freq === 'MENSAL' ? 'Mensal' : freq === 'SEMANAL' ? 'Semanal' : 'Anual'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Quantidade de Ocorrências a Projetar:
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={60}
                      value={recurrenceCount}
                      onChange={(e) => {
                        setRecurrenceCount(Math.max(2, Math.min(60, parseInt(e.target.value, 10) || 2)));
                        setIsDirty(true);
                      }}
                      className="w-full text-xs rounded-xl border border-purple-300 px-3 py-2 bg-white text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-purple-200 text-xs space-y-1">
                  <div className="flex justify-between text-slate-700 font-semibold">
                    <span>Compromisso Financeiro Total Projetado:</span>
                    <span className="font-bold text-purple-900 text-sm">
                      {formatCurrency(recurrencePreview.total)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Gera {recurrencePreview.count} lançamentos vinculados com intervalo {recurrenceFrequency.toLowerCase()}.
                    Primeiros vencimentos: {recurrencePreview.previewDates.map((d) => formatDateBr(d)).join(', ')}...
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Section 7: Settlement / Payment */}
          <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/40 space-y-4">
            {bankAccounts.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Nenhuma conta bancária cadastrada</p>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    A despesa será registrada como <strong>"A Pagar"</strong>. Para registrar despesas pagas imediatamente, cadastre uma conta em <em>Configurações &gt; Contas Bancárias</em>.
                  </p>
                </div>
              </div>
            ) : (
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPaid}
                  onChange={(e) => setIsPaid(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-slate-800">
                  {expenseType === 'PARCELADA'
                    ? 'Quitar 1ª parcela imediatamente'
                    : expenseType === 'RECORRENTE'
                    ? 'Quitar 1ª ocorrência imediatamente'
                    : 'Despesa já foi paga (Liquidação imediata)'}
                </span>
              </label>
            )}

            {isPaid && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
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
                </div>

                {expenseType === 'PARCELADA' && (
                  <p className="text-[11px] text-amber-800 bg-amber-50/80 p-2.5 rounded-xl border border-amber-200">
                    Apenas a 1ª parcela será registrada como <strong>PAGA</strong>. As demais parcelas permanecerão registradas como <strong>A PAGAR</strong> com seus respectivos vencimentos mensais.
                  </p>
                )}

                {expenseType === 'RECORRENTE' && (
                  <p className="text-[11px] text-purple-800 bg-purple-50/80 p-2.5 rounded-xl border border-purple-200">
                    Apenas a 1ª ocorrência será registrada como <strong>PAGA</strong>. As demais permanecerão agendadas como <strong>A PAGAR</strong>.
                  </p>
                )}
              </>
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
                  placeholder=""
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
