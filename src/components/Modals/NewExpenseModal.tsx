import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  AlertTriangle,
  Info,
  Sliders,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';
import { db } from '../../lib/db';
import {
  Expense,
  ExpenseEntity,
  LivroCaixaPfDedutibilidade,
  PaymentMethod,
  ExpenseCategory,
  BankAccount,
} from '../../types';
import { formatCurrency } from '../../lib/masks';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  bankAccounts: BankAccount[];
  onExpenseCreated?: () => void;
  expenseToEdit?: Expense | null;
}

export const NewExpenseModal: React.FC<NewExpenseModalProps> = ({
  isOpen,
  onClose,
  categories,
  bankAccounts,
  onExpenseCreated,
  expenseToEdit,
}) => {
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
  const [notes, setNotes] = useState('');

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

  // Load fields when editing or opening
  useEffect(() => {
    if (expenseToEdit) {
      setSupplierName(expenseToEdit.supplierName || '');
      setSupplierCpfCnpj(expenseToEdit.supplierCpfCnpj || '');
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
      setNotes(expenseToEdit.notes || '');
      setEntity(expenseToEdit.entity || 'CPF');
      setDedutivelLivroCaixaPf(expenseToEdit.dedutivelLivroCaixaPf || 'SIM');
      setImpactaFatorRPj(expenseToEdit.impactaFatorRPj || false);
      setDespesaOperacionalPj(expenseToEdit.despesaOperacionalPj !== undefined ? expenseToEdit.despesaOperacionalPj : true);
      setIsOverridden(Boolean(expenseToEdit.isOverridden));
      setOverrideJustification(expenseToEdit.overrideJustification || '');
    } else {
      setSupplierName('');
      setSupplierCpfCnpj('');
      setDescription('');
      setCategoryId(defaultCat?.id || '');
      setSubCategory('');
      setValue(350);
      setCompetenceDate(new Date().toISOString().split('T')[0]);
      setDueDate(new Date().toISOString().split('T')[0]);
      setIsPaid(true);
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('PIX');
      setBankAccountId(bankAccounts[0]?.id || '');
      setDocumentNumber('');
      setAttachmentName('');
      setNotes('');
      setEntity('CPF');
      setDedutivelLivroCaixaPf(defaultCat?.dedutivelLivroCaixaPf || 'SIM');
      setImpactaFatorRPj(defaultCat?.impactaFatorRPj || false);
      setDespesaOperacionalPj(defaultCat?.despesaOperacionalPj || true);
      setIsOverridden(false);
      setOverrideJustification('');
    }
  }, [expenseToEdit, isOpen, defaultCat]);

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

  const selectedCategoryObj = categories.find((c) => c.id === categoryId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!supplierName.trim()) {
      alert('Por favor informe o nome do fornecedor.');
      return;
    }

    if (value <= 0) {
      alert('O valor da despesa deve ser maior que zero.');
      return;
    }

    if (isOverridden && !overrideJustification.trim()) {
      alert('Para alterar manualmente a classificação tributária padrão, é obrigatório informar a justificativa.');
      return;
    }

    const cat = categories.find((c) => c.id === categoryId) || defaultCat;

    if (isEditing && expenseToEdit) {
      db.updateExpense(expenseToEdit.id, {
        supplierName: supplierName.trim(),
        supplierCpfCnpj: supplierCpfCnpj.trim(),
        description: description.trim() || cat.name,
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
        attachmentName: attachmentName.trim() || undefined,
        notes: notes.trim() || undefined,
        entity,
        dedutivelLivroCaixaPf,
        impactaFatorRPj,
        despesaOperacionalPj,
        isOverridden,
        overrideJustification: isOverridden ? overrideJustification.trim() : undefined,
        status: isPaid ? 'PAGO' : 'A_PAGAR',
      });
    } else {
      db.addExpense({
        supplierName: supplierName.trim(),
        supplierCpfCnpj: supplierCpfCnpj.trim(),
        description: description.trim() || cat.name,
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
        attachmentName: attachmentName.trim() || undefined,
        notes: notes.trim() || undefined,
        entity,
        dedutivelLivroCaixaPf,
        impactaFatorRPj,
        despesaOperacionalPj,
        isOverridden,
        overrideJustification: isOverridden ? overrideJustification.trim() : undefined,
        status: isPaid ? 'PAGO' : 'A_PAGAR',
      });
    }

    if (onExpenseCreated) onExpenseCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">
              {isEditing ? 'Editar Despesa / Conta a Pagar' : 'Nova Despesa / Conta a Pagar'}
            </h2>
            <p className="text-xs text-slate-400">
              {isEditing
                ? 'Modifique os dados cadastrais, valores ou classificação fiscal desta despesa'
                : 'Classificação tributária automatizada para Livro Caixa PF e Fator R da PJ'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Entity Selection: Only PF or PJ */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Titularidade da Despesa (Pessoa Física ou Jurídica) <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setEntity('CPF')}
                className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  entity === 'CPF'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-sm font-extrabold text-emerald-700">Pessoa Física (PF)</span>
                <span className="text-[11px] font-normal text-slate-500">CPF do Dentista • Livro Caixa Carnê-Leão</span>
              </button>
              <button
                type="button"
                onClick={() => setEntity('CNPJ')}
                className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  entity === 'CNPJ'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-sm font-extrabold text-blue-700">Pessoa Jurídica (PJ)</span>
                <span className="text-[11px] font-normal text-slate-500">CNPJ da Clínica • Fator R & Simples Nacional</span>
              </button>
            </div>
          </div>

          {/* Categoria do Plano de Contas */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Categoria do Plano de Contas <span className="text-rose-500">*</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              required
            >
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} - {c.name} ({c.groupName})
                </option>
              ))}
            </select>
          </div>

          {/* Automatic 3 Tax Attributes Box */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-slate-600" />
                Atributos Fiscais Automáticos da Categoria
              </span>
              <button
                type="button"
                onClick={() => setIsOverridden(!isOverridden)}
                className="text-xs text-teal-700 hover:text-teal-800 font-semibold"
              >
                {isOverridden ? 'Restaurar Padrão' : 'Alterar Manualmente'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 1. dedutivel_livro_caixa_pf */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="block text-[11px] text-slate-500 font-medium">Dedutível Livro Caixa (PF)</span>
                {!isOverridden ? (
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold ${
                      dedutivelLivroCaixaPf === 'SIM'
                        ? 'bg-emerald-100 text-emerald-800'
                        : dedutivelLivroCaixaPf === 'CONDICIONAL'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {dedutivelLivroCaixaPf}
                  </span>
                ) : (
                  <select
                    value={dedutivelLivroCaixaPf}
                    onChange={(e) => setDedutivelLivroCaixaPf(e.target.value as LivroCaixaPfDedutibilidade)}
                    className="mt-1 w-full text-xs rounded border border-slate-300 p-1"
                  >
                    <option value="SIM">SIM</option>
                    <option value="CONDICIONAL">CONDICIONAL</option>
                    <option value="NAO">NÃO</option>
                  </select>
                )}
              </div>

              {/* 2. impacta_fator_r_pj */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="block text-[11px] text-slate-500 font-medium">Impacta Fator R (PJ)</span>
                {!isOverridden ? (
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold ${
                      impactaFatorRPj ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {impactaFatorRPj ? 'SIM' : 'NÃO'}
                  </span>
                ) : (
                  <select
                    value={impactaFatorRPj ? 'true' : 'false'}
                    onChange={(e) => setImpactaFatorRPj(e.target.value === 'true')}
                    className="mt-1 w-full text-xs rounded border border-slate-300 p-1"
                  >
                    <option value="true">SIM</option>
                    <option value="false">NÃO</option>
                  </select>
                )}
              </div>

              {/* 3. despesa_operacional_pj */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="block text-[11px] text-slate-500 font-medium">Despesa Operacional PJ</span>
                {!isOverridden ? (
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold ${
                      despesaOperacionalPj ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {despesaOperacionalPj ? 'SIM' : 'NÃO'}
                  </span>
                ) : (
                  <select
                    value={despesaOperacionalPj ? 'true' : 'false'}
                    onChange={(e) => setDespesaOperacionalPj(e.target.value === 'true')}
                    className="mt-1 w-full text-xs rounded border border-slate-300 p-1"
                  >
                    <option value="true">SIM</option>
                    <option value="false">NÃO</option>
                  </select>
                )}
              </div>
            </div>

            {/* Notice for CONDITIONAL or Category Notice */}
            {dedutivelLivroCaixaPf === 'CONDICIONAL' && (
              <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-snug">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Aviso Tributário:</strong> Dedução condicionada à relação com a atividade profissional,
                  documentação e demais requisitos fiscais. Consulte seu contador.
                </span>
              </div>
            )}

            {/* Justification if Overridden */}
            {isOverridden && (
              <div className="pt-2 border-t border-slate-200">
                <label className="block text-xs font-bold text-rose-700 mb-1">
                  Justificativa Obrigatória para Alteração Manual:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Orientação contábil expressa por se tratar de despesa 100% clínica"
                  value={overrideJustification}
                  onChange={(e) => setOverrideJustification(e.target.value)}
                  className="w-full text-xs rounded-lg border border-rose-300 p-2 bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  required={isOverridden}
                />
              </div>
            )}
          </div>

          {/* Fornecedor e Valores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Fornecedor <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Dental Cremer, Imobiliária, LabPro..."
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">CPF / CNPJ do Fornecedor</label>
              <input
                type="text"
                placeholder="Somente números ou com pontuação"
                value={supplierCpfCnpj}
                onChange={(e) => setSupplierCpfCnpj(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Valor da Despesa (R$) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={value}
                onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white font-semibold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Subcategoria (Opcional)</label>
              <input
                type="text"
                placeholder="Ex: Resina Z350, Brocas..."
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Descrição do Pagamento</label>
            <input
              type="text"
              placeholder="Ex: Aquisição de anestésicos e gaze estéril"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          {/* Datas e Status de Pagamento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Data da Competência</label>
              <input
                type="date"
                value={competenceDate}
                onChange={(e) => setCompetenceDate(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Data de Vencimento</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
              <input
                type="checkbox"
                checked={isPaid}
                onChange={(e) => setIsPaid(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
              />
              <span>Despesa já foi paga (Liquidação imediata)</span>
            </label>

            {isPaid && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Data do Pagamento</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Forma de Pagamento</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white"
                  >
                    <option value="PIX">PIX</option>
                    <option value="BOLETO">Boleto Bancário</option>
                    <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                    <option value="CARTAO_DEBITO">Cartão de Débito</option>
                    <option value="TRANSFERENCIA">Transferência Bancária</option>
                    <option value="DINHEIRO">Dinheiro em Espécie</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Conta Bancária</label>
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white"
                  >
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Anexo de Comprovante & Observações */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nº Comprovante / NF</label>
              <input
                type="text"
                placeholder="Ex: NF-e 9845 ou Autenticação bancária"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Anexo / Comprovante</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nome do arquivo ou anexo"
                  value={attachmentName}
                  onChange={(e) => setAttachmentName(e.target.value)}
                  className="w-full text-sm rounded-lg border border-slate-300 p-2 bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setAttachmentName(`comprovante_${Date.now().toString().slice(-4)}.pdf`)}
                  className="px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-medium text-slate-700 flex items-center gap-1 cursor-pointer"
                  title="Simular anexo de comprovante em PDF"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Anexar</span>
                </button>
              </div>
            </div>
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
              className="px-5 py-2 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-md transition-all cursor-pointer"
            >
              {isEditing ? 'Salvar Alterações' : 'Salvar Despesa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
