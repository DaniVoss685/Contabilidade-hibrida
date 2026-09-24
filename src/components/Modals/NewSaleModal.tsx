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
import { formatCurrency, formatCpf, formatDateBr } from '../../lib/masks';
import { safeMargin, formatPercent } from '../../lib/mathUtils';
import { DatePicker, CurrencyInput, CustomSelect, PatientSearchSelect, useToast, ConfirmDialog, Switch } from '../UI';
import { PatientModal } from './PatientModal';
import {
  computeFee,
  distributeFee,
  resolveCardFee,
  getActiveBrands,
  findBrand,
  formatFeeRule,
  missingFeeMessage,
  getActiveSettlementProfile,
  settlementProfileLabel,
  computeSettlementDate,
  isAnticipationEnabled,
  resolveReceivingMode,
  receivingModeLabel,
  planCardSchedule,
  receivingModeOptions,
  receivedSwitchLabel,
} from '../../lib/cardFees';
import { CardFeeRule, ReceivingMode } from '../../types';
import { AllocationCardFields } from './AllocationCardFields';
import { AllocationReceivingFields } from './AllocationReceivingFields';
import { suggestedAccountFor } from '../../lib/bankAccounts';
import { evaluateAllocation, planAllocation, validateSplit, getSaleAllocations, isCardMethod, buildSaleInstallments, validateFiscalCoverage, getFiscalCoverage, defaultFiscalCoverage } from '../../lib/salePayments';

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
  const [bankAccount2, setBankAccount2] = useState<string>('');
  const [paymentDate2, setPaymentDate2] = useState<string>(new Date().toISOString().split('T')[0]);
  const [cardBrandId, setCardBrandId] = useState<string>('');
  // Pagamento dividido (até 2 formas). Sem dividir, o fluxo é idêntico ao de sempre.
  const [splitEnabled, setSplitEnabled] = useState<boolean>(false);
  const [amount1, setAmount1] = useState<number>(0);
  const [method2, setMethod2] = useState<PaymentMethod>('PIX');
  const [amount2, setAmount2] = useState<number>(0);
  const [amount2Touched, setAmount2Touched] = useState<boolean>(false);
  const [brand2, setBrand2] = useState<string>('');
  const [installments2, setInstallments2] = useState<number>(1);
  const [receiving2, setReceiving2] = useState<ReceivingMode | ''>('');
  const [receivedNow2, setReceivedNow2] = useState<boolean>(false);
  const [storedFee2, setStoredFee2] = useState<{ key: string; rule: CardFeeRule; brandName?: string } | null>(null);
  // Cobertura do documento fiscal: por padrão o documento cobre a venda toda; parcial é decisão explícita do usuário.
  const [fiscalPartial, setFiscalPartial] = useState<boolean>(false);
  const [covered1, setCovered1] = useState<number>(0);
  const [covered2, setCovered2] = useState<number>(0);
  // Dinheiro em CPF: paciente solicitou recibo/documento? Padrão NÃO (fora do documento e do Carnê-Leão; entra no faturamento).
  const [docRequested1, setDocRequested1] = useState<boolean>(false);
  const [docRequested2, setDocRequested2] = useState<boolean>(false);
  // '' = usar o padrão da clínica; ANTICIPATED/NORMAL = override só desta venda (não altera a configuração global).
  const [receivingOverride, setReceivingOverride] = useState<ReceivingMode | ''>('');
  // Snapshot da taxa de uma venda existente (edição): enquanto bandeira/forma/parcelas
  // não mudarem, a regra gravada é mantida — alterar a configuração nunca muda histórico.
  const [storedFee, setStoredFee] = useState<{ key: string; rule: CardFeeRule; brandName?: string } | null>(null);

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
    setCardBrandId('');
    setBankAccount2('');
    setPaymentDate2(new Date().toISOString().split('T')[0]);
    setReceivingOverride('');
    setStoredFee(null);
    setSplitEnabled(false);
    setAmount1(0);
    setMethod2('PIX');
    setAmount2(0);
    setAmount2Touched(false);
    setBrand2('');
    setInstallments2(1);
    setReceiving2('');
    setReceivedNow2(false);
    setStoredFee2(null);
    setFiscalPartial(false);
    setCovered1(0);
    setCovered2(0);
    setDocRequested1(false);
    setDocRequested2(false);
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
      const fi = saleToEdit.installments?.[0];
      const editMethod = saleToEdit.paymentMethod || 'PIX';
      const editCount = saleToEdit.installmentsCount || saleToEdit.installments?.length || 1;
      setCardBrandId(fi?.cardBrandId || '');
      // Venda existente: o modo gravado no snapshot vence a configuração atual (histórico não muda).
      const storedMode: ReceivingMode | '' = fi?.receivingMode || (fi?.settlementProfile ? 'ANTICIPATED' : fi ? 'NORMAL' : '');
      setReceivingOverride(editMethod === 'CARTAO_CREDITO' || editMethod === 'CARTAO_DEBITO' ? storedMode : '');
      const legacyPct = saleToEdit.cardFeePercent || fi?.cardFeePercent || 0;
      const editRule: CardFeeRule | null = fi?.cardFeeType
        ? { type: fi.cardFeeType, value: fi.cardFeeValue ?? 0 }
        : legacyPct > 0 ? { type: 'PERCENTAGE', value: legacyPct } : null;
      setStoredFee(
        editRule && (editMethod === 'CARTAO_CREDITO' || editMethod === 'CARTAO_DEBITO')
          ? { key: `${fi?.cardBrandId || ''}|${editMethod}|${editMethod === 'CARTAO_DEBITO' ? 1 : editCount}|${storedMode || 'NORMAL'}`, rule: editRule, brandName: fi?.cardBrandName }
          : null
      );
      setBankAccountId(saleToEdit.bankAccountId || saleToEdit.installments?.[0]?.bankAccountId || bankAccounts[0]?.id || '');

      const cov = getFiscalCoverage(saleToEdit);
      const loadedAllocs = getSaleAllocations(saleToEdit);
      setDocRequested1(loadedAllocs[0]?.installments[0]?.documentRequested === true);
      setDocRequested2(loadedAllocs[1]?.installments[0]?.documentRequested === true);
      const defMap = defaultFiscalCoverage(
        loadedAllocs.map((a) => ({ n: a.number, method: a.method, amount: a.amount, documentRequested: a.installments[0]?.documentRequested })),
        saleToEdit.taxOrigin
      );
      const matchesDefault = cov.perAllocation.every((a) => Math.abs((defMap ? defMap[a.number] ?? a.amount : a.amount) - a.covered) < 0.005);
      if (cov.coverage === 'PARCIAL' && !matchesDefault) {
        setFiscalPartial(true);
        setCovered1(cov.perAllocation[0]?.covered || 0);
        setCovered2(cov.perAllocation[1]?.covered || 0);
      } else {
        setFiscalPartial(false);
      }

      // Pagamento dividido: carrega as duas alocações a partir das parcelas (allocationNumber).
      const allocsLoaded = getSaleAllocations(saleToEdit);
      if (allocsLoaded.length > 1) {
        const [al1, al2] = allocsLoaded;
        const f2 = al2.installments[0];
        setSplitEnabled(true);
        setAmount1(al1.amount);
        setAmount2(al2.amount);
        setAmount2Touched(true);
        setMethod2(al2.method);
        setBrand2(f2?.cardBrandId || '');
        setInstallments2(al2.customerInstallments || 1);
        const mode2: ReceivingMode | '' = f2?.receivingMode || (f2?.settlementProfile ? 'ANTICIPATED' : 'NORMAL');
        setReceiving2(isCardMethod(al2.method) ? mode2 : '');
        setReceivedNow2(f2?.status === 'RECEBIDO');
        const rule2: CardFeeRule | null = f2?.cardFeeType ? { type: f2.cardFeeType, value: f2.cardFeeValue ?? 0 } : null;
        setStoredFee2(
          rule2 && isCardMethod(al2.method)
            ? { key: `${f2?.cardBrandId || ''}|${al2.method}|${al2.method === 'CARTAO_DEBITO' ? 1 : al2.customerInstallments || 1}|${mode2 || 'NORMAL'}`, rule: rule2, brandName: f2?.cardBrandName }
            : null
        );
        setReceivedNow(al1.installments[0]?.status === 'RECEBIDO');
        setBankAccount2(f2?.bankAccountId || saleToEdit.bankAccountId || '');
        setPaymentDate2(f2?.paymentDate || new Date().toISOString().split('T')[0]);
        setBankAccountId(al1.installments[0]?.bankAccountId || saleToEdit.bankAccountId || bankAccounts[0]?.id || '');
        setPaymentDate(al1.installments[0]?.paymentDate || paymentDate);
      } else {
        setPaymentDate(saleToEdit.installments?.[0]?.paymentDate || paymentDate);
        setSplitEnabled(false);
        setAmount1(0);
        setAmount2(0);
        setStoredFee2(null);
        setReceivedNow2(false);
      }
    } else {
      resetForm();
    }
  }, [saleToEdit, isOpen, initialPatientId, patients]);

  const selectedProcedure = procedures.find((p) => p.id === selectedProcedureId);

  const cardSettings = db.getPreferences().cardFees;
  const activeBrands = getActiveBrands(cardSettings);
  const settlementProfile = getActiveSettlementProfile(cardSettings);
  const anticipationOn = isAnticipationEnabled(cardSettings);
  const existingInst = saleToEdit?.installments || [];
  const lockedFor = (n: number) => {
    const list = existingInst.filter((i) => (i.allocationNumber || 1) === n);
    return Boolean(isEditing && list.length > 1 && list.some((i) => i.status === 'RECEBIDO'));
  };
  // Venda parcelada já com parcelas recebidas: não trocar o modo (mudaria a quantidade de recebíveis).
  const receivingModeLocked = lockedFor(1);
  const predictedSettlementDate = computeSettlementDate(serviceDate, settlementProfile);

  // Base da taxa = valor DA ALOCAÇÃO (nunca o total da venda quando há divisão).
  const alloc1Amount = splitEnabled ? amount1 : totalValue;
  const a1 = evaluateAllocation(cardSettings, {
    method: paymentMethod,
    amount: alloc1Amount,
    brandId: cardBrandId,
    installments: installmentsCount,
    receivingOverride,
    stored: storedFee,
  });
  const a2 = evaluateAllocation(cardSettings, {
    method: method2,
    amount: amount2,
    brandId: brand2,
    installments: installments2,
    receivingOverride: receiving2,
    stored: storedFee2,
  });
  const isCard = a1.isCard;
  const receivingMode: ReceivingMode = a1.receivingMode;
  const cardMode = a1.mode;
  const effectiveCardInstallments = a1.customerInstallments;
  const currentFeeKey = a1.key;
  const selectedBrand = findBrand(cardSettings, cardBrandId);
  const brandLabel = selectedBrand?.name || (cardBrandId ? storedFee?.brandName : undefined) || (cardBrandId ? 'Bandeira' : 'Padrão / Sem bandeira');
  const feeRule: CardFeeRule | null = a1.feeRule;

  const previewPlan = isCard && feeRule
    ? planCardSchedule({
        gross: alloc1Amount,
        rule: feeRule,
        customerInstallments: paymentMethod === 'CARTAO_CREDITO' ? installmentsCount : 1,
        saleDate: serviceDate,
        mode: receivingMode,
        profile: settlementProfile,
        isCredit: paymentMethod === 'CARTAO_CREDITO',
      })
    : null;

  // O controle marca só o 1º recebível da clínica: com vários recebíveis (crédito normal parcelado) não pode
  // parecer que a venda inteira foi recebida.
  const clinicReceivablesCount = previewPlan
    ? previewPlan.rows.length
    : paymentMethod === 'CARTAO_CREDITO'
    ? installmentsCount
    : 1;
  const receivedLabel = receivedSwitchLabel(clinicReceivablesCount);

  const feeCalc = feeRule ? computeFee(alloc1Amount, feeRule) : { feeAmount: 0, netValue: alloc1Amount };
  const cardFeeAmount = isCard ? feeCalc.feeAmount : 0;
  const netValue = isCard ? feeCalc.netValue : alloc1Amount;
  const cardFeePercent = feeRule?.type === 'PERCENTAGE' ? feeRule.value : 0;
  const feeMissingMessage = isCard && !feeRule && (cardBrandId || activeBrands.length === 0)
    ? `${missingFeeMessage(brandLabel, cardMode, effectiveCardInstallments)} • ${receivingMode === 'ANTICIPATED' ? `Recebimento antecipado (${settlementProfileLabel(settlementProfile)})` : 'Recebimento normal (sem antecipação)'}`
    : null;

  // Alocações da venda (1 ou 2), cada uma com seu próprio estado.
  const allocations = [
    {
      n: 1,
      method: paymentMethod,
      amount: alloc1Amount,
      ev: a1,
      brandId: cardBrandId,
      brandName: selectedBrand?.name || storedFee?.brandName,
      stored: storedFee,
      received: receivedNow,
      documentRequested: docRequested1,
      bankAccountId,
      paymentDate,
      brandBased: a1.isCard && Boolean(a1.feeRule) && Boolean(cardBrandId),
      missing: feeMissingMessage,
    },
    ...(splitEnabled
      ? [
          {
            n: 2,
            method: method2,
            amount: amount2,
            ev: a2,
            brandId: brand2,
            brandName: findBrand(cardSettings, brand2)?.name || storedFee2?.brandName,
            stored: storedFee2,
            received: receivedNow2,
            documentRequested: docRequested2,
            bankAccountId: bankAccount2,
            paymentDate: paymentDate2,
            brandBased: a2.isCard && Boolean(a2.feeRule) && Boolean(brand2),
            missing: null as string | null,
          },
        ]
      : []),
  ];
  const splitCheck = splitEnabled ? validateSplit(totalValue, [amount1, amount2]) : null;
  // Regra da clínica: dinheiro não gera nota (CNPJ) / só entra no documento se solicitado (CPF).
  const defaultCoverageMap = defaultFiscalCoverage(
    allocations.map((al) => ({ n: al.n, method: al.method, amount: al.amount, documentRequested: al.n === 1 ? docRequested1 : docRequested2 })),
    taxOrigin
  );
  const defaultDocumentBase = allocations.reduce((t, al) => t + (defaultCoverageMap ? defaultCoverageMap[al.n] ?? al.amount : al.amount), 0);
  const documentEffectiveBase = fiscalPartial ? covered1 + (splitEnabled ? covered2 : 0) : defaultDocumentBase;
  const documentNotApplicable = documentEffectiveBase <= 0.004;
  const plan2Rows = splitEnabled && a2.isCard && a2.feeRule
    ? planAllocation({ method: method2, amount: amount2, ev: a2, brandBased: Boolean(brand2), saleDate: serviceDate, profile: settlementProfile })
    : null;

  const handlePaymentMethodChange = (newMethod: PaymentMethod) => {
    setPaymentMethod(newMethod);
    setIsDirty(true);
    // Dinheiro -> caixa ("Dinheiro em Espécie", criado uma única vez); demais formas -> conta padrão do tenant.
    if (newMethod === 'DINHEIRO') {
      const cash = db.ensureCashBankAccount();
      setBankAccountId(cash.id);
    } else if (paymentMethod === 'DINHEIRO') {
      setBankAccountId(suggestedAccountFor(newMethod, db.getBankAccounts(), db.getPreferredBankAccountId()));
    }
    if (newMethod === 'CARTAO_DEBITO') {
      setInstallmentsCount(1);
    } else if (newMethod !== 'CARTAO_CREDITO') {
      setCardBrandId('');
      setInstallmentsCount(1);
    }
  };

  const handleInstallmentsChange = (count: number) => {
    setInstallmentsCount(count);
    setIsDirty(true);
  };

  // Sugestão do restante para o pagamento 2 acompanha o valor da venda enquanto o usuário não editou o pagamento 2.
  useEffect(() => {
    if (splitEnabled && !amount2Touched) {
      setAmount2(Math.max(0, Number((totalValue - amount1).toFixed(2))));
    }
  }, [totalValue, splitEnabled]);

  const handleToggleFiscalPartial = (on: boolean) => {
    setFiscalPartial(on);
    if (on) {
      setCovered1(defaultCoverageMap ? defaultCoverageMap[1] ?? alloc1Amount : alloc1Amount);
      setCovered2(splitEnabled ? (defaultCoverageMap ? defaultCoverageMap[2] ?? amount2 : amount2) : 0);
    }
    setIsDirty(true);
  };

  const handleEnableSplit = () => {
    setSplitEnabled(true);
    setAmount1(0);
    setAmount2(0);
    setAmount2Touched(false);
    setBrand2('');
    setInstallments2(1);
    setReceiving2('');
    setReceivedNow2(false);
    setStoredFee2(null);
    const nextMethod: PaymentMethod = paymentMethod === 'PIX' ? 'DINHEIRO' : 'PIX';
    setMethod2(nextMethod);
    setPaymentDate2(new Date().toISOString().split('T')[0]);
    setBankAccount2(nextMethod === 'DINHEIRO' ? db.ensureCashBankAccount().id : suggestedAccountFor(nextMethod, db.getBankAccounts(), db.getPreferredBankAccountId()));
    setIsDirty(true);
  };

  const handleRemoveSplit = () => {
    setSplitEnabled(false);
    setAmount1(0);
    setAmount2(0);
    setAmount2Touched(false);
    setBrand2('');
    setStoredFee2(null);
    setReceivedNow2(false);
    setIsDirty(true);
  };

  // Ajuda de valor restante: ao informar o pagamento 1, sugere o resto para o pagamento 2 (editável).
  const handleAmount1Change = (v: number) => {
    setAmount1(v);
    if (!amount2Touched) setAmount2(Math.max(0, Number((totalValue - v).toFixed(2))));
    setIsDirty(true);
  };

  const handleBrandChange = (id: string) => {
    setCardBrandId(id);
    setIsDirty(true);
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

    for (const al of allocations) {
      if (al.received && (!al.bankAccountId || al.bankAccountId.trim() === '')) {
        toast.warning(`${splitEnabled ? `Pagamento ${al.n}: ` : ''}selecione a conta de recebimento para um valor já recebido (ou desmarque "já recebido" para salvar como "A Receber").`);
        return;
      }
    }

    if (splitCheck && !splitCheck.ok) {
      toast.warning(splitCheck.message || 'Reconcilie os valores do pagamento dividido.');
      return;
    }

    const fiscalCoverageMap: Record<number, number> | null = fiscalPartial
      ? Object.fromEntries(allocations.map((al) => [al.n, al.n === 1 ? covered1 : covered2]))
      : null;
    if (fiscalPartial) {
      const fv = validateFiscalCoverage(totalValue, allocations.map((al) => al.amount), allocations.map((al) => (al.n === 1 ? covered1 : covered2)));
      if (!fv.ok) {
        toast.warning(fv.message || 'Cobertura do documento fiscal inválida.');
        return;
      }
    }

    for (const al of allocations) {
      if (!al.ev.isCard) continue;
      const tag = splitEnabled ? `Pagamento ${al.n}: ` : '';
      if (!al.brandId && !(al.stored && al.stored.key === al.ev.key)) {
        toast.warning(`${tag}Selecione a bandeira do cartão.`);
        return;
      }
      if (!al.ev.feeRule) {
        toast.warning(`${tag}${al.missing || 'Taxa da maquininha não configurada.'}`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
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

      // Recebíveis de TODAS as alocações (cada uma com seu cronograma/taxa). A venda é uma só: bruto = totalValue.
      const built: SaleInstallment[] = buildSaleInstallments({
        allocations: allocations.map((al) => ({
          n: al.n,
          method: al.method,
          amount: al.amount,
          ev: al.ev,
          brandBased: al.brandBased,
          brandId: al.brandId,
          brandName: al.brandName,
          received: al.received,
          documentRequested: al.documentRequested,
          bankAccountId: al.bankAccountId,
          paymentDate: al.paymentDate,
        })),
        split: splitEnabled,
        saleDate: serviceDate,
        paymentDate,
        profile: settlementProfile,
        taxOrigin,
        receiptIdentifier,
        bankAccountId,
        prev: isEditing && saleToEdit ? saleToEdit.installments || [] : [],
        saleId: isEditing && saleToEdit ? saleToEdit.id : '',
        isEditing: Boolean(isEditing && saleToEdit),
        fiscalCoverage: fiscalCoverageMap,
      });

      const sumCents = (vals: number[]) => vals.reduce((t, v) => t + Math.round(v * 100), 0) / 100;
      const totalFees = sumCents(built.map((i) => i.cardFeeAmount || 0));
      const totalNet = sumCents(built.map((i) => i.netValue ?? i.value));
      const saleCommon = {
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
        cardFeePercent: !splitEnabled && cardFeePercent > 0 ? cardFeePercent : undefined,
        cardFeeAmount: totalFees > 0 ? totalFees : undefined,
        netValue: totalNet,
        bankAccountId,
        serviceDate,
        paymentMethod,
        installmentsCount: a1.customerInstallments,
        nfseStatus: taxOrigin === 'CNPJ' ? nfseStatus : undefined,
        nfseNumber: taxOrigin === 'CNPJ' ? nfseNumber : undefined,
        nfseVerificationCode: taxOrigin === 'CNPJ' ? nfseVerificationCode : undefined,
        notes: description?.trim() || undefined,
        installments: built,
      };

      if (isEditing && saleToEdit) {
        db.updateSale(saleToEdit.id, {
          ...saleCommon,
          nfseEmittedAt:
            taxOrigin === 'CNPJ' && nfseStatus === 'EMITIDA'
              ? (saleToEdit.nfseEmittedAt || new Date().toISOString())
              : undefined,
        });
        toast.success('Receita atualizada com sucesso.');
      } else {
        db.addSale({
          ...saleCommon,
          nfseEmittedAt: taxOrigin === 'CNPJ' && nfseStatus === 'EMITIDA' ? new Date().toISOString() : undefined,
          origin: 'MANUAL',
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
    label: n === 1 ? '1x À vista' : `${n}x de ${formatCurrency(alloc1Amount / n)}`,
  }));

  const nfseStatusOptions = [
    { value: 'EMITIDA', label: 'NFS-e Emitida' },
    { value: 'A_EMITIR', label: 'NFS-e a Emitir' },
    { value: 'CANCELADA', label: 'Cancelada' },
  ];

  if (!isOpen) return null;

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

            {/* PAGAMENTO 1 — bloco completo: forma (acima), valor, conta, recebido, data e campos de cartão */}
            <div className={splitEnabled ? 'p-4 border border-emerald-200/80 bg-emerald-50/30 rounded-2xl space-y-4' : 'space-y-4'}>
              {splitEnabled && (
                <>
                  <span className="block text-xs font-bold text-emerald-950">
                    Pagamento 1 — {paymentOptions.find((o) => o.value === paymentMethod)?.label}
                  </span>
                  <div className="max-w-xs">
                    <CurrencyInput label="Valor do pagamento 1" value={amount1} onChange={handleAmount1Change} />
                  </div>
                </>
              )}

              {/* Dinheiro: o paciente solicitou recibo/documento? (CPF) */}
            {paymentMethod === 'DINHEIRO' && taxOrigin === 'CPF' && (
              <div className="max-w-sm">
                <Switch
                  id="doc-requested-1"
                  checked={docRequested1}
                  onChange={(v) => {
                    setDocRequested1(v);
                    setIsDirty(true);
                  }}
                  label="Paciente solicitou recibo/documento (dinheiro)"
                  description={docRequested1 ? 'O dinheiro entra no Receita Saúde/Carnê-Leão.' : 'Fora do documento e do Carnê-Leão; continua no faturamento.'}
                  showStatusBadge={false}
                />
              </div>
            )}

              <AllocationReceivingFields
                id="sale-received-now"
                accounts={bankAccounts}
                accountId={bankAccountId}
                onAccount={(v) => {
                  setBankAccountId(v);
                  setIsDirty(true);
                }}
                received={receivedNow}
                onReceived={(v) => {
                  setReceivedNow(v);
                  setIsDirty(true);
                }}
                receivedLabel={receivedLabel}
                date={paymentDate}
                onDate={(d) => {
                  setPaymentDate(d);
                  setIsDirty(true);
                }}
              />

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

                {/* Bandeira + Taxa de Maquininha (por bandeira / modalidade / parcelas) */}
                <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-xs text-slate-900">
                      {paymentMethod === 'CARTAO_DEBITO'
                        ? 'Cartão de Débito'
                        : `Cartão de Crédito (${installmentsCount}x)`}
                    </span>
                  </div>

                  <div className="max-w-xs">
                    <CustomSelect
                      label="Bandeira do cartão *"
                      options={[
                        ...activeBrands.map((b) => ({ value: b.id, label: b.name })),
                        ...(cardBrandId && !selectedBrand
                          ? [{ value: cardBrandId, label: `${storedFee?.brandName || 'Bandeira'} (inativa)` }]
                          : []),
                      ]}
                      value={cardBrandId}
                      onChange={handleBrandChange}
                      placeholder={activeBrands.length === 0 ? 'Nenhuma bandeira cadastrada' : 'Selecione a bandeira...'}
                    />
                  </div>

                  {(anticipationOn || receivingOverride) && (
                    <div className="max-w-xs">
                      <CustomSelect
                        label="Recebimento da clínica"
                        options={receivingModeOptions(settlementProfile)}
                        value={receivingMode}
                        onChange={(v) => {
                          if (receivingModeLocked) return;
                          setReceivingOverride(v as ReceivingMode);
                          setIsDirty(true);
                        }}
                      />
                      {receivingModeLocked ? (
                        <p className="text-[10px] text-slate-500 mt-1">Venda com parcelas já recebidas: o modo não pode ser alterado.</p>
                      ) : !isEditing && receivingMode === resolveReceivingMode(cardSettings) ? (
                        <p className="text-[10px] text-slate-500 mt-1">Pré-selecionado conforme configuração da clínica.</p>
                      ) : null}
                    </div>
                  )}

                  {feeMissingMessage && (
                    <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-[11px] text-amber-900 font-semibold">
                      {feeMissingMessage}. Configure em Configurações → Taxas de Cartão &amp; Maquininha.
                    </div>
                  )}

                  {feeRule && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                      <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-center font-mono">
                        <span className="block text-[10px] text-slate-500 font-sans">Taxa total da operadora</span>
                        <span className="font-bold text-slate-800 text-xs">{formatFeeRule(feeRule)}</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-center font-mono">
                        <span className="block text-[10px] text-slate-500 font-sans">Taxa em reais</span>
                        <span className="font-bold text-rose-600 text-xs">− {formatCurrency(cardFeeAmount)}</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-center font-mono">
                        <span className="block text-[10px] text-slate-500 font-sans">Bruto</span>
                        <span className="font-bold text-slate-800 text-xs">{formatCurrency(alloc1Amount)}</span>
                      </div>
                      <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-center font-mono">
                        <span className="block text-[10px] text-emerald-800 font-sans font-bold">Líquido a Receber</span>
                        <span className="font-black text-emerald-900 text-xs">{formatCurrency(netValue)}</span>
                      </div>
                    </div>
                  )}

                  {feeRule && previewPlan && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                      <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                        <span className="block text-[10px] text-slate-500">Parcelas do paciente</span>
                        <strong className="text-slate-800">{paymentMethod === 'CARTAO_CREDITO' ? `${installmentsCount}x` : 'À vista (débito)'}</strong>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                        <span className="block text-[10px] text-slate-500">Recebimento da clínica</span>
                        <strong className="text-slate-800">{receivingModeLabel(receivingMode, settlementProfile)}</strong>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                        <span className="block text-[10px] text-slate-500">
                          {previewPlan.rows.length > 1 ? `${previewPlan.rows.length} recebimentos (1ª → última)` : 'Data prevista do recebimento'}
                        </span>
                        <strong className="text-slate-800">
                          {previewPlan.rows.length > 1
                            ? `${formatDateBr(previewPlan.rows[0].dueDate)} → ${formatDateBr(previewPlan.rows[previewPlan.rows.length - 1].dueDate)}`
                            : formatDateBr(previewPlan.rows[0].dueDate)}
                        </strong>
                      </div>
                    </div>
                  )}

                  <div className="text-[10.5px] text-slate-500 bg-white p-2.5 rounded-xl border border-slate-200/80 leading-relaxed">
                    {receivingMode === 'ANTICIPATED'
                      ? `A taxa do plano antecipado (${settlementProfileLabel(settlementProfile)}) já inclui o custo da antecipação — sem taxa adicional. O parcelamento do paciente não gera recebimentos mensais para a clínica.`
                      : 'Recebimento normal: a clínica recebe conforme o cronograma das parcelas, com a taxa da tabela sem antecipação (rateada entre as parcelas).'}
                  </div>

                  <div className="text-[10.5px] text-slate-500 bg-white p-2.5 rounded-xl border border-slate-200/80 leading-relaxed">
                    <strong>Regra Fiscal vs Financeira:</strong> A base tributária ({taxOrigin === 'CPF' ? 'Carnê-Leão' : 'Simples Nacional / NFS-e'}) preserva o <strong>valor bruto ({formatCurrency(totalValue)})</strong>. O crédito bancário registra o <strong>valor líquido ({formatCurrency(netValue)})</strong>. Taxa fixa é o total da transação (não é multiplicada pelas parcelas).
                  </div>
                </div>

                {installmentsCount > 1 && alloc1Amount > 0 && (
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs flex items-center justify-between animate-in fade-in">
                    <span className="text-slate-600">
                      {paymentMethod === 'CARTAO_CREDITO' && cardBrandId && feeRule && receivingMode === 'ANTICIPATED' ? (
                        <>
                          Paciente parcela em <strong className="font-bold text-slate-800">{installmentsCount}x</strong> • Clínica recebe{' '}
                          <strong className="font-bold text-slate-800">1 vez</strong> ({settlementProfileLabel(settlementProfile)})
                        </>
                      ) : (
                        <>Plano de Pagamento: <strong className="font-bold text-slate-800">{installmentsCount} parcelas mensais</strong></>
                      )}
                    </span>
                    <span className="font-bold text-slate-900 font-mono">
                      {installmentsCount}x de {formatCurrency(alloc1Amount / installmentsCount)}
                    </span>
                  </div>
                )}
              </div>
            )}

            </div>

            {!splitEnabled && (
              <button
                type="button"
                onClick={handleEnableSplit}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
              >
                + Dividir pagamento
              </button>
            )}

            {splitEnabled && (
              <div className="mt-4 space-y-3 p-4 border border-slate-200 rounded-2xl bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">Pagamento 2 — {paymentOptions.find((o) => o.value === method2)?.label}</span>
                  <button type="button" onClick={handleRemoveSplit} className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer">
                    Remover segunda forma
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CustomSelect
                    label="Forma de pagamento"
                    options={paymentOptions}
                    value={method2}
                    onChange={(v) => {
                      setMethod2(v as PaymentMethod);
                      setBankAccount2(v === 'DINHEIRO' ? db.ensureCashBankAccount().id : suggestedAccountFor(v, db.getBankAccounts(), db.getPreferredBankAccountId()));
                      setBrand2('');
                      setStoredFee2(null);
                      setInstallments2(1);
                      setReceiving2('');
                      setIsDirty(true);
                    }}
                  />
                  <CurrencyInput
                    label="Valor do pagamento 2"
                    value={amount2}
                    onChange={(v) => {
                      setAmount2(v);
                      setAmount2Touched(true);
                      setIsDirty(true);
                    }}
                  />
                </div>
                {a2.isCard && (
                  <AllocationCardFields
                    method={method2}
                    amount={amount2}
                    ev={a2}
                    rows={plan2Rows}
                    settings={cardSettings}
                    brandId={brand2}
                    brandName={storedFee2?.brandName}
                    onBrand={(id) => {
                      setBrand2(id);
                      setIsDirty(true);
                    }}
                    installments={installments2}
                    onInstallments={(n) => {
                      setInstallments2(n);
                      setIsDirty(true);
                    }}
                    receivingOverride={receiving2}
                    onReceiving={(m) => {
                      setReceiving2(m);
                      setIsDirty(true);
                    }}
                    locked={lockedFor(2)}
                  />
                )}
                {method2 === 'DINHEIRO' && taxOrigin === 'CPF' && (
                  <Switch
                    id="doc-requested-2"
                    checked={docRequested2}
                    onChange={(v) => {
                      setDocRequested2(v);
                      setIsDirty(true);
                    }}
                    label="Paciente solicitou recibo/documento (dinheiro)"
                    description={docRequested2 ? 'O dinheiro entra no Receita Saúde/Carnê-Leão.' : 'Fora do documento e do Carnê-Leão; continua no faturamento.'}
                    showStatusBadge={false}
                  />
                )}
                <AllocationReceivingFields
                  id="sale-received-now-2"
                  accounts={bankAccounts}
                  accountId={bankAccount2}
                  onAccount={(v) => {
                    setBankAccount2(v);
                    setIsDirty(true);
                  }}
                  received={receivedNow2}
                  onReceived={(v) => {
                    setReceivedNow2(v);
                    setIsDirty(true);
                  }}
                  receivedLabel={receivedSwitchLabel(plan2Rows ? plan2Rows.length : a2.isCard ? installments2 : 1)}
                  date={paymentDate2}
                  onDate={(d) => {
                    setPaymentDate2(d);
                    setIsDirty(true);
                  }}
                />
              </div>
            )}

            {splitEnabled && splitCheck && (
              <div
                className={`mt-3 p-3 rounded-xl border text-xs flex flex-wrap items-center gap-x-6 gap-y-1 ${
                  splitCheck.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-300 text-amber-900'
                }`}
                role="status"
              >
                <span>Valor da venda: <strong>{formatCurrency(totalValue)}</strong></span>
                <span>Alocado: <strong>{formatCurrency(splitCheck.allocated)}</strong></span>
                <span>Restante: <strong>{formatCurrency(Math.max(0, splitCheck.remaining))}</strong></span>
                {!splitCheck.ok && splitCheck.message && <span className="font-bold">{splitCheck.message}</span>}
                {splitCheck.ok && <span className="font-bold">Pagamento conferido.</span>}
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

          </div>

          {/* 5. DOCUMENTAÇÃO FISCAL E COMPLIANCE */}
          <div className="border-t border-slate-100 pt-5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
              5. Documento Fiscal Obrigatório
            </label>

            {defaultCoverageMap && !fiscalPartial && (
              <div className="mb-3 p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/70 text-[11px] text-indigo-950 leading-relaxed" role="status">
                Dinheiro {taxOrigin === 'CNPJ' ? 'não gera nota fiscal' : 'sem documento solicitado fica fora do documento e do Carnê-Leão'}: base do documento{' '}
                <strong>{formatCurrency(defaultDocumentBase)}</strong> de <strong>{formatCurrency(totalValue)}</strong>. O valor total continua no faturamento.
                {documentNotApplicable && <strong> Nenhum documento a emitir nesta venda.</strong>}
              </div>
            )}

            {taxOrigin === 'CPF' ? (
              <div className="p-4 bg-emerald-50/60 border border-emerald-200/70 rounded-2xl text-xs space-y-2.5">
                <div className="font-bold text-emerald-950 flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-emerald-700" />
                  <span>Documento Obrigatório: Receita Saúde (Receita Federal)</span>
                </div>
                <p className="text-emerald-800 text-[11px] leading-relaxed">
                  O Receita Saúde vincula cada <strong>PAGAMENTO</strong> efetivamente recebido. Parcelas futuras a receber não compõem a base do Carnê-Leão deste mês.
                </p>
                {(receivedNow || (splitEnabled && receivedNow2)) && (
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
            ) : documentNotApplicable ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700">
                Venda 100% em dinheiro: sem NFS-e a emitir.
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

            {/* Cobertura do documento fiscal — independente da forma de pagamento e do faturamento */}
            <div className="mt-3 p-4 bg-white border border-slate-200 rounded-2xl space-y-3 text-xs">
              <Switch
                id="fiscal-partial"
                checked={fiscalPartial}
                onChange={handleToggleFiscalPartial}
                label="O documento cobre somente parte da venda"
                description="Por padrão o documento cobre o valor total. A escolha é sua e não depende da forma de pagamento."
                showStatusBadge={false}
              />
              {fiscalPartial && (
                <div className="space-y-3 animate-in fade-in">
                  <div className={`grid grid-cols-1 ${splitEnabled ? 'sm:grid-cols-2' : ''} gap-3`}>
                    {allocations.map((al) => (
                      <CurrencyInput
                        key={al.n}
                        label={
                          splitEnabled
                            ? `Coberto pelo documento — Pagamento ${al.n} (${paymentOptions.find((o) => o.value === al.method)?.label} • ${formatCurrency(al.amount)})`
                            : 'Valor do documento fiscal'
                        }
                        value={al.n === 1 ? covered1 : covered2}
                        onChange={(v) => {
                          if (al.n === 1) setCovered1(v);
                          else setCovered2(v);
                          setIsDirty(true);
                        }}
                      />
                    ))}
                  </div>
                  {(() => {
                    const fv = validateFiscalCoverage(totalValue, allocations.map((al) => al.amount), allocations.map((al) => (al.n === 1 ? covered1 : covered2)));
                    return (
                      <div
                        className={`p-3 rounded-xl border flex flex-wrap gap-x-6 gap-y-1 ${fv.ok ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-amber-50 border-amber-300 text-amber-900'}`}
                        role="status"
                      >
                        <span>Venda: <strong>{formatCurrency(totalValue)}</strong></span>
                        <span>Documento: <strong>{formatCurrency(fv.total)}</strong></span>
                        <span>Não coberto pelo documento: <strong>{formatCurrency(Math.max(0, fv.uncovered))}</strong></span>
                        {!fv.ok && fv.message && <span className="font-bold">{fv.message}</span>}
                        <span className="w-full text-[10.5px] text-slate-500">O faturamento gerencial continua sendo o valor total da venda.</span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
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
