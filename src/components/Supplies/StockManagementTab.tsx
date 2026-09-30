import React, { useMemo, useState } from 'react';
import { Package, AlertTriangle, XCircle, DollarSign, X, PlusCircle, MinusCircle, History } from 'lucide-react';
import { ClinicalInput, StockMovement, StockMovementType } from '../../types';
import { formatCurrency } from '../../lib/masks';
import { formatUnitCost } from '../../lib/procedureCosting';
import { db } from '../../lib/db';
import { computeStockStatus, computeStockSummary, StockStatus } from '../../lib/stockMovements';
import { useToast } from '../UI';

const STATUS_META: Record<StockStatus, { label: string; className: string }> = {
  NAO_CONFIGURADO: { label: 'Não configurado', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  SEM_ESTOQUE: { label: 'Sem estoque', className: 'bg-rose-100 text-rose-800 border-rose-300' },
  BAIXO: { label: 'Estoque baixo', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  NORMAL: { label: 'Normal', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
};

type FilterOption = 'ALL' | StockStatus;

export const StockManagementTab: React.FC<{ inputs: ClinicalInput[] }> = ({ inputs }) => {
  const toast = useToast();
  const [filter, setFilter] = useState<FilterOption>('ALL');
  const [managing, setManaging] = useState<ClinicalInput | null>(null);

  const activeInputs = useMemo(() => inputs.filter((i) => i.active !== false), [inputs]);

  const summary = useMemo(
    () =>
      computeStockSummary(
        activeInputs.map((i) => ({
          quantityOnHand: i.quantityOnHand || 0,
          minimumQuantity: i.minimumQuantity || 0,
          unitCost: i.unitCost || 0,
        }))
      ),
    [activeInputs]
  );

  const rows = useMemo(() => {
    return activeInputs
      .map((i) => ({ input: i, status: computeStockStatus(i.quantityOnHand || 0, i.minimumQuantity || 0) }))
      .filter((r) => filter === 'ALL' || r.status === filter)
      .sort((a, b) => a.input.name.localeCompare(b.input.name));
  }, [activeInputs, filter]);

  const filterOptions: { value: FilterOption; label: string }[] = [
    { value: 'ALL', label: 'Todos' },
    { value: 'BAIXO', label: 'Baixo' },
    { value: 'SEM_ESTOQUE', label: 'Sem estoque' },
    { value: 'NORMAL', label: 'Normal' },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Total de Itens</span>
            <Package className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{summary.totalItems}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Estoque Baixo</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-700">{summary.lowStockCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Sem Estoque</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-700">{summary.outOfStockCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Valor Estimado</span>
            <DollarSign className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{formatCurrency(summary.estimatedValue)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 w-fit text-xs">
        {filterOptions.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
              filter === f.value ? 'bg-teal-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-4 text-left font-bold text-slate-600">Insumo</th>
              <th className="py-2.5 px-4 text-center font-bold text-slate-600">Atual</th>
              <th className="py-2.5 px-4 text-center font-bold text-slate-600">Mínimo</th>
              <th className="py-2.5 px-4 text-center font-bold text-slate-600">Unidade</th>
              <th className="py-2.5 px-4 text-center font-bold text-slate-600">Status</th>
              <th className="py-2.5 px-4 text-right font-bold text-slate-600">Custo</th>
              <th className="py-2.5 px-4 text-center font-bold text-slate-600">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-400">
                  Nenhum insumo encontrado para este filtro.
                </td>
              </tr>
            ) : (
              rows.map(({ input, status }) => (
                <tr key={input.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-800">{input.name}</td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">{input.quantityOnHand ?? 0}</td>
                  <td className="py-3 px-4 text-center font-mono text-slate-500">{input.minimumQuantity ?? 0}</td>
                  <td className="py-3 px-4 text-center text-slate-500">{input.usageUnit}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${STATUS_META[status].className}`}>
                      {STATUS_META[status].label}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-teal-800 font-bold">
                    {formatUnitCost(input.unitCost, 'compact')} <span className="text-slate-400 font-medium">/{input.usageUnit}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => setManaging(input)}
                      className="px-2.5 py-1 text-[11px] font-bold text-teal-700 hover:bg-teal-50 rounded-lg cursor-pointer"
                    >
                      Movimentar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {managing && (
        <StockMovementModal
          input={managing}
          onClose={() => setManaging(null)}
          onDone={() => setManaging(null)}
        />
      )}
    </div>
  );
};

const StockMovementModal: React.FC<{ input: ClinicalInput; onClose: () => void; onDone: () => void }> = ({
  input,
  onClose,
  onDone,
}) => {
  const toast = useToast();
  const [minimumQuantity, setMinimumQuantity] = useState<string>(String(input.minimumQuantity ?? 0));
  const [savingMinimum, setSavingMinimum] = useState(false);

  const [movementType, setMovementType] = useState<Extract<StockMovementType, 'ENTRY' | 'ADJUSTMENT_PLUS' | 'ADJUSTMENT_MINUS'>>('ENTRY');
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [history, setHistory] = useState<StockMovement[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleSaveMinimum = async () => {
    const val = Number(minimumQuantity.replace(',', '.'));
    if (isNaN(val) || val < 0) {
      toast.warning('Informe um mínimo válido (0 ou maior).');
      return;
    }
    setSavingMinimum(true);
    try {
      const res = await db.updateClinicalInputAsync(input.id, { minimumQuantity: val });
      if (res.success) {
        toast.success('Mínimo atualizado.');
      } else {
        toast.error(res.error || 'Erro ao atualizar o mínimo.');
      }
    } finally {
      setSavingMinimum(false);
    }
  };

  const handleSubmitMovement = async () => {
    const qty = Number(quantity.replace(',', '.'));
    if (isNaN(qty) || qty <= 0) {
      toast.warning('Informe uma quantidade maior que zero.');
      return;
    }
    if (movementType !== 'ENTRY' && !reason.trim()) {
      toast.warning('Informe o motivo do ajuste.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await db.adjustClinicalInputStock(input.id, movementType, qty, reason.trim() || undefined);
      if (res.success) {
        toast.success('Movimentação registrada.');
        setQuantity('');
        setReason('');
        onDone();
      } else {
        toast.error(res.error || 'Erro ao registrar movimentação.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await db.getStockMovements({ inputId: input.id });
      setHistory(data);
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <div>
            <h4 className="text-sm font-bold text-slate-900">{input.name}</h4>
            <p className="text-[11px] text-slate-400">Atual: {input.quantityOnHand ?? 0} {input.usageUnit}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Estoque mínimo ({input.usageUnit})</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={minimumQuantity}
                onChange={(e) => setMinimumQuantity(e.target.value)}
                className="flex-1 text-sm rounded-xl border border-slate-200 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
              <button
                type="button"
                onClick={handleSaveMinimum}
                disabled={savingMinimum}
                className="px-3.5 py-2.5 text-xs font-bold text-white bg-slate-700 hover:bg-slate-800 rounded-xl cursor-pointer disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">0 = estoque não configurado para este insumo (nunca alerta sozinho).</p>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <label className="block text-xs font-semibold text-slate-700">Registrar movimentação</label>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit text-xs">
              <button
                type="button"
                onClick={() => setMovementType('ENTRY')}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1 cursor-pointer ${movementType === 'ENTRY' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'}`}
              >
                <PlusCircle className="w-3.5 h-3.5" /> Entrada
              </button>
              <button
                type="button"
                onClick={() => setMovementType('ADJUSTMENT_PLUS')}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1 cursor-pointer ${movementType === 'ADJUSTMENT_PLUS' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'}`}
              >
                <PlusCircle className="w-3.5 h-3.5" /> Ajuste +
              </button>
              <button
                type="button"
                onClick={() => setMovementType('ADJUSTMENT_MINUS')}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1 cursor-pointer ${movementType === 'ADJUSTMENT_MINUS' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-500'}`}
              >
                <MinusCircle className="w-3.5 h-3.5" /> Ajuste -
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Quantidade</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full text-sm rounded-xl border border-slate-200 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Motivo {movementType !== 'ENTRY' && <span className="text-rose-500">*</span>}
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={movementType === 'ENTRY' ? 'Ex.: Compra NF 123' : 'Obrigatório para ajustes'}
                  className="w-full text-sm rounded-xl border border-slate-200 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmitMovement}
              disabled={submitting}
              className="w-full px-4 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Registrando...' : 'Registrar movimentação'}
            </button>
          </div>

          <div className="border-t border-slate-100 pt-4">
            {history === null ? (
              <button
                type="button"
                onClick={loadHistory}
                disabled={loadingHistory}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <History className="w-3.5 h-3.5" /> {loadingHistory ? 'Carregando...' : 'Ver histórico de movimentações'}
              </button>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                <p className="text-[11px] font-bold text-slate-500 uppercase">Histórico</p>
                {history.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhuma movimentação registrada ainda.</p>
                ) : (
                  history.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-[11px] text-slate-600 py-1 border-b border-slate-50 last:border-0">
                      <span>{new Date(m.createdAt).toLocaleString('pt-BR')} — {m.movementType}</span>
                      <span className="font-mono font-semibold">{m.quantity} (saldo: {m.balanceAfter})</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
