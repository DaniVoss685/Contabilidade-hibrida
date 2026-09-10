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
import { formatCurrency } from '../../lib/masks';

interface NewSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  onSaleCreated?: () => void;
  saleToEdit?: Sale | null;
}

export const NewSaleModal: React.FC<NewSaleModalProps> = ({
  isOpen,
  onClose,
  patients,
  onSaleCreated,
  saleToEdit,
}) => {
  if (!isOpen) return null;

  const isEditing = Boolean(saleToEdit);

  // 1. Mandatory First Field: ORIGEM TRIBUTÁRIA
  const [taxOrigin, setTaxOrigin] = useState<TaxOrigin>('CPF');

  // Common Fields
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    patients[0]?.id || ''
  );
  const [patientName, setPatientName] = useState<string>(patients[0]?.name || '');
  const [patientCpf, setPatientCpf] = useState<string>(patients[0]?.cpf || '');

  // Quick Patient creation toggle
  const [isNewPatient, setIsNewPatient] = useState<boolean>(false);
  const [newPatientName, setNewPatientName] = useState<string>('');
  const [newPatientCpf, setNewPatientCpf] = useState<string>('');

  // CPF Specific Fields: Payer
  const [payerIsBeneficiary, setPayerIsBeneficiary] = useState<boolean>(true);
  const [payerName, setPayerName] = useState<string>('');
  const [payerCpf, setPayerCpf] = useState<string>('');

  // Available registered procedures
  const procedures = db.getProcedures();
  const [selectedProcedureId, setSelectedProcedureId] = useState<string>(
    procedures[0]?.id || 'CUSTOM'
  );
  const [isCustomProcedure, setIsCustomProcedure] = useState<boolean>(false);

  // Procedure and Values
  const [procedureName, setProcedureName] = useState<string>(
    procedures[0]?.name || 'Restauração em Resina Composta'
  );
  const [description, setDescription] = useState<string>(
    procedures[0]?.description || ''
  );
  const [totalValue, setTotalValue] = useState<number>(
    procedures[0]?.defaultPrice || 380
  );

  const [serviceDate, setServiceDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [installmentsCount, setInstallmentsCount] = useState<number>(1);

  // Cash / immediate receipt toggle (se já foi recebido no ato)
  const [receivedNow, setReceivedNow] = useState<boolean>(true);
  const [receiptIdentifier, setReceiptIdentifier] = useState<string>(''); // e.g. RS-2025-05-... or NFS-e

  // CNPJ Specific: NFS-e
  const [nfseStatus, setNfseStatus] = useState<NfseStatus>('EMITIDA');
  const [nfseNumber, setNfseNumber] = useState<string>('');
  const [nfseVerificationCode, setNfseVerificationCode] = useState<string>('');

  // Pre-fill form on edit or reset on create
  useEffect(() => {
    if (saleToEdit) {
      setTaxOrigin(saleToEdit.taxOrigin || 'CPF');
      setSelectedPatientId(saleToEdit.patientId || patients[0]?.id || '');
      setPatientName(saleToEdit.patientName || '');
      setPatientCpf(saleToEdit.patientCpf || '');
      setIsNewPatient(false);
      setPayerIsBeneficiary(saleToEdit.payerIsBeneficiary !== undefined ? saleToEdit.payerIsBeneficiary : true);
      setPayerName(saleToEdit.payerName || '');
      setPayerCpf(saleToEdit.payerCpf || '');
      setSelectedProcedureId('CUSTOM');
      setIsCustomProcedure(true);
      setProcedureName(saleToEdit.procedureName || '');
      setDescription(saleToEdit.description || '');
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
    } else {
      setTaxOrigin('CPF');
      setSelectedPatientId(patients[0]?.id || '');
      setPatientName(patients[0]?.name || '');
      setPatientCpf(patients[0]?.cpf || '');
      setIsNewPatient(false);
      setPayerIsBeneficiary(true);
      setPayerName('');
      setPayerCpf('');
      setSelectedProcedureId(procedures[0]?.id || 'CUSTOM');
      setIsCustomProcedure(false);
      setProcedureName(procedures[0]?.name || 'Restauração em Resina Composta');
      setDescription(procedures[0]?.description || '');
      setTotalValue(procedures[0]?.defaultPrice || 380);
      setServiceDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('PIX');
      setInstallmentsCount(1);
      setReceivedNow(true);
      setReceiptIdentifier('');
      setNfseStatus('EMITIDA');
      setNfseNumber('');
      setNfseVerificationCode('');
    }
  }, [saleToEdit, isOpen]);

  const selectedProcedure = procedures.find((p) => p.id === selectedProcedureId);

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
        setTotalValue(found.defaultPrice);
        if (found.description) {
          setDescription(found.description);
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

    let finalPatientName = patientName;
    let finalPatientCpf = patientCpf;
    let finalPatientId = selectedPatientId;

    if (isNewPatient) {
      if (!newPatientName.trim() || !newPatientCpf.trim()) {
        alert('Por favor, informe o nome e CPF do novo paciente.');
        return;
      }
      const created = db.addPatient({
        name: newPatientName.trim(),
        cpf: newPatientCpf.replace(/\D/g, ''),
      });
      finalPatientId = created.id;
      finalPatientName = created.name;
      finalPatientCpf = created.cpf;
    }

    if (totalValue <= 0) {
      alert('O valor total da receita deve ser maior que zero.');
      return;
    }

    if (isEditing && saleToEdit) {
      const existingInstallments = saleToEdit.installments || [];
      const installments: SaleInstallment[] = [];
      const installmentValue = Number((totalValue / installmentsCount).toFixed(2));
      let accumulated = 0;

      for (let i = 1; i <= installmentsCount; i++) {
        const val = i === installmentsCount ? totalValue - accumulated : installmentValue;
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
            receitaId = receiptIdentifier.trim() || prevInst?.receitaSaudeId;
          } else {
            receitaStatus = 'A_EMITIR';
          }
        }

        installments.push({
          id: prevInst ? prevInst.id : `inst_${Date.now()}_${i}`,
          saleId: saleToEdit.id,
          installmentNumber: i,
          totalInstallments: installmentsCount,
          value: val,
          dueDate: dueDateStr,
          paymentDate: wasPaid ? (prevInst?.paymentDate || serviceDate) : undefined,
          amountReceived: wasPaid ? val : undefined,
          status: wasPaid ? 'RECEBIDO' : 'A_RECEBER',
          receitaSaudeStatus: receitaStatus,
          receitaSaudeId: receitaId,
          receitaSaudeEmittedAt: receitaStatus === 'EMITIDO' ? (prevInst?.receitaSaudeEmittedAt || new Date().toISOString()) : undefined,
          paymentMethod: paymentMethod,
          bankAccountId: prevInst?.bankAccountId || (taxOrigin === 'CPF' ? 'bank_01' : 'bank_02'),
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
        procedureName,
        description: description || procedureName,
        totalValue,
        serviceDate,
        paymentMethod,
        installmentsCount,
        nfseStatus: taxOrigin === 'CNPJ' ? nfseStatus : undefined,
        nfseNumber: taxOrigin === 'CNPJ' ? nfseNumber : undefined,
        nfseVerificationCode: taxOrigin === 'CNPJ' ? nfseVerificationCode : undefined,
        nfseEmittedAt:
          taxOrigin === 'CNPJ' && nfseStatus === 'EMITIDA'
            ? (saleToEdit.nfseEmittedAt || new Date().toISOString())
            : undefined,
        installments,
      });
    } else {
      // Generate installments
      const installments: SaleInstallment[] = [];
      const installmentValue = Number((totalValue / installmentsCount).toFixed(2));
      let accumulated = 0;

      for (let i = 1; i <= installmentsCount; i++) {
        const val = i === installmentsCount ? totalValue - accumulated : installmentValue;
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

        installments.push({
          id: `inst_${Date.now()}_${i}`,
          saleId: '', // will be set by db or model
          installmentNumber: i,
          totalInstallments: installmentsCount,
          value: val,
          dueDate: dueDateStr,
          paymentDate: isPaidNow ? serviceDate : undefined,
          amountReceived: isPaidNow ? val : undefined,
          status: isPaidNow ? 'RECEBIDO' : 'A_RECEBER',
          receitaSaudeStatus: receitaStatus,
          receitaSaudeId: receitaId,
          receitaSaudeEmittedAt: receitaStatus === 'EMITIDO' ? new Date().toISOString() : undefined,
          paymentMethod: paymentMethod,
          bankAccountId: taxOrigin === 'CPF' ? 'bank_01' : 'bank_02',
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
        procedureName,
        description: description || procedureName,
        totalValue,
        serviceDate,
        paymentMethod,
        installmentsCount,
        nfseStatus: taxOrigin === 'CNPJ' ? nfseStatus : undefined,
        nfseNumber: taxOrigin === 'CNPJ' ? nfseNumber : undefined,
        nfseVerificationCode: taxOrigin === 'CNPJ' ? nfseVerificationCode : undefined,
        nfseEmittedAt:
          taxOrigin === 'CNPJ' && nfseStatus === 'EMITIDA'
            ? new Date().toISOString()
            : undefined,
        installments,
      });
    }

    if (onSaleCreated) onSaleCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">
              {isEditing ? 'Editar Receita Odontológica' : 'Nova Receita Odontológica'}
            </h2>
            <p className="text-xs text-slate-400">
              {isEditing
                ? 'Atualize os dados clínicos, financeiros ou a segregação fiscal CPF/CNPJ'
                : 'Classifique com precisão entre CPF (Carnê-Leão) ou CNPJ (NFS-e)'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* 1. MANDATORY FIRST FIELD: ORIGEM TRIBUTÁRIA */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>Origem Tributária da Operação</span>
              <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTaxOrigin('CPF')}
                className={`flex flex-col items-start p-3.5 rounded-xl border-2 transition-all cursor-pointer text-left ${
                  taxOrigin === 'CPF'
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  <User className={`w-4 h-4 ${taxOrigin === 'CPF' ? 'text-emerald-700' : 'text-slate-500'}`} />
                  <span>CPF • Pessoa Física</span>
                </div>
                <span className="text-xs text-slate-500 mt-1">
                  Documento: <strong>Receita Saúde</strong> (Regime de Caixa / Carnê-Leão)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTaxOrigin('CNPJ')}
                className={`flex flex-col items-start p-3.5 rounded-xl border-2 transition-all cursor-pointer text-left ${
                  taxOrigin === 'CNPJ'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-950 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Building className={`w-4 h-4 ${taxOrigin === 'CNPJ' ? 'text-blue-700' : 'text-slate-500'}`} />
                  <span>CNPJ • Pessoa Jurídica</span>
                </div>
                <span className="text-xs text-slate-500 mt-1">
                  Documento: <strong>NFS-e</strong> (Simples Nacional / Fator R)
                </span>
              </button>
            </div>
          </div>

          {/* Paciente / Beneficiário */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {taxOrigin === 'CPF' ? 'Paciente / Beneficiário do Tratamento' : 'Paciente / Tomador do Serviço'}
              </label>
              <button
                type="button"
                onClick={() => setIsNewPatient(!isNewPatient)}
                className="text-xs text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                {isNewPatient ? 'Selecionar Cadastrado' : 'Novo Paciente'}
              </button>
            </div>

            {!isNewPatient ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => handleSelectPatient(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center text-xs text-slate-600 bg-slate-100 px-3 py-2 rounded-lg font-mono">
                  CPF: {patientCpf || 'Não informado'}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <input
                    type="text"
                    placeholder="Nome completo do paciente"
                    value={newPatientName}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="CPF (somente números)"
                    value={newPatientCpf}
                    onChange={(e) => setNewPatientCpf(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    required
                  />
                </div>
              </div>
            )}

            {/* IF CPF: Pagador Details */}
            {taxOrigin === 'CPF' && (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={payerIsBeneficiary}
                    onChange={(e) => setPayerIsBeneficiary(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span>O pagador é o próprio beneficiário (paciente)</span>
                </label>

                {!payerIsBeneficiary && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-amber-50/70 border border-amber-200 rounded-lg animate-in fade-in">
                    <div>
                      <label className="block text-[11px] font-bold text-amber-900 mb-1">
                        Nome do Pagador (Responsável Financeiro)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Pai, Mãe ou Cônjuge"
                        value={payerName}
                        onChange={(e) => setPayerName(e.target.value)}
                        className="w-full text-sm rounded-lg border border-amber-300 p-2 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        required={!payerIsBeneficiary}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-amber-900 mb-1">
                        CPF do Pagador
                      </label>
                      <input
                        type="text"
                        placeholder="CPF de quem efetuou o pagamento"
                        value={payerCpf}
                        onChange={(e) => setPayerCpf(e.target.value)}
                        className="w-full text-sm rounded-lg border border-amber-300 p-2 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        required={!payerIsBeneficiary}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Procedimento Seleção por Dropdown e Valores */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Procedimento Odontológico
              </label>
              <button
                type="button"
                onClick={() => setIsCustomProcedure(!isCustomProcedure)}
                className="text-xs text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-1 cursor-pointer"
              >
                {isCustomProcedure ? 'Selecionar do Catálogo' : '+ Procedimento Avulso'}
              </button>
            </div>

            {!isCustomProcedure ? (
              <div>
                <select
                  value={selectedProcedureId}
                  onChange={(e) => handleProcedureSelect(e.target.value)}
                  className="w-full text-sm font-semibold rounded-lg border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  <option value="" disabled>Selecione um procedimento cadastrado...</option>
                  {procedures.map((proc) => (
                    <option key={proc.id} value={proc.id}>
                      [{proc.code}] {proc.name} — Tabela: {formatCurrency(proc.defaultPrice)}
                    </option>
                  ))}
                  <option value="CUSTOM">+ Digitar outro procedimento avulso...</option>
                </select>

                {selectedProcedure && (
                  <div className="mt-2 p-2.5 bg-teal-50/70 rounded-lg border border-teal-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-teal-900 font-medium">
                      ⏱ Duração: <strong className="font-bold">{selectedProcedure.clinicalDurationMinutes} min</strong> • Custo Direto (Hora + Insumos): <strong className="font-bold">{formatCurrency(selectedProcedure.totalDirectCost)}</strong>
                    </span>
                    <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[11px]">
                      Margem Estimada: {selectedProcedure.defaultPrice > 0 ? (((selectedProcedure.defaultPrice - selectedProcedure.totalDirectCost) / selectedProcedure.defaultPrice) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  placeholder="Nome do procedimento avulso ou tratamento..."
                  value={procedureName}
                  onChange={(e) => setProcedureName(e.target.value)}
                  className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  required
                />
              </div>
            )}
          </div>

          {/* Valores, Datas e Pagamento */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Data da Prestação (Competência)
              </label>
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Valor Cobrado do Paciente (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={totalValue}
                onChange={(e) => setTotalValue(parseFloat(e.target.value) || 0)}
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Forma de Pagamento</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              >
                <option value="PIX">PIX</option>
                <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                <option value="CARTAO_DEBITO">Cartão de Débito</option>
                <option value="BOLETO">Boleto Bancário</option>
                <option value="DINHEIRO">Dinheiro em Espécie</option>
                <option value="TRANSFERENCIA">Transferência / TED</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Descrição Detalhada do Serviço</label>
            <input
              type="text"
              placeholder="Ex: Restauração oclusal com resina nanoparticulada dente 46"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          {/* Parcelamento e Documentos Fiscais */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Quantidade de Parcelas</label>
                <select
                  value={installmentsCount}
                  onChange={(e) => setInstallmentsCount(parseInt(e.target.value, 10))}
                  className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? '1x À vista' : `${n}x parcelado de ${formatCurrency(totalValue / n)}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Primeira Parcela / À Vista</label>
                <div className="flex items-center h-10">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receivedNow}
                      onChange={(e) => setReceivedNow(e.target.checked)}
                      className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                    />
                    <span>Já recebido na data de hoje ({new Date().toLocaleDateString('pt-BR')})</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Strict Document Rules per Section 4 */}
            {taxOrigin === 'CPF' ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-2">
                <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-emerald-700" />
                  <span>Documento Obrigatório: Receita Saúde</span>
                </div>
                <p className="text-emerald-800 leading-relaxed">
                  <strong>Atenção:</strong> O Receita Saúde é vinculado individualmente a cada{' '}
                  <strong>PAGAMENTO</strong>. Se houver parcelamento, cada recebimento futuro gerará seu próprio
                  registro. Parcelas ainda não recebidas não compõem a base tributária do Carnê-Leão.
                </p>
                {receivedNow && (
                  <div className="pt-2">
                    <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                      Identificador / Número Externo do Receita Saúde (Opcional no momento)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: RS-2025-05-0099"
                      value={receiptIdentifier}
                      onChange={(e) => setReceiptIdentifier(e.target.value)}
                      className="w-full text-xs rounded-lg border border-emerald-300 p-2 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs space-y-3">
                <div className="font-bold text-blue-900 flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-blue-700" />
                  <span>Documento Fiscal: Nota Fiscal de Serviços Eletrônica (NFS-e)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-blue-950 mb-1">Status da NFS-e</label>
                    <select
                      value={nfseStatus}
                      onChange={(e) => setNfseStatus(e.target.value as NfseStatus)}
                      className="w-full text-xs rounded-lg border border-blue-300 p-1.5 bg-white focus:outline-none"
                    >
                      <option value="EMITIDA">NFS-e Emitida</option>
                      <option value="A_EMITIR">NFS-e a Emitir</option>
                      <option value="CANCELADA">Cancelada</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-blue-950 mb-1">Número da NFS-e</label>
                    <input
                      type="text"
                      placeholder="Ex: 2025/000418"
                      value={nfseNumber}
                      onChange={(e) => setNfseNumber(e.target.value)}
                      className="w-full text-xs rounded-lg border border-blue-300 p-1.5 bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-blue-950 mb-1">Cód. Verificação</label>
                    <input
                      type="text"
                      placeholder="Ex: F8A1-49B2"
                      value={nfseVerificationCode}
                      onChange={(e) => setNfseVerificationCode(e.target.value)}
                      className="w-full text-xs rounded-lg border border-blue-300 p-1.5 bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-lg shadow-md shadow-emerald-700/20 active:scale-98 transition-all cursor-pointer"
            >
              {isEditing ? 'Salvar Alterações' : 'Salvar Receita'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
