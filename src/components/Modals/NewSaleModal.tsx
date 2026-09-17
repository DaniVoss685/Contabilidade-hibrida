import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Building,
  Calendar,
  CreditCard,
  FileCheck,
  AlertCircle,
  HelpCircle,
  Plus,
  Clock,
  Receipt,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { db } from '../../lib/db';
import {
  Sale,
  TaxOrigin,
  PaymentMethod,
  SaleInstallment,
  ReceitaSaudeStatus,
  NfseStatus,
  Patient,
  DentalProcedure,
} from '../../types';
import { formatCurrency, formatCpf } from '../../lib/masks';
import { safeMargin, formatPercent } from '../../lib/mathUtils';
import { DatePicker, CurrencyInput, CustomSelect, PatientSearchSelect, useToast, ConfirmDialog } from '../UI';
import { PatientModal } from './PatientModal';

interface NewSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  onSaleCreated?: () => void;
  saleToEdit?: Sale | null;
  initialPatientId?: string;
}

export const NewSaleModal: React.FC<NewSaleModalProps> = ({
  isOpen,
  onClose,
  patients,
  onSaleCreated,
  saleToEdit,
  initialPatientId,
}) => {
  const toast = useToast();
  if (!isOpen) return null;

  const isEditing = Boolean(saleToEdit);

  // 1. Mandatory First Field: ORIGEM TRIBUTÁRIA
  const [taxOrigin, setTaxOrigin] = useState<TaxOrigin>('CPF');

  // Common Fields - clean by default unless initialPatientId is explicitly provided
  const initialPatient = initialPatientId ? patients.find((p) => p.id === initialPatientId) : null;
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    initialPatient?.id || ''
  );
  const [patientName, setPatientName] = useState<string>(initialPatient?.name || '');
  const [patientCpf, setPatientCpf] = useState<string>(initialPatient?.cpf || '');

  // CPF Specific Fields: Payer
  const [payerIsBeneficiary, setPayerIsBeneficiary] = useState<boolean>(true);
  const [payerName, setPayerName] = useState<string>('');
  const [payerCpf, setPayerCpf] = useState<string>('');

  // Available registered procedures
  const procedures = db.getProcedures();
  const [selectedProcedureId, setSelectedProcedureId] = useState<string>('');
  const [isCustomProcedure, setIsCustomProcedure] = useState<boolean>(false);

  // Procedure and Values - starts 100% clean with 0
  const [procedureName, setProcedureName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [totalValue, setTotalValue] = useState<number>(0);

  const [serviceDate, setServiceDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [installmentsCount, setInstallmentsCount] = useState<number>(1);

  // Bank Accounts & Card Fee
  const bankAccounts = db.getBankAccounts();
  const [bankAccountId, setBankAccountId] = useState<string>(() => {
    return db.getPreferredBankAccountId();
  });
  const [cardFeePercent, setCardFeePercent] = useState<number>(0);

  // Cash / immediate receipt toggle (se já foi recebido no ato)
  const [receivedNow, setReceivedNow] = useState<boolean>(() => bankAccounts.length > 0);
  const [receiptIdentifier, setReceiptIdentifier] = useState<string>(''); // e.g. RS-2025-05-... or NFS-e

  // CNPJ Specific: NFS-e
  const [nfseStatus, setNfseStatus] = useState<NfseStatus>('EMITIDA');
  const [nfseNumber, setNfseNumber] = useState<string>('');
  const [nfseVerificationCode, setNfseVerificationCode] = useState<string>('');

  // Form states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [showConfirmDiscard, setShowConfirmDiscard] = useState<boolean>(false);
  const [isPatientModalOpen, setIsPatientModalOpen] = useState<boolean>(false);

  // Clean form reset function
  const resetForm = () => {
    setTaxOrigin('CPF');
    const targetPatient = initialPatientId ? patients.find((p) => p.id === initialPatientId) : null;
    setSelectedPatientId(targetPatient?.id || '');
    setPatientName(targetPatient?.name || '');
    setPatientCpf(targetPatient?.cpf || '');
    setPayerIsBeneficiary(true);
    setPayerName('');
    setPayerCpf('');
    setSelectedProcedureId('');
    setIsCustomProcedure(false);
    setProcedureName('');
    setDescription('');
    setTotalValue(0);
    setServiceDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('PIX');
    setInstallmentsCount(1);
    setReceivedNow(bankAccounts.length > 0);
    setReceiptIdentifier('');
    setBankAccountId(db.getPreferredBankAccountId());
    setCardFeePercent(0);
    setNfseStatus('EMITIDA');
    setNfseNumber('');
    setNfseVerificationCode('');
    setIsDirty(false);
    setShowConfirmDiscard(false);
  };

  const handleSafeClose = () => {
    if (isDirty) {
      setShowConfirmDiscard(true);
    } else {
      resetForm();
      onClose();
    }
  };

  // Pre-fill form on edit or reset to clean state on create
  useEffect(() => {
    setIsDirty(false);
    setIsSubmitting(false);
    setShowConfirmDiscard(false);
    if (saleToEdit) {
      setTaxOrigin(saleToEdit.taxOrigin || 'CPF');
      setSelectedPatientId(saleToEdit.patientId || '');
      setPatientName(saleToEdit.patientName || '');
      setPatientCpf(saleToEdit.patientCpf || '');
      setPayerIsBeneficiary(saleToEdit.payerIsBeneficiary !== undefined ? saleToEdit.payerIsBeneficiary : true);
      setPayerName(saleToEdit.payerName || '');
      // Localiza o procedimento no catálogo por ID ou por Nome
      const matchedProc = procedures.find(
        (p) =>
          (saleToEdit.procedureId && p.id === saleToEdit.procedureId) ||
          (p.name &&
            saleToEdit.procedureName &&
            p.name.trim().toLowerCase() === saleToEdit.procedureName.trim().toLowerCase())
      );

      if (matchedProc) {
        setSelectedProcedureId(matchedProc.id);
        setIsCustomProcedure(false);
        setProcedureName(matchedProc.name);
      } else {
        setSelectedProcedureId('CUSTOM');
        setIsCustomProcedure(true);
        setProcedureName(saleToEdit.procedureName || '');
      }

      // Sanitizar descrição: não preencher texto gerado automaticamente
      const rawDesc = saleToEdit.description || '';
      const lowerDesc = rawDesc.toLowerCase().trim();
      const procLower = (saleToEdit.procedureName || '').toLowerCase().trim();
      if (
        lowerDesc.startsWith('atendimento clínico') ||
        lowerDesc === procLower ||
        lowerDesc === `atendimento clínico - ${procLower}`
      ) {
        setDescription('');
      } else {
        setDescription(rawDesc);
      }

      setTotalValue(saleToEdit.totalValue || 0);
      setServiceDate(saleToEdit.serviceDate || new Date().toISOString().split('T')[0]);
      setPaymentMethod(saleToEdit.paymentMethod || 'PIX');
      setInstallmentsCount(saleToEdit.installmentsCount || saleToEdit.installments?.length || 1);
      const firstInst = saleToEdit.installments?.[0];
      setReceivedNow(firstInst ? firstInst.status === 'RECEBIDO' : false);
      setReceiptIdentifier(firstInst?.receitaSaudeId || '');
      setNfseStatus(saleToEdit.nfseStatus || 'EMITIDA');
      setNfseNumber(saleToEdit.nfseNumber || '');
      setNfseVerificationCode(saleToEdit.nfseVerificationCode || '');
      setCardFeePercent(saleToEdit.cardFeePercent || saleToEdit.installments?.[0]?.cardFeePercent || 0);
      setBankAccountId(saleToEdit.bankAccountId || saleToEdit.installments?.[0]?.bankAccountId || bankAccounts[0]?.id || '');
    } else {
      resetForm();
    }
  }, [saleToEdit, isOpen, initialPatientId, patients]);

  const selectedProcedure = procedures.find((p) => p.id === selectedProcedureId);

  const isCard = paymentMethod === 'CARTAO_CREDITO' || paymentMethod === 'CARTAO_DEBITO';
  const cardFeeAmount = isCard && cardFeePercent > 0 ? Number(((totalValue * cardFeePercent) / 100).toFixed(2)) : 0;
  const netValue = isCard ? Math.max(0, Number((totalValue - cardFeeAmount).toFixed(2))) : totalValue;

  const getAutoCardFee = (method: PaymentMethod, installments: number): number => {
    const prefs = db.getPreferences();
    if (method === 'CARTAO_DEBITO') {
      return prefs.cardFees?.debit || 0;
    }
    if (method === 'CARTAO_CREDITO') {
      return prefs.cardFees?.credit?.[installments] ?? (prefs.cardFees?.credit?.[1] || 0);
    }
    return 0;
  };

  const handlePaymentMethodChange = (newMethod: PaymentMethod) => {
    setPaymentMethod(newMethod);
    setIsDirty(true);
    if (newMethod === 'CARTAO_DEBITO') {
      const fee = getAutoCardFee('CARTAO_DEBITO', 1);
      setCardFeePercent(fee);
      setInstallmentsCount(1);
    } else if (newMethod === 'CARTAO_CREDITO') {
      const fee = getAutoCardFee('CARTAO_CREDITO', installmentsCount);
      setCardFeePercent(fee);
    } else {
      setCardFeePercent(0);
      setInstallmentsCount(1);
    }
  };

  const handleInstallmentsChange = (count: number) => {
    setInstallmentsCount(count);
    setIsDirty(true);
    if (paymentMethod === 'CARTAO_CREDITO') {
      const autoFee = getAutoCardFee('CARTAO_CREDITO', count);
      if (autoFee > 0 || cardFeePercent === 0) {
        setCardFeePercent(autoFee);
      }
    }
  };

  const bankAccountOptions = bankAccounts.map((b) => {
    const isPj = b.accountType === 'CORRENTE_PJ';
    return {
      value: b.id,
      label: `${b.isPreferred ? '⭐ ' : ''}${b.name}${b.isPreferred ? ' (Principal)' : ''}`,
      description: `${b.isPreferred ? 'Conta Padrão • ' : ''}${
        isPj ? 'Conta Jurídica (PJ)' : 'Conta Física (CPF)'
      } • Saldo: ${formatCurrency(b.currentBalance)}`,
    };
  });

  const handleProcedureSelect = (procId: string) => {
    setSelectedProcedureId(procId);
    if (procId === 'CUSTOM') {
      setIsCustomProcedure(true);
      setProcedureName('');
    } else {
      setIsCustomProcedure(false);
      const found = procedures.find((p) => p.id === procId);
      if (found) {
        setProcedureName(found.name);
        if (found.defaultPrice !== undefined && found.defaultPrice !== null && found.defaultPrice > 0) {
          setTotalValue(found.defaultPrice);
          setIsDirty(true);
        }
      }
    }
  };

  // Auto update patient info when selected
  const handleSelectPatient = (id: string) => {
    setSelectedPatientId(id);
    const pat = patients.find((p) => p.id === id);
    if (pat) {
      setPatientName(pat.name);
      setPatientCpf(pat.cpf);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const finalPatientName = patientName;
    const finalPatientCpf = patientCpf;
    const finalPatientId = selectedPatientId;

    if (!finalPatientName.trim() || !finalPatientId) {
      toast.warning('Por favor, selecione um paciente para a receita.');
      return;
    }

    if (!procedureName.trim()) {
      toast.warning('Por favor, selecione ou informe o procedimento odontológico.');
      return;
    }

    if (totalValue <= 0) {
      toast.warning('O valor total da receita deve ser maior que zero.');
      return;
    }

    if (receivedNow && (!bankAccountId || bankAccountId.trim() === '')) {
      toast.warning('A seleção da conta bancária de recebimento é obrigatória para receitas recebidas no ato. Desmarque o recebimento imediato para salvar como "A Receber" ou cadastre uma conta.');
      return;
    }

    if (paymentMethod === 'CARTAO_CREDITO' && installmentsCount > 1 && cardFeePercent <= 0) {
      toast.warning('Para vendas parceladas no cartão de crédito, informe a taxa da maquininha (%).');
      return;
    }

    setIsSubmitting(true);
    try {
      const effectiveInstallmentsCount = paymentMethod === 'CARTAO_CREDITO' ? installmentsCount : 1;

      // Auto-cadastrar procedimento avulso no catálogo com status "Cadastro Incompleto"
      let finalProcId = selectedProcedureId;
      if (isCustomProcedure || selectedProcedureId === 'CUSTOM' || !selectedProcedureId) {
        const existing = procedures.find(
          (p) => p.name.trim().toLowerCase() === procedureName.trim().toLowerCase()
        );
        if (existing) {
          finalProcId = existing.id;
        } else {
          const createdProc = db.addProcedure({
            code: `AVULSO-${Date.now().toString().slice(-4)}`,
            name: procedureName.trim(),
            category: 'OUTROS',
            description: description || 'Procedimento avulso registrado em receita',
            clinicalDurationMinutes: 30,
            professionalHourlyRate: 150,
            inputs: [],
            labCost: 0,
            suggestedPrice: totalValue,
            defaultPrice: totalValue,
            active: true,
            isIncomplete: true,
          });
          finalProcId = createdProc.id;
          toast.info(`Procedimento "${procedureName}" adicionado ao catálogo como "Cadastro Incompleto".`);
        }
      }

      if (isEditing && saleToEdit) {
        const existingInstallments = saleToEdit.installments || [];
        const installments: SaleInstallment[] = [];
        const installmentValue = Number((totalValue / effectiveInstallmentsCount).toFixed(2));
        let accumulated = 0;

        for (let i = 1; i <= effectiveInstallmentsCount; i++) {
          const val = i === effectiveInstallmentsCount ? totalValue - accumulated : installmentValue;
          accumulated += val;

          const prevInst = existingInstallments[i - 1];
          const dueDateObj = new Date(serviceDate);
          dueDateObj.setMonth(dueDateObj.getMonth() + (i - 1));
          const dueDateStr = prevInst ? prevInst.dueDate : dueDateObj.toISOString().split('T')[0];

          const wasPaid = prevInst ? prevInst.status === 'RECEBIDO' : (receivedNow && i === 1);

          let receitaStatus: ReceitaSaudeStatus | undefined = prevInst?.receitaSaudeStatus;
          let receitaId: string | undefined = prevInst?.receitaSaudeId;

          if (taxOrigin === 'CPF') {
            if (wasPaid) {
              receitaStatus = receiptIdentifier.trim() ? 'EMITIDO' : (prevInst?.receitaSaudeStatus || 'A_EMITIR');
              receitaId = receiptIdentifier.trim() || prevInst?.receitaSaudeId || undefined;
            } else {
              receitaStatus = prevInst?.receitaSaudeStatus || 'A_EMITIR';
            }
          }

          const instCardFee = isCard && cardFeePercent > 0 ? Number(((val * cardFeePercent) / 100).toFixed(2)) : 0;
          const instNetVal = isCard ? Number((val - instCardFee).toFixed(2)) : val;

          installments.push({
            id: prevInst ? prevInst.id : `inst_${Date.now()}_${i}`,
            saleId: saleToEdit.id,
            installmentNumber: i,
            totalInstallments: effectiveInstallmentsCount,
            value: val,
            cardFeePercent: isCard && cardFeePercent > 0 ? cardFeePercent : undefined,
            cardFeeAmount: isCard && instCardFee > 0 ? instCardFee : undefined,
            netValue: instNetVal,
            dueDate: dueDateStr,
            paymentDate: wasPaid ? (prevInst?.paymentDate || serviceDate) : undefined,
            amountReceived: wasPaid ? (prevInst?.amountReceived || instNetVal) : undefined,
            status: wasPaid ? 'RECEBIDO' : 'A_RECEBER',
            receitaSaudeStatus: receitaStatus,
            receitaSaudeId: receitaId,
            receitaSaudeEmittedAt: receitaStatus === 'EMITIDO' ? (prevInst?.receitaSaudeEmittedAt || new Date().toISOString()) : undefined,
            paymentMethod: paymentMethod,
            bankAccountId,
          });
        }

        db.updateSale(saleToEdit.id, {
          taxOrigin,
          patientId: finalPatientId,
          patientName: finalPatientName,
          patientCpf: finalPatientCpf,
          payerIsBeneficiary,
          payerName: !payerIsBeneficiary ? payerName : undefined,
          payerCpf: !payerIsBeneficiary ? payerCpf.replace(/\D/g, '') : undefined,
          procedureId: finalProcId,
          procedureName,
          description: description || procedureName,
          totalValue,
          cardFeePercent: isCard && cardFeePercent > 0 ? cardFeePercent : undefined,
          cardFeeAmount: isCard && cardFeeAmount > 0 ? cardFeeAmount : undefined,
          netValue: isCard ? netValue : totalValue,
          bankAccountId,
          serviceDate,
          paymentMethod,
          installmentsCount: effectiveInstallmentsCount,
          nfseStatus: taxOrigin === 'CNPJ' ? nfseStatus : undefined,
          nfseNumber: taxOrigin === 'CNPJ' ? nfseNumber : undefined,
          nfseVerificationCode: taxOrigin === 'CNPJ' ? nfseVerificationCode : undefined,
          nfseEmittedAt:
            taxOrigin === 'CNPJ' && nfseStatus === 'EMITIDA'
              ? (saleToEdit.nfseEmittedAt || new Date().toISOString())
              : undefined,
          notes: description?.trim() || undefined,
          installments,
        });
        toast.success('Receita atualizada com sucesso.');
      } else {
        // Generate installments
        const installments: SaleInstallment[] = [];
        const installmentValue = Number((totalValue / effectiveInstallmentsCount).toFixed(2));
        let accumulated = 0;

        for (let i = 1; i <= effectiveInstallmentsCount; i++) {
          const val = i === effectiveInstallmentsCount ? totalValue - accumulated : installmentValue;
          accumulated += val;

          const dueDateObj = new Date(serviceDate);
          dueDateObj.setMonth(dueDateObj.getMonth() + (i - 1));
          const dueDateStr = dueDateObj.toISOString().split('T')[0];

          // If marked as received now and it's installment 1
          const isPaidNow = receivedNow && i === 1;

          let receitaStatus: ReceitaSaudeStatus | undefined = undefined;
          let receitaId: string | undefined = undefined;

          if (taxOrigin === 'CPF') {
            if (isPaidNow) {
              receitaStatus = receiptIdentifier.trim() ? 'EMITIDO' : 'A_EMITIR';
              receitaId = receiptIdentifier.trim() || undefined;
            } else {
              receitaStatus = 'A_EMITIR';
            }
          }

          const instCardFee = isCard && cardFeePercent > 0 ? Number(((val * cardFeePercent) / 100).toFixed(2)) : 0;
          const instNetVal = isCard ? Number((val - instCardFee).toFixed(2)) : val;

          installments.push({
            id: `inst_${Date.now()}_${i}`,
            saleId: '', // will be set by db or model
            installmentNumber: i,
            totalInstallments: effectiveInstallmentsCount,
            value: val,
            cardFeePercent: isCard && cardFeePercent > 0 ? cardFeePercent : undefined,
            cardFeeAmount: isCard && instCardFee > 0 ? instCardFee : undefined,
            netValue: instNetVal,
            dueDate: dueDateStr,
            paymentDate: isPaidNow ? paymentDate : undefined,
            amountReceived: isPaidNow ? instNetVal : undefined,
            status: isPaidNow ? 'RECEBIDO' : 'A_RECEBER',
            receitaSaudeStatus: receitaStatus,
            receitaSaudeId: receitaId,
            receitaSaudeEmittedAt: receitaStatus === 'EMITIDO' ? new Date().toISOString() : undefined,
            paymentMethod: paymentMethod,
            bankAccountId: isPaidNow ? bankAccountId : (bankAccountId || undefined),
          });
        }

        db.addSale({
          taxOrigin,
          patientId: finalPatientId,
          patientName: finalPatientName,
          patientCpf: finalPatientCpf,
          payerIsBeneficiary,
          payerName: !payerIsBeneficiary ? payerName : undefined,
          payerCpf: !payerIsBeneficiary ? payerCpf.replace(/\D/g, '') : undefined,
          procedureId: finalProcId,
          procedureName,
          description: description || procedureName,
          totalValue,
          cardFeePercent: isCard && cardFeePercent > 0 ? cardFeePercent : undefined,
          cardFeeAmount: isCard && cardFeeAmount > 0 ? cardFeeAmount : undefined,
          netValue: isCard ? netValue : totalValue,
          bankAccountId,
          serviceDate,
          paymentMethod,
          installmentsCount: effectiveInstallmentsCount,
          nfseStatus: taxOrigin === 'CNPJ' ? nfseStatus : undefined,
          nfseNumber: taxOrigin === 'CNPJ' ? nfseNumber : undefined,
          nfseVerificationCode: taxOrigin === 'CNPJ' ? nfseVerificationCode : undefined,
          nfseEmittedAt:
            taxOrigin === 'CNPJ' && nfseStatus === 'EMITIDA'
              ? new Date().toISOString()
              : undefined,
          origin: 'MANUAL',
          notes: description?.trim() || undefined,
          installments,
        });
        toast.success('Receita cadastrada com sucesso.');
      }

    setIsDirty(false);
    resetForm();
    if (onSaleCreated) onSaleCreated();
    onClose();
  } finally {
    setIsSubmitting(false);
  }
};

  // Options for custom selects
  const patientOptions = patients.map((p) => ({
    value: p.id,
    label: p.name,
    description: `CPF: ${p.cpf || 'Não informado'}`,
  }));

  const procedureOptions = [
    ...procedures.map((proc) => ({
      value: proc.id,
      label: proc.name,
      description: `Tabela: ${formatCurrency(proc.defaultPrice)} • Duração: ${proc.clinicalDurationMinutes} min`,
      badge: formatCurrency(proc.defaultPrice),
    })),
    {
      value: 'CUSTOM',
      label: '+ Digitar outro procedimento avulso...',
      description: 'Personalizar nome, descrição e preço avulso',
    },
  ];

  const paymentOptions = [
    { value: 'PIX', label: 'PIX' },
    { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito' },
    { value: 'CARTAO_DEBITO', label: 'Cartão de Débito' },
    { value: 'BOLETO', label: 'Boleto Bancário' },
    { value: 'DINHEIRO', label: 'Dinheiro em Espécie' },
    { value: 'TRANSFERENCIA', label: 'Transferência / TED' },
  ];

  const installmentOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({
    value: String(n),
    label: n === 1 ? '1x À vista' : `${n}x de ${formatCurrency(totalValue / n)}`,
  }));

  const nfseStatusOptions = [
    { value: 'EMITIDA', label: 'NFS-e Emitida' },
    { value: 'A_EMITIR', label: 'NFS-e a Emitir' },
    { value: 'CANCELADA', label: 'Cancelada' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-200/80 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-7 py-5 bg-white border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">
                Atendimento Clínico
              </span>
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight mt-0.5">
              {isEditing ? 'Editar Receita Odontológica' : 'Nova Receita Odontológica'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEditing
                ? 'Atualize os dados do atendimento ou altere a destinação tributária'
                : 'Lançamento com segregação inteligente entre Carnê-Leão (PF) e Simples Nacional (PJ)'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSafeClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-7 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* 1. SEÇÃO DE ORIGEM TRIBUTÁRIA */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <span>1. Origem Tributária da Operação</span>
              <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTaxOrigin('CPF')}
                className={`flex flex-col items-start p-4 rounded-2xl border transition-all cursor-pointer text-left shadow-2xs ${
                  taxOrigin === 'CPF'
                    ? 'border-emerald-600 bg-emerald-50/50 text-slate-900 ring-3 ring-emerald-500/15'
                    : 'border-slate-200/90 bg-white hover:border-slate-300 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <User className={`w-4 h-4 ${taxOrigin === 'CPF' ? 'text-emerald-700' : 'text-slate-400'}`} />
                    <span>CPF • Pessoa Física</span>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800">
                    Carnê-Leão
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                  Documento: <strong className="text-emerald-950 font-semibold">Receita Saúde</strong> (Regime de Caixa)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTaxOrigin('CNPJ')}
                className={`flex flex-col items-start p-4 rounded-2xl border transition-all cursor-pointer text-left shadow-2xs ${
                  taxOrigin === 'CNPJ'
                    ? 'border-blue-600 bg-blue-50/50 text-slate-900 ring-3 ring-blue-500/15'
                    : 'border-slate-200/90 bg-white hover:border-slate-300 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Building className={`w-4 h-4 ${taxOrigin === 'CNPJ' ? 'text-blue-700' : 'text-slate-400'}`} />
                    <span>CNPJ • Pessoa Jurídica</span>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800">
                    Simples Nacional
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                  Documento: <strong className="text-blue-950 font-semibold">NFS-e Municipal</strong> (Impacta Fator R)
                </span>
              </button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5">
            {/* 2. PACIENTE & TOMADOR */}
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                2. {taxOrigin === 'CPF' ? 'Paciente / Beneficiário' : 'Paciente / Tomador'}
              </label>
              <button
                type="button"
                onClick={() => setIsPatientModalOpen(true)}
                className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Novo Paciente</span>
              </button>
            </div>

            {selectedPatientId && (patients.find((p) => p.id === selectedPatientId) || patientName) ? (
              (() => {
                const pat = patients.find((p) => p.id === selectedPatientId);
                const displayName = pat?.name || patientName;
                const displayCpf = pat?.cpf || patientCpf;
                const displayPhone = pat?.phone;
                const initials = displayName
                  .split(' ')
                  .map((n) => n[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || 'PA';

                return (
                  <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl flex items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-150">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0 truncate">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {displayName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                          <span>CPF: {formatCpf(displayCpf, false) || 'Não informado'}</span>
                          {displayPhone && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span>{displayPhone}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatientId('');
                        setPatientName('');
                        setPatientCpf('');
                        setIsDirty(true);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 border border-slate-200 rounded-xl transition-colors shrink-0 cursor-pointer"
                    >
                      Trocar
                    </button>
                  </div>
                );
              })()
            ) : (
              <div className="space-y-2">
                <PatientSearchSelect
                  patients={patients}
                  value={selectedPatientId}
                  onChange={(patient) => {
                    setSelectedPatientId(patient.id);
                    setPatientName(patient.name);
                    setPatientCpf(patient.cpf);
                    setIsDirty(true);
                  }}
                  placeholder="Buscar paciente por nome ou CPF..."
                />
              </div>
            )}

            {/* If CPF: Pagador Details */}
            {taxOrigin === 'CPF' && (
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={payerIsBeneficiary}
                    onChange={(e) => {
                      setPayerIsBeneficiary(e.target.checked);
                      setIsDirty(true);
                    }}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>O pagador é o próprio beneficiário do tratamento</span>
                </label>

                {!payerIsBeneficiary && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl animate-in fade-in">
                    <div>
                      <label className="block text-[11px] font-bold text-amber-900 mb-1">
                        Nome do Responsável Financeiro (Pagador)
                      </label>
                      <input
                        type="text"
                        placeholder=""
                        value={payerName}
                        onChange={(e) => {
                          setPayerName(e.target.value);
                          setIsDirty(true);
                        }}
                        className="w-full text-xs rounded-xl border border-amber-200 p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none shadow-2xs"
                        required={!payerIsBeneficiary}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-amber-900 mb-1">
                        CPF do Pagador
                      </label>
                      <input
                        type="text"
                        placeholder="000.000.000-00"
                        maxLength={14}
                        value={payerCpf}
                        onChange={(e) => {
                          setPayerCpf(formatCpf(e.target.value));
                          setIsDirty(true);
                        }}
                        className="w-full text-xs rounded-xl border border-amber-200 p-2.5 bg-white font-mono text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none shadow-2xs"
                        required={!payerIsBeneficiary}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-5">
            {/* 3. PROCEDIMENTO ODONTOLÓGICO */}
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                3. Procedimento Odontológico
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsCustomProcedure(!isCustomProcedure);
                  setIsDirty(true);
                }}
                className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 cursor-pointer"
              >
                {isCustomProcedure ? 'Selecionar do Catálogo' : '+ Procedimento Avulso'}
              </button>
            </div>

            {!isCustomProcedure ? (
              <div className="space-y-2">
                <CustomSelect
                  options={procedureOptions}
                  value={selectedProcedureId}
                  onChange={(val) => {
                    handleProcedureSelect(val);
                    setIsDirty(true);
                  }}
                  placeholder="Selecione um procedimento cadastrado..."
                />

                {selectedProcedure && selectedProcedure.isIncomplete && (
                  <div className="p-3 bg-amber-50/90 border border-amber-200/90 rounded-xl text-xs flex items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-2 text-amber-900">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Este procedimento possui <strong>Cadastro Incompleto</strong> no catálogo (sem insumos ou custos detalhados). Você pode salvar a receita normalmente.
                      </span>
                    </div>
                  </div>
                )}

                {selectedProcedure && !selectedProcedure.isIncomplete && (() => {
                  const procMargin = safeMargin(selectedProcedure.defaultPrice, selectedProcedure.totalDirectCost);
                  return (
                    <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-emerald-950 font-medium">
                        ⏱ Duração: <strong className="font-bold">{selectedProcedure.clinicalDurationMinutes} min</strong> • Custo Direto (Hora + Insumos): <strong className="font-bold font-mono">{formatCurrency(selectedProcedure.totalDirectCost)}</strong>
                      </span>
                      <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10.5px]">
                        {procMargin.status === 'OK'
                          ? `Margem: ${formatPercent(procMargin.marginPercent, '0%', 0)}`
                          : procMargin.status === 'WAITING_COSTS'
                          ? 'Aguardando custos'
                          : 'Sem preço'}
                      </span>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  placeholder=""
                  value={procedureName}
                  onChange={(e) => setProcedureName(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none shadow-2xs"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Este procedimento avulso será salvo no catálogo com o status <strong>"Cadastro Incompleto"</strong> para precificação futura.</span>
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-5 space-y-4">
            {/* 4. CONDIÇÕES FINANCEIRAS & VALORES */}
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              4. Condições Financeiras & Pagamento
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* DatePicker Customizado */}
              <DatePicker
                label="Data de Vencimento"
                value={serviceDate}
                onChange={setServiceDate}
                required
              />

              {/* CurrencyInput BRL em Tempo Real com Referência de Tabela */}
              <div>
                <CurrencyInput
                  label="Valor Total (Bruto)"
                  value={totalValue}
                  onChange={(val) => {
                    setTotalValue(val);
                    setIsDirty(true);
                  }}
                  required
                />
                {selectedProcedure && selectedProcedureId !== 'CUSTOM' && (
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1 px-0.5">
                    <span>Tabela: <strong className="font-mono text-slate-700">{formatCurrency(selectedProcedure.defaultPrice)}</strong></span>
                    {totalValue !== selectedProcedure.defaultPrice ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTotalValue(selectedProcedure.defaultPrice);
                          setIsDirty(true);
                        }}
                        className="text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer underline text-[10.5px]"
                      >
                        Aplicar tabela
                      </button>
                    ) : (
                      <span className="text-emerald-700 font-bold text-[10.5px] flex items-center gap-1">
                        ✓ Aplicado
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* CustomSelect para Forma de Pagamento */}
              <CustomSelect
                label="Forma de Pagamento"
                options={paymentOptions}
                value={paymentMethod}
                onChange={(val) => {
                  handlePaymentMethodChange(val as PaymentMethod);
                }}
              />
            </div>

            {/* Conta Bancária e Quitação Imediata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <CustomSelect
                label={receivedNow ? "Conta Bancária de Recebimento *" : "Conta Bancária de Recebimento (Opcional)"}
                options={bankAccountOptions}
                value={bankAccountId}
                onChange={(val) => {
                  setBankAccountId(val);
                  setIsDirty(true);
                }}
                required={receivedNow}
                placeholder={bankAccounts.length === 0 ? "Nenhuma conta cadastrada" : receivedNow ? "Selecione a conta bancária..." : "Conta bancária opcional..."}
              />

              {bankAccounts.length === 0 ? (
                <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-900 flex items-start gap-2 h-[42px] overflow-hidden">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Sem contas bancárias. A receita será salva como <strong>"A Receber"</strong>.
                  </span>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 flex items-center h-[42px]">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={receivedNow}
                      onChange={(e) => {
                        setReceivedNow(e.target.checked);
                        setIsDirty(true);
                      }}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span>
                      {paymentMethod === 'CARTAO_CREDITO' && installmentsCount > 1
                        ? '1ª parcela já recebida no ato'
                        : 'Valor recebido integralmente no ato'}
                    </span>
                  </label>
                </div>
              )}
            </div>

            {receivedNow && (
              <div className="max-w-xs animate-in fade-in">
                <DatePicker
                  label="Data do Recebimento"
                  value={paymentDate}
                  onChange={(d) => {
                    setPaymentDate(d);
                    setIsDirty(true);
                  }}
                  required
                />
              </div>
            )}

            {/* Descrição do serviço */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Descrição do Atendimento (Opcional)
              </label>
              <input
                type="text"
                placeholder=""
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none shadow-2xs"
              />
            </div>

            {/* Parcelamento e Taxa de Maquininha - Suporte a Cartão de Crédito e Débito */}
            {isCard && (
              <div className="space-y-3 pt-1">
                {paymentMethod === 'CARTAO_CREDITO' && (
                  <div className="max-w-xs">
                    <CustomSelect
                      label="Quantidade de Parcelas"
                      options={installmentOptions}
                      value={String(installmentsCount)}
                      onChange={(val) => {
                        handleInstallmentsChange(parseInt(val, 10));
                      }}
                    />
                  </div>
                )}

                {/* Taxa de Maquininha */}
                <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-xs text-slate-900">
                        {paymentMethod === 'CARTAO_DEBITO'
                          ? 'Taxa do Cartão de Débito'
                          : `Taxa da Maquininha / Operadora de Cartão (${installmentsCount}x)`}
                      </span>
                    </div>
                    {paymentMethod === 'CARTAO_CREDITO' && installmentsCount > 1 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        Taxa obrigatória para {installmentsCount}x
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Taxa da Maquininha (%)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="0,00"
                          value={cardFeePercent || ''}
                          onChange={(e) => {
                            setCardFeePercent(parseFloat(e.target.value) || 0);
                            setIsDirty(true);
                          }}
                          className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">%</span>
                      </div>
                    </div>

                    <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-center font-mono">
                      <span className="block text-[10px] text-slate-500 font-sans">Desconto da Taxa</span>
                      <span className="font-bold text-rose-600 text-xs">− {formatCurrency(cardFeeAmount)}</span>
                    </div>

                    <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-center font-mono">
                      <span className="block text-[10px] text-emerald-800 font-sans font-bold">Líquido a Receber</span>
                      <span className="font-black text-emerald-900 text-xs">{formatCurrency(netValue)}</span>
                    </div>
                  </div>

                  <div className="text-[10.5px] text-slate-500 bg-white p-2.5 rounded-xl border border-slate-200/80 leading-relaxed">
                    <strong>Regra Fiscal vs Financeira:</strong> A base tributária ({taxOrigin === 'CPF' ? 'Carnê-Leão' : 'Simples Nacional / NFS-e'}) preserva o <strong>valor bruto ({formatCurrency(totalValue)})</strong>. O crédito bancário registra o <strong>valor líquido ({formatCurrency(netValue)})</strong>.
                  </div>
                </div>

                {installmentsCount > 1 && totalValue > 0 && (
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs flex items-center justify-between animate-in fade-in">
                    <span className="text-slate-600">
                      Plano de Pagamento: <strong className="font-bold text-slate-800">{installmentsCount} parcelas mensais</strong>
                    </span>
                    <span className="font-bold text-slate-900 font-mono">
                      {installmentsCount}x de {formatCurrency(totalValue / installmentsCount)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. DOCUMENTAÇÃO FISCAL E COMPLIANCE */}
          <div className="border-t border-slate-100 pt-5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
              5. Documento Fiscal Obrigatório
            </label>

            {taxOrigin === 'CPF' ? (
              <div className="p-4 bg-emerald-50/60 border border-emerald-200/70 rounded-2xl text-xs space-y-2.5">
                <div className="font-bold text-emerald-950 flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-emerald-700" />
                  <span>Documento Obrigatório: Receita Saúde (Receita Federal)</span>
                </div>
                <p className="text-emerald-800 text-[11px] leading-relaxed">
                  O Receita Saúde vincula cada <strong>PAGAMENTO</strong> efetivamente recebido. Parcelas futuras a receber não compõem a base do Carnê-Leão deste mês.
                </p>
                {receivedNow && (
                  <div className="pt-1">
                    <label className="block text-[11px] font-semibold text-emerald-950 mb-1">
                      Identificador / Recibo Externo Receita Saúde (Opcional agora)
                    </label>
                    <input
                      type="text"
                      placeholder=""
                      value={receiptIdentifier}
                      onChange={(e) => setReceiptIdentifier(e.target.value)}
                      className="w-full text-xs rounded-xl border border-emerald-200/90 p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none shadow-2xs font-mono"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-blue-50/60 border border-blue-200/70 rounded-2xl text-xs space-y-3">
                <div className="font-bold text-blue-950 flex items-center gap-2">
                  <Building className="w-4 h-4 text-blue-700" />
                  <span>Documento Fiscal: Nota Fiscal de Serviços Eletrônica (NFS-e)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <CustomSelect
                    label="Status da NFS-e"
                    options={nfseStatusOptions}
                    value={nfseStatus}
                    onChange={(val) => setNfseStatus(val as NfseStatus)}
                  />

                  <div>
                    <label className="block text-xs font-semibold text-blue-950 mb-1.5">
                      Número da NFS-e
                    </label>
                    <input
                      type="text"
                      placeholder=""
                      value={nfseNumber}
                      onChange={(e) => setNfseNumber(e.target.value)}
                      className="w-full text-xs rounded-xl border border-blue-200/90 p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none shadow-2xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-blue-950 mb-1.5">
                      Cód. Verificação
                    </label>
                    <input
                      type="text"
                      placeholder=""
                      value={nfseVerificationCode}
                      onChange={(e) => setNfseVerificationCode(e.target.value)}
                      className="w-full text-xs rounded-xl border border-blue-200/90 p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none shadow-2xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleSafeClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-xs hover:shadow transition-all cursor-pointer flex items-center gap-2 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>{isEditing ? 'Salvar Alterações' : 'Confirmar Lançamento'}</span>
              )}
            </button>
          </div>
        </form>
      </div>

      <PatientModal
        isOpen={isPatientModalOpen}
        onClose={() => setIsPatientModalOpen(false)}
        onSave={(newPat) => {
          setSelectedPatientId(newPat.id);
          setPatientName(newPat.name);
          setPatientCpf(newPat.cpf);
          setIsDirty(true);
          setIsPatientModalOpen(false);
          toast.success(`Paciente ${newPat.name} cadastrado e selecionado com sucesso!`);
          if (onSaleCreated) {
            onSaleCreated();
          }
        }}
      />

      <ConfirmDialog
        isOpen={showConfirmDiscard}
        title="Descartar alterações?"
        description="Você tem alterações não salvas nesta receita odontológica. Tem certeza de que deseja descartar tudo e sair?"
        confirmText="Descartar alterações"
        cancelText="Continuar editando"
        variant="danger"
        onConfirm={() => {
          setShowConfirmDiscard(false);
          resetForm();
          onClose();
        }}
        onCancel={() => setShowConfirmDiscard(false)}
      />
    </div>
  );
};
