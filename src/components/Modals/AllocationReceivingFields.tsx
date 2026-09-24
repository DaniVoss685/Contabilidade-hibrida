import React from 'react';
import { AlertCircle } from 'lucide-react';
import { CustomSelect, DatePicker, Switch } from '../UI';
import { BankAccount } from '../../types';
import { formatCurrency } from '../../lib/masks';
import { isCashAccount, selectableAccounts } from '../../lib/bankAccounts';

// Destino do recebimento + "já recebido" + data, tudo PRÓPRIO de uma alocação (pagamento). Cada bloco de
// pagamento na Nova Receita usa este componente: o switch fica alinhado ao campo de conta no mesmo grid.
export const AllocationReceivingFields: React.FC<{
  id: string;
  accounts: BankAccount[];
  accountId: string;
  onAccount: (id: string) => void;
  received: boolean;
  onReceived: (v: boolean) => void;
  receivedLabel: string;
  date: string;
  onDate: (d: string) => void;
}> = ({ id, accounts, accountId, onAccount, received, onReceived, receivedLabel, date, onDate }) => {
  const options = selectableAccounts(accounts, accountId).map((b) => ({
    value: b.id,
    label: `${b.isPreferred ? '⭐ ' : ''}${b.name}${b.isPreferred ? ' (Principal)' : ''}${b.isActive === false ? ' (inativa)' : ''}`,
    description: `${
      isCashAccount(b) ? 'Caixa / Dinheiro' : b.accountType === 'CORRENTE_PJ' ? 'Conta Jurídica (PJ)' : 'Conta Física (CPF)'
    } • Saldo: ${formatCurrency(b.currentBalance)}`,
  }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
        <CustomSelect
          label={received ? 'Conta de recebimento *' : 'Conta de recebimento (opcional)'}
          options={options}
          value={accountId}
          onChange={onAccount}
          required={received}
          placeholder={accounts.length === 0 ? 'Nenhuma conta cadastrada' : 'Selecione a conta...'}
        />
        {accounts.length === 0 ? (
          <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-900 flex items-start gap-2 min-h-[42px]">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Sem contas cadastradas. Será salvo como <strong>"A Receber"</strong>.
            </span>
          </div>
        ) : (
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">{receivedLabel}</span>
            <div className="h-[42px] px-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3 shadow-2xs">
              <span className="text-xs text-slate-500">{received ? 'Sim, já entrou' : 'Ainda não recebido'}</span>
              <Switch id={id} checked={received} onChange={onReceived} ariaLabel={receivedLabel} showStatusBadge={false} bare />
            </div>
          </div>
        )}
      </div>
      {received && (
        <div className="max-w-xs animate-in fade-in">
          <DatePicker label="Data do recebimento" value={date} onChange={onDate} required />
        </div>
      )}
    </div>
  );
};
