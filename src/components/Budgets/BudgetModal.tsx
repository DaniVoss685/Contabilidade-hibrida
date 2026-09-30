import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, ClipboardList } from 'lucide-react';
import { db } from '../../lib/db';
import { Budget, BudgetItem, Patient } from '../../types';
import { computeBudgetTotals, computeItemTotal } from '../../lib/budgets';
import { PatientSearchSelect, CustomSelect, DatePicker, CurrencyInput, useToast } from '../UI';
import { formatCurrency } from '../../lib/masks';

interface BudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  budgetToEdit?: Budget | null;
  onSaved: () => void;
}

export const BudgetModal: React.FC<BudgetModalProps> = ({ isOpen, onClose, budgetToEdit, onSaved }) => {
  const toast = useToast();
  const patients = db.getPatients();
  const procedures = db.getProcedures();
  const clinicalProfessionals = db.getClinicalProfessionals().filter((p) => p.isActive);

  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED' | ''>('');
  const [discountValue, setDiscountValue] = useState(0);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (budgetToEdit) {
      setSelectedPatientId(budgetToEdit.patientId);
      setPatientName(budgetToEdit.patientName);
      setItems(budgetToEdit.items);
      setDiscountType(budgetToEdit.discountType || '');
      setDiscountValue(budgetToEdit.discountValue || 0);
      setValidUntil(budgetToEdit.validUntil || '');
      setNotes(budgetToEdit.notes || '');
    } else {
      setSelectedPatientId('');
      setPatientName('');
      setItems([]);
      setDiscountType('');
      setDiscountValue(0);
      const d = new Date();
      d.setDate(d.getDate() + 15);
      setValidUntil(d.toISOString().split('T')[0]);
      setNotes('');
    }
    setError(null);
  }, [isOpen, budgetToEdit]);

  const totals = useMemo(() => computeBudgetTotals(items, discountType || null, discountValue), [items, discountType, discountValue]);

  const handlePatientSelect = (p: Patient) => {
    setSelectedPatientId(p.id);
    setPatientName(p.name);
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `bitem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        procedureName: '',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
      },
    ]);
  };

  const handleItemProcedureSelect = (itemId: string, procedureId: string) => {
    const proc = procedures.find((p) => p.id === procedureId);
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? {
              ...i,
              procedureId: proc?.id,
              procedureName: proc?.name || i.procedureName,
              unitPrice: proc?.defaultPrice ?? i.unitPrice,
              totalPrice: computeItemTotal(i.quantity, proc?.defaultPrice ?? i.unitPrice),
            }
          : i
      )
    );
  };

  const handleItemChange = (itemId: string, patch: Partial<BudgetItem>) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== itemId) return i;
        const merged = { ...i, ...patch };
        merged.totalPrice = computeItemTotal(merged.quantity, merged.unitPrice);
        return merged;
      })
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const professionalOptions = clinicalProfessionals.map((p) => ({ value: p.id, label: p.name }));
  const procedureOptions = [
    { value: '', label: 'Selecione um procedimento...' },
    ...procedures.map((p) => ({ value: p.id, label: p.name })),
  ];

  const handleSubmit = async (targetStatus?: Budget['status']) => {
    if (!selectedPatientId) {
      setError('Selecione o paciente.');
      return;
    }
    if (items.length === 0 || items.some((i) => !i.procedureName.trim())) {
      setError('Adicione ao menos um item com procedimento definido.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await db.saveBudget({
        id: budgetToEdit?.id,
        patientId: selectedPatientId,
        patientName,
        status: targetStatus,
        items,
        subtotal: totals.subtotal,
        discountType: discountType || null,
        discountValue,
        total: totals.total,
        validUntil: validUntil || null,
        notes,
      });
      if (!res.success) {
        setError(res.error || 'Erro ao salvar orçamento.');
        return;
      }
      toast.success(budgetToEdit ? 'Orçamento atualizado.' : 'Orçamento criado.');
      onSaved();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <ClipboardList className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">{budgetToEdit ? 'Editar Orçamento' : 'Novo Orçamento'}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">{error}</div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Paciente <span className="text-rose-500">*</span>
            </label>
            <PatientSearchSelect patients={patients} value={selectedPatientId} onChange={handlePatientSelect} placeholder="Buscar paciente..." />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">Itens do Orçamento</label>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 rounded-lg cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar item
              </button>
            </div>

            {items.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-400 text-center">
                Nenhum item adicionado ainda.
              </div>
            ) : (
              <div className="space-y-2.5">
                {items.map((item) => (
                  <div key={item.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-2.5 items-end">
                    <div className="sm:col-span-3 min-w-0">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Procedimento</label>
                      <CustomSelect
                        options={procedureOptions}
                        value={item.procedureId || ''}
                        onChange={(v) => handleItemProcedureSelect(item.id, v)}
                        searchable
                      />
                      {!item.procedureId && (
                        <input
                          type="text"
                          value={item.procedureName}
                          onChange={(e) => handleItemChange(item.id, { procedureName: e.target.value })}
                          placeholder="Ou digite o nome livre"
                          className="mt-1.5 w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5"
                        />
                      )}
                    </div>
                    <div className="sm:col-span-3 min-w-0">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Profissional</label>
                      <CustomSelect
                        options={[{ value: '', label: 'Não definido' }, ...professionalOptions]}
                        value={item.professionalId || ''}
                        onChange={(v) => {
                          const prof = clinicalProfessionals.find((p) => p.id === v);
                          handleItemChange(item.id, { professionalId: prof?.id, professionalName: prof?.name });
                        }}
                      />
                    </div>
                    <div className="sm:col-span-1 min-w-0">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Qtd.</label>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => handleItemChange(item.id, { quantity: Number(e.target.value) || 1 })}
                        className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5 text-center"
                      />
                    </div>
                    <div className="sm:col-span-2 min-w-0">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Valor unit.</label>
                      <CurrencyInput value={item.unitPrice} onChange={(v) => handleItemChange(item.id, { unitPrice: v })} />
                    </div>
                    {/* Total do item: largura própria (col-span-2, min-w garantido) e whitespace-nowrap —
                        nunca deixar o navegador quebrar "R$ 1.257,14" no meio do número (ver BudgetModal
                        no relatório de auditoria: o `body` global tem overflow-wrap: anywhere, que só não
                        se aplica dentro de table/input/textarea; nowrap é o que garante isso aqui). */}
                    <div className="sm:col-span-2 min-w-[92px] text-right">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">Total</label>
                      <span className="text-xs font-bold text-slate-800 whitespace-nowrap tabular-nums">{formatCurrency(item.totalPrice)}</span>
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <button type="button" onClick={() => handleRemoveItem(item.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Desconto</label>
              <CustomSelect
                options={[
                  { value: '', label: 'Sem desconto' },
                  { value: 'PERCENT', label: 'Percentual (%)' },
                  { value: 'FIXED', label: 'Valor fixo (R$)' },
                ]}
                value={discountType}
                onChange={(v) => setDiscountType(v as any)}
              />
            </div>
            {discountType && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Valor do desconto {discountType === 'PERCENT' ? '(%)' : '(R$)'}
                </label>
                {discountType === 'PERCENT' ? (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                    className="w-full text-sm rounded-xl border border-slate-200 px-3.5 py-2.5"
                  />
                ) : (
                  <CurrencyInput value={discountValue} onChange={setDiscountValue} />
                )}
              </div>
            )}
            <div>
              <DatePicker label="Válido até" value={validUntil} onChange={setValidUntil} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Observações</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-1">
            <div className="flex justify-between gap-3 text-xs text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono whitespace-nowrap tabular-nums">{formatCurrency(totals.subtotal)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between gap-3 text-xs text-rose-600">
                <span>Desconto</span>
                <span className="font-mono whitespace-nowrap tabular-nums">- {formatCurrency(totals.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between gap-3 text-sm font-bold text-slate-900 pt-1 border-t border-indigo-200/60">
              <span>Total</span>
              <span className="font-mono whitespace-nowrap tabular-nums">{formatCurrency(totals.total)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer">
            Cancelar
          </button>
          {!budgetToEdit && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('RASCUNHO')}
              className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer disabled:opacity-50"
            >
              Salvar rascunho
            </button>
          )}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSubmit(budgetToEdit ? undefined : 'APRESENTADO')}
            className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? 'Salvando...' : budgetToEdit ? 'Salvar alterações' : 'Salvar e apresentar'}
          </button>
        </div>
      </div>
    </div>
  );
};
