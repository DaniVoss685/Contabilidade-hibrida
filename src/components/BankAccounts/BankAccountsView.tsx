import React, { useState, useMemo } from 'react';
import {
  Wallet,
  Building,
  User,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Power,
  ShieldCheck,
  Search,
  Filter,
  ArrowRightLeft,
  DollarSign,
  Landmark,
  X,
} from 'lucide-react';
import { BankAccount } from '../../types';
import { formatCurrency } from '../../lib/masks';
import { db } from '../../lib/db';
import { useToast, CurrencyInput, CustomSelect, ConfirmDialog } from '../UI';

interface BankAccountsViewProps {
  bankAccounts: BankAccount[];
  onRefreshData: () => void;
}

export const BankAccountsView: React.FC<BankAccountsViewProps> = ({
  bankAccounts,
  onRefreshData,
}) => {
  const toast = useToast();

  const [filterType, setFilterType] = useState<'ALL' | 'CORRENTE_PF' | 'CORRENTE_PJ'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [institutionInput, setInstitutionInput] = useState('');
  const [accountTypeInput, setAccountTypeInput] = useState<'CORRENTE_PF' | 'CORRENTE_PJ'>('CORRENTE_PJ');
  const [initialBalanceInput, setInitialBalanceInput] = useState<number>(0);
  const [isActiveInput, setIsActiveInput] = useState<boolean>(true);

  // Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmar',
    cancelLabel: 'Cancelar',
    onConfirm: () => {},
  });

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return bankAccounts.filter((acc) => {
      const matchesType =
        filterType === 'ALL' ||
        (filterType === 'CORRENTE_PF' && acc.accountType === 'CORRENTE_PF') ||
        (filterType === 'CORRENTE_PJ' && acc.accountType === 'CORRENTE_PJ');

      const matchesSearch =
        acc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.bankName.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesType && matchesSearch;
    });
  }, [bankAccounts, filterType, searchTerm]);

  // KPIs
  const totalPfBalance = useMemo(() => {
    return bankAccounts
      .filter((b) => b.accountType === 'CORRENTE_PF' && b.isActive !== false)
      .reduce((sum, b) => sum + (b.currentBalance ?? b.initialBalance ?? 0), 0);
  }, [bankAccounts]);

  const totalPjBalance = useMemo(() => {
    return bankAccounts
      .filter((b) => b.accountType === 'CORRENTE_PJ' && b.isActive !== false)
      .reduce((sum, b) => sum + (b.currentBalance ?? b.initialBalance ?? 0), 0);
  }, [bankAccounts]);

  const totalConsolidated = totalPfBalance + totalPjBalance;
  const activeCount = bankAccounts.filter((b) => b.isActive !== false).length;

  // Handlers
  const handleOpenAdd = () => {
    setEditingAccountId(null);
    setNameInput('');
    setInstitutionInput('');
    setAccountTypeInput('CORRENTE_PJ');
    setInitialBalanceInput(0);
    setIsActiveInput(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (acc: BankAccount) => {
    setEditingAccountId(acc.id);
    setNameInput(acc.name);
    setInstitutionInput(acc.bankName || '');
    setAccountTypeInput(acc.accountType === 'CORRENTE_PF' ? 'CORRENTE_PF' : 'CORRENTE_PJ');
    setInitialBalanceInput(acc.initialBalance || 0);
    setIsActiveInput(acc.isActive !== false);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) {
      toast.warning('Informe a identificação da conta bancária.');
      return;
    }

    if (editingAccountId) {
      await db.updateBankAccount(editingAccountId, {
        name: nameInput.trim(),
        bankName: institutionInput.trim() || 'Banco',
        accountType: accountTypeInput,
        initialBalance: initialBalanceInput,
        isActive: isActiveInput,
      });
      toast.success('Conta bancária atualizada com sucesso.');
    } else {
      await db.addBankAccountAsync({
        name: nameInput.trim(),
        bankName: institutionInput.trim() || 'Banco',
        accountType: accountTypeInput,
        initialBalance: initialBalanceInput,
        currentBalance: initialBalanceInput,
        isActive: isActiveInput,
      });
      toast.success('Nova conta bancária cadastrada.');
    }

    setIsModalOpen(false);
    onRefreshData();
  };

  const handleToggleActive = async (acc: BankAccount) => {
    const nextState = acc.isActive === false ? true : false;
    await db.updateBankAccount(acc.id, { isActive: nextState });
    toast.info(nextState ? `Conta "${acc.name}" reativada.` : `Conta "${acc.name}" desativada temporariamente.`);
    onRefreshData();
  };

  const handleDelete = (acc: BankAccount) => {
    const hasTransactions = db.hasBankTransactions(acc.id);
    if (hasTransactions) {
      setConfirmDialog({
        isOpen: true,
        title: 'Conta com Movimentações Vinculadas',
        message: `Esta conta possui movimentações vinculadas e não pode ser excluída fisicamente para preservar o histórico financeiro e fiscal. Deseja desativá-la para ocultá-la de novos lançamentos?`,
        variant: 'warning',
        confirmLabel: 'Desativar Conta',
        cancelLabel: 'Fechar',
        onConfirm: async () => {
          await db.updateBankAccount(acc.id, { isActive: false });
          toast.info(`Conta "${acc.name}" desativada.`);
          onRefreshData();
        },
      });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Excluir Conta Bancária',
      message: `Deseja realmente excluir a conta "${acc.name}"? Esta ação removerá a conta permanentemente do sistema.`,
      variant: 'danger',
      confirmLabel: 'Excluir Definitivamente',
      cancelLabel: 'Cancelar',
      onConfirm: async () => {
        const res = await db.deleteBankAccountAsync(acc.id);
        if (res.success) {
          toast.success('Conta bancária excluída com sucesso.');
          onRefreshData();
        } else {
          toast.error(res.error || 'Falha ao excluir conta bancária.');
        }
      },
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            Contas Bancárias & Segregação Patrimonial
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestão operacional de contas correntes com separação estrita entre Pessoa Física (PF) e Pessoa Jurídica (PJ)
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Conta Bancária</span>
        </button>
      </div>

      {/* Principle of Entity Alert Card */}
      <div className="p-4 bg-gradient-to-r from-emerald-50/80 via-teal-50/60 to-blue-50/60 border border-emerald-200/80 rounded-2xl text-xs text-slate-700 flex items-start gap-3.5 shadow-2xs">
        <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-emerald-950">
            Princípio Contábil da Entidade & Proteção Fiscal
          </p>
          <p className="text-slate-600 leading-relaxed">
            A legislação da Receita Federal e as normas contábeis exigem a segregação absoluta entre as finanças pessoais do cirurgião-dentista (PF - Carnê-Leão) e as da clínica odontológica (PJ - Simples Nacional). Utilizar contas separadas elimina o risco de confusão patrimonial e autuações fiscais.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total PF */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <span>Saldo Pessoa Física (PF)</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <User className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-xl font-black text-emerald-800 font-mono">
            {formatCurrency(totalPfBalance)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Livro Caixa • Rendimentos e Pró-labore
          </span>
        </div>

        {/* Total PJ */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <span>Saldo Pessoa Jurídica (PJ)</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <Building className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-xl font-black text-blue-900 font-mono">
            {formatCurrency(totalPjBalance)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Clínica Odontológica • Simples Nacional
          </span>
        </div>

        {/* Consolidado */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <span>Saldo Total Consolidado</span>
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
              <DollarSign className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-xl font-black text-slate-900 font-mono">
            {formatCurrency(totalConsolidated)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Soma de todas as contas ativas
          </span>
        </div>

        {/* Contas Ativas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <span>Status das Contas</span>
            <span className="p-1.5 rounded-lg bg-slate-50 text-slate-700">
              <CheckCircle className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-xl font-black text-slate-900 font-mono">
            {activeCount} <span className="text-xs font-normal text-slate-400 font-sans">ativas / {bankAccounts.length} totais</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Disponíveis para liquidação
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Type Filter Buttons */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold w-full sm:w-auto border border-slate-200/60">
          <button
            type="button"
            onClick={() => setFilterType('ALL')}
            className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
              filterType === 'ALL'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todas ({bankAccounts.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('CORRENTE_PJ')}
            className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              filterType === 'CORRENTE_PJ'
                ? 'bg-white text-blue-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building className="w-3.5 h-3.5 text-blue-600" />
            <span>Pessoa Jurídica (PJ)</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('CORRENTE_PF')}
            className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              filterType === 'CORRENTE_PF'
                ? 'bg-white text-emerald-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="w-3.5 h-3.5 text-emerald-600" />
            <span>Pessoa Física (PF)</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar conta ou instituição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs rounded-xl border border-slate-200 pl-9 pr-3.5 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-800"
          />
        </div>
      </div>

      {/* Accounts List / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {bankAccounts.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center space-y-4 shadow-2xs">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Wallet className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold text-slate-800">Nenhuma conta bancária cadastrada</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Cadastre suas contas correntes (Pessoa Física para Carnê-Leão e Pessoa Jurídica para a Clínica) para habilitar o controle de conciliação e liquidação financeira.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Conta Bancária</span>
            </button>
          </div>
        )}

        {bankAccounts.length > 0 && filteredAccounts.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-3">
            <Wallet className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-medium text-slate-600">Nenhuma conta bancária encontrada para os filtros aplicados.</p>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              + Cadastrar nova conta bancária
            </button>
          </div>
        )}

        {bankAccounts.length > 0 &&
          filteredAccounts.map((acc) => {
            const isPf = acc.accountType === 'CORRENTE_PF';
            const isActive = acc.isActive !== false;
            const currentBal = acc.currentBalance ?? acc.initialBalance ?? 0;

            return (
              <div
                key={acc.id}
                className={`bg-white rounded-2xl border p-5 shadow-xs transition-all relative flex flex-col justify-between ${
                  !isActive
                    ? 'border-slate-200 bg-slate-50/70 opacity-75'
                    : isPf
                    ? 'border-emerald-200/90 hover:border-emerald-300'
                    : 'border-blue-200/90 hover:border-blue-300'
                }`}
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-900 text-sm truncate">
                          {acc.name}
                        </h4>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            isPf
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {isPf ? <User className="w-3 h-3" /> : <Building className="w-3 h-3" />}
                          {isPf ? 'Pessoa Física (PF)' : 'Pessoa Jurídica (PJ)'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5 text-slate-400" />
                        <span>{acc.bankName}</span>
                      </p>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] shrink-0 ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
                          : 'bg-slate-200 text-slate-600 border border-slate-300'
                      }`}
                    >
                      {isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>

                  {/* Balances Display */}
                  <div className="py-4 grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block">
                        Saldo Atual
                      </span>
                      <div
                        className={`text-lg font-black font-mono mt-0.5 ${
                          currentBal < 0
                            ? 'text-rose-600'
                            : isPf
                            ? 'text-emerald-800'
                            : 'text-blue-900'
                        }`}
                      >
                        {formatCurrency(currentBal)}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block">
                        Saldo Inicial
                      </span>
                      <div className="text-sm font-semibold font-mono text-slate-600 mt-1">
                        {formatCurrency(acc.initialBalance || 0)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(acc)}
                    className={`text-xs font-semibold flex items-center gap-1.5 py-1 px-2.5 rounded-lg transition-colors cursor-pointer ${
                      isActive
                        ? 'text-slate-500 hover:text-amber-700 hover:bg-amber-50'
                        : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{isActive ? 'Desativar' : 'Reativar'}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(acc)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                      title="Editar conta"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(acc)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Excluir conta"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4.5 bg-white border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600" />
                <span>{editingAccountId ? 'Editar Conta Bancária' : 'Nova Conta Bancária'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Identificação / Apelido da Conta <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Itaú Clínico PJ, Nubank Dr. Carlos PF"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Instituição Financeira (Banco) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Banco Itaú, Nubank, Banco do Brasil, Sicredi"
                  value={institutionInput}
                  onChange={(e) => setInstitutionInput(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                  required
                />
              </div>

              {/* Account Type / Entity Selection */}
              <div>
                <label className="block font-semibold text-slate-700 mb-2">
                  Titularidade / Princípio da Entidade <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setAccountTypeInput('CORRENTE_PJ')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                      accountTypeInput === 'CORRENTE_PJ'
                        ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/15'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-blue-900">
                      <Building className="w-3.5 h-3.5 text-blue-700" />
                      <span>Conta PJ</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Clínica • Simples Nacional
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAccountTypeInput('CORRENTE_PF')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                      accountTypeInput === 'CORRENTE_PF'
                        ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/15'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
                      <User className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Conta PF</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Dentista • Carnê-Leão
                    </span>
                  </button>
                </div>
              </div>

              {/* Initial Balance */}
              <div>
                <CurrencyInput
                  label="Saldo Inicial (R$)"
                  value={initialBalanceInput}
                  onChange={setInitialBalanceInput}
                  placeholder="R$ 0,00"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Saldo de abertura ou saldo de migração para o sistema
                </span>
              </div>

              {/* Active Toggle */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={isActiveInput}
                    onChange={(e) => setIsActiveInput(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>Conta ativa e habilitada para liquidações</span>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {editingAccountId ? 'Salvar Alterações' : 'Cadastrar Conta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        confirmLabel={confirmDialog.confirmLabel || 'Confirmar'}
        cancelLabel={confirmDialog.cancelLabel || 'Cancelar'}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
