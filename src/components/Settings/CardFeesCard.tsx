import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, CheckCircle, Plus, Copy, Power, Calculator } from 'lucide-react';
import { db } from '../../lib/db';
import { CardBrand, CardFeeRule, CardFeeSettings, CardFeeType, ReceivingMode } from '../../types';
import { useToast, CustomSelect } from '../UI';
import { formatCurrency, formatDateBr } from '../../lib/masks';
import {
  CREDIT_INSTALLMENTS,
  ensureDefaultBrands,
  hasLegacyFees,
  newBrandId,
  simulateCardFee,
  validateFeeRule,
  formatFeeRule,
  missingFeeMessage,
  getActiveSettlementProfile,
  isAnticipationEnabled,
  getDefaultReceivingMode,
  settlementProfileLabel,
  computeSettlementDate,
  planCardSchedule,
  receivingModeLabel,
} from '../../lib/cardFees';

// Rascunho de UMA taxa: tipo + texto digitado (vazio = não configurada;
// "0" = configurada como zero). Nada é gravado até "Salvar Taxas da Maquininha".
interface DraftRule {
  type: CardFeeType;
  text: string;
}
type DraftRules = Record<string, DraftRule>;

// Tabela A = recebimento ANTECIPADO (campos brand.debit/credit, preserva as taxas D+1 já cadastradas);
// tabela N = recebimento NORMAL (brand.normal). Nunca misturar.
type FeeTable = 'A' | 'N';
const debitKey = (brandId: string, t: FeeTable) => `${brandId}|${t}|D`;
const creditKey = (brandId: string, n: number, t: FeeTable) => `${brandId}|${t}|C|${n}`;

function ruleToDraft(rule?: CardFeeRule): DraftRule {
  if (!rule) return { type: 'PERCENTAGE', text: '' };
  return { type: rule.type, text: String(rule.value).replace('.', ',') };
}

function settingsToDraft(settings: CardFeeSettings): { brands: CardBrand[]; rules: DraftRules } {
  const seeded = ensureDefaultBrands(settings);
  const brands = (seeded.brands || []).map((b) => ({ id: b.id, name: b.name, active: b.active !== false }));
  const rules: DraftRules = {};
  (seeded.brands || []).forEach((b) => {
    rules[debitKey(b.id, 'A')] = ruleToDraft(b.debit);
    rules[debitKey(b.id, 'N')] = ruleToDraft(b.normal?.debit);
    CREDIT_INSTALLMENTS.forEach((n) => {
      rules[creditKey(b.id, n, 'A')] = ruleToDraft(b.credit?.[n]);
      rules[creditKey(b.id, n, 'N')] = ruleToDraft(b.normal?.credit?.[n]);
    });
  });
  return { brands, rules };
}

function parseText(text: string): number {
  return Number(text.trim().replace(/\./g, '').replace(',', '.'));
}

// Converte o rascunho em CardFeeSettings; devolve erro descritivo (sem gravar nada) se algum campo for inválido.
function draftToSettings(
  brands: CardBrand[],
  rules: DraftRules,
  legacy: CardFeeSettings,
  flags: { anticipationEnabled: boolean; defaultReceivingMode: ReceivingMode }
): { settings?: CardFeeSettings; error?: string } {
  const out: CardBrand[] = [];
  for (const b of brands) {
    const brand: CardBrand = { id: b.id, name: b.name, active: b.active };
    const tableName = (t: FeeTable) => (t === 'A' ? 'antecipado' : 'normal');
    for (const t of ['A', 'N'] as FeeTable[]) {
      const assignDebit = (r: CardFeeRule) => {
        if (t === 'A') brand.debit = r;
        else brand.normal = { ...(brand.normal || {}), debit: r };
      };
      const assignCredit = (n: number, r: CardFeeRule) => {
        if (t === 'A') brand.credit = { ...(brand.credit || {}), [n]: r };
        else brand.normal = { ...(brand.normal || {}), credit: { ...(brand.normal?.credit || {}), [n]: r } };
      };
      const entries: Array<[string, string, (r: CardFeeRule) => void]> = [
        [debitKey(b.id, t), `${b.name} • ${tableName(t)} • Débito`, assignDebit],
        ...CREDIT_INSTALLMENTS.map((n): [string, string, (r: CardFeeRule) => void] => [
          creditKey(b.id, n, t),
          `${b.name} • ${tableName(t)} • Crédito ${n}x`,
          (r) => assignCredit(n, r),
        ]),
      ];
      for (const [key, label, assign] of entries) {
        const d = rules[key];
        if (!d || d.text.trim() === '') continue; // não configurada
        const value = parseText(d.text);
        const check = validateFeeRule({ type: d.type, value });
        if (!check.valid) return { error: `${label}: ${check.error}` };
        assign({ type: d.type, value });
      }
    }
    out.push(brand);
  }
  return {
    settings: {
      debit: legacy.debit,
      credit: legacy.credit,
      brands: out,
      settlementProfile: getActiveSettlementProfile(legacy),
      anticipationEnabled: flags.anticipationEnabled,
      defaultReceivingMode: flags.defaultReceivingMode,
    },
  };
}

const RuleInput: React.FC<{
  label: string;
  draft: DraftRule;
  onChange: (d: DraftRule) => void;
}> = ({ label, draft, onChange }) => {
  const invalid = draft.text.trim() !== '' && !validateFeeRule({ type: draft.type, value: parseText(draft.text) }).valid;
  return (
    <div className={`min-w-0 p-3.5 bg-white rounded-xl border shadow-2xs space-y-2.5 ${invalid ? 'border-rose-400' : 'border-slate-200'}`}>
      <span className="block text-sm font-bold text-slate-800">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={draft.type}
          onChange={(e) => onChange({ ...draft, type: e.target.value as CardFeeType })}
          className="flex-1 basis-[150px] min-w-[150px] text-xs rounded-lg border border-slate-200 bg-white py-2.5 px-2.5 text-slate-700 font-semibold"
          aria-label={`Tipo da taxa ${label}`}
        >
          <option value="PERCENTAGE">Percentual (%)</option>
          <option value="FIXED">Valor fixo (R$)</option>
        </select>
        <div className="relative flex-1 basis-[130px] min-w-[130px]">
          {draft.type === 'FIXED' && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold pointer-events-none">R$</span>
          )}
          <input
            type="text"
            inputMode="decimal"
            placeholder="Não configurado"
            aria-label={`Valor da taxa ${label}`}
            value={draft.text}
            onChange={(e) => onChange({ ...draft, text: e.target.value.replace(/[^0-9,.]/g, '') })}
            className={`w-full text-xs rounded-lg border border-slate-200 py-2.5 bg-white text-slate-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 ${
              draft.type === 'FIXED' ? 'pl-9 pr-3 text-left' : 'pl-3 pr-8 text-left'
            }`}
          />
          {draft.type === 'PERCENTAGE' && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold pointer-events-none">%</span>
          )}
        </div>
      </div>
    </div>
  );
};

const RULE_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3';

export const CardFeesCard: React.FC<{ resetKey?: unknown; onSaved?: () => void }> = ({ resetKey, onSaved }) => {
  const toast = useToast();
  const [saved, setSaved] = useState<CardFeeSettings>(() => db.getPreferences().cardFees || {});
  const [brands, setBrands] = useState<CardBrand[]>(() => settingsToDraft(db.getPreferences().cardFees || {}).brands);
  const [rules, setRules] = useState<DraftRules>(() => settingsToDraft(db.getPreferences().cardFees || {}).rules);
  const [selectedId, setSelectedId] = useState<string>(() => brands[0]?.id || '');
  const [table, setTable] = useState<FeeTable>(() => (isAnticipationEnabled(db.getPreferences().cardFees) ? 'A' : 'N'));
  const [anticipationEnabled, setAnticipationEnabled] = useState<boolean>(() => isAnticipationEnabled(db.getPreferences().cardFees));
  const [defaultMode, setDefaultMode] = useState<ReceivingMode>(() => db.getPreferences().cardFees?.defaultReceivingMode || 'ANTICIPATED');
  const [isSaving, setIsSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [copyFromId, setCopyFromId] = useState('');
  const [confirmCopy, setConfirmCopy] = useState(false);

  // Recarrega quando a clínica ativa/preferências mudam externamente (Modo Consultoria).
  useEffect(() => {
    const fees = db.getPreferences().cardFees || {};
    const d = settingsToDraft(fees);
    setSaved(fees);
    setBrands(d.brands);
    setRules(d.rules);
    setSelectedId((prev) => (d.brands.some((b) => b.id === prev) ? prev : d.brands[0]?.id || ''));
    setAnticipationEnabled(isAnticipationEnabled(fees));
    setDefaultMode(fees.defaultReceivingMode || 'ANTICIPATED');
    setTable(isAnticipationEnabled(fees) ? 'A' : 'N');
    setDirty(false);
  }, [resetKey]);

  const selected = brands.find((b) => b.id === selectedId);

  const setRule = (key: string, d: DraftRule) => {
    setRules((prev) => ({ ...prev, [key]: d }));
    setDirty(true);
  };

  const handleAddBrand = () => {
    const name = newBrandName.trim();
    if (!name) {
      toast.warning('Informe o nome da bandeira.');
      return;
    }
    if (brands.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      toast.warning('Já existe uma bandeira com esse nome.');
      return;
    }
    const id = newBrandId();
    setBrands((prev) => [...prev, { id, name, active: true }]);
    setRules((prev) => {
      const next = { ...prev };
      (['A', 'N'] as FeeTable[]).forEach((t) => {
        next[debitKey(id, t)] = ruleToDraft();
        CREDIT_INSTALLMENTS.forEach((n) => (next[creditKey(id, n, t)] = ruleToDraft()));
      });
      return next;
    });
    setSelectedId(id);
    setNewBrandName('');
    setDirty(true);
  };

  const handleToggleActive = (id: string) => {
    setBrands((prev) => prev.map((b) => (b.id === id ? { ...b, active: !b.active } : b)));
    setDirty(true);
  };

  const handleCopy = () => {
    if (!copyFromId || !selected || copyFromId === selected.id) return;
    if (!confirmCopy) {
      setConfirmCopy(true);
      return;
    }
    setRules((prev) => {
      const next = { ...prev };
      next[debitKey(selected.id, table)] = { ...prev[debitKey(copyFromId, table)] };
      CREDIT_INSTALLMENTS.forEach((n) => {
        next[creditKey(selected.id, n, table)] = { ...prev[creditKey(copyFromId, n, table)] };
      });
      return next;
    });
    setConfirmCopy(false);
    setCopyFromId('');
    setDirty(true);
    toast.success('Taxas copiadas para o rascunho. Clique em "Salvar Taxas da Maquininha" para confirmar.');
  };

  const handleSave = async () => {
    const built = draftToSettings(brands, rules, saved, { anticipationEnabled, defaultReceivingMode: defaultMode });
    if (!built.settings) {
      toast.error(built.error || 'Taxas inválidas.');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await db.updatePreferencesAsync({ cardFees: built.settings });
      const fees = updated.cardFees || built.settings;
      setSaved(fees);
      setDirty(false);
      toast.success('Taxas de cartão & maquininha salvas com sucesso!');
      onSaved?.();
    } catch {
      toast.error('Erro ao salvar as taxas. Nenhuma alteração foi aplicada — tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-emerald-600" />
          Taxas de Cartão &amp; Maquininha
        </h3>
        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
          Por bandeira
        </span>
      </div>

      <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-emerald-950">Antecipação de recebíveis</span>
          <div className="inline-flex p-0.5 rounded-lg bg-white border border-emerald-200" role="group" aria-label="Antecipação de recebíveis">
            {[
              { v: true, l: 'Ativada' },
              { v: false, l: 'Desativada' },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                onClick={() => {
                  setAnticipationEnabled(o.v);
                  setTable(o.v ? 'A' : 'N');
                  setDirty(true);
                }}
                className={`px-3.5 py-1.5 rounded-md font-bold cursor-pointer transition-colors ${
                  anticipationEnabled === o.v ? 'bg-emerald-600 text-white' : 'text-emerald-800 hover:bg-emerald-50'
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <p className="text-emerald-900/90 leading-relaxed">
          {anticipationEnabled
            ? 'As vendas parceladas são liquidadas antecipadamente conforme o perfil de recebimento configurado.'
            : 'A clínica recebe conforme o cronograma normal das parcelas do cartão.'}
        </p>
        {anticipationEnabled && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <span className="text-emerald-900 font-semibold">Prazo de recebimento antecipado: </span>
              <span className="font-black text-emerald-800">{settlementProfileLabel(getActiveSettlementProfile(saved))}</span>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="default-receiving-mode" className="text-emerald-900 font-semibold">Forma padrão de recebimento do cartão:</label>
              <select
                id="default-receiving-mode"
                value={defaultMode}
                onChange={(e) => {
                  setDefaultMode(e.target.value as ReceivingMode);
                  setDirty(true);
                }}
                className="rounded-lg border border-emerald-200 bg-white py-1.5 px-2.5 font-semibold text-slate-800"
              >
                <option value="ANTICIPATED">Antecipado</option>
                <option value="NORMAL">Normal</option>
              </select>
            </div>
          </div>
        )}
        <p className="text-emerald-900/80 leading-relaxed">
          Cada forma de recebimento tem a sua própria tabela de taxas. As taxas já cadastradas pertencem ao plano antecipado (1 dia útil) e o valor já inclui o custo da antecipação — não cadastre taxa extra. O sistema apenas registra a condição escolhida; não solicita antecipação à operadora.
        </p>
      </div>

      {anticipationEnabled && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-700">Tabela sendo editada:</span>
          {([
            ['A', `Antecipado — ${settlementProfileLabel(getActiveSettlementProfile(saved))}`],
            ['N', 'Normal — sem antecipação'],
          ] as Array<[FeeTable, string]>).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTable(t);
                setConfirmCopy(false);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                table === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500 leading-relaxed">
        Configure a taxa por bandeira, débito/crédito e parcelas — em percentual ou valor fixo. A taxa fixa é o{' '}
        <strong>total da transação</strong> (não é multiplicada pelas parcelas). Alterar uma taxa vale apenas para novos
        lançamentos; lançamentos antigos mantêm a taxa aplicada na época.
      </p>

      {hasLegacyFees(saved) && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
          <strong>Padrão / Sem bandeira (anterior):</strong> a taxa global configurada antes das bandeiras (débito{' '}
          {saved.debit || 0}%, crédito {(Object.entries(saved.credit || {}) as Array<[string, number]>).filter(([, v]) => v > 0).map(([k, v]) => `${k}x ${v}%`).join(', ') || '—'}) foi
          preservada e continua valendo para lançamentos antigos sem bandeira. Novos lançamentos usam a taxa da bandeira escolhida.
        </div>
      )}

      {/* Seletor de bandeira */}
      <div className="flex flex-wrap items-center gap-2">
        {brands.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => {
              setSelectedId(b.id);
              setConfirmCopy(false);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
              b.id === selectedId
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            } ${b.active ? '' : 'opacity-60 line-through'}`}
          >
            {b.name}
            {!b.active && ' (inativa)'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 max-w-2xl">
        <input
          type="text"
          value={newBrandName}
          onChange={(e) => setNewBrandName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddBrand();
            }
          }}
          placeholder="Nome da nova bandeira (ex.: Hipercard)"
          className="flex-1 basis-[260px] min-w-[220px] text-xs rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
        <button
          type="button"
          onClick={handleAddBrand}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar bandeira
        </button>
      </div>

      {selected && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-800">
              {table === 'A' ? `Taxas antecipadas (${settlementProfileLabel(getActiveSettlementProfile(saved))})` : 'Taxas sem antecipação'} — {selected.name} {!selected.active && <span className="text-rose-600">(inativa: não aparece em novos lançamentos)</span>}
            </h4>
            <button
              type="button"
              onClick={() => handleToggleActive(selected.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Power className="w-3 h-3" /> {selected.active ? 'Desativar bandeira' : 'Reativar bandeira'}
            </button>
          </div>

          <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-3">
            <label className="text-xs font-bold text-slate-800">Cartão de Débito</label>
            <div className={RULE_GRID}>
            <RuleInput label="Débito" draft={rules[debitKey(selected.id, table)] || ruleToDraft()} onChange={(d) => setRule(debitKey(selected.id, table), d)} />
            </div>
          </div>

          <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-3">
            <label className="text-xs font-bold text-slate-800">Cartão de Crédito (1x a 12x)</label>
            <div className={RULE_GRID}>
              {CREDIT_INSTALLMENTS.map((n) => (
                <RuleInput
                  key={n}
                  label={`${n}x`}
                  draft={rules[creditKey(selected.id, n, table)] || ruleToDraft()}
                  onChange={(d) => setRule(creditKey(selected.id, n, table), d)}
                />
              ))}
            </div>
          </div>

          {brands.length > 1 && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-bold text-slate-700">Copiar taxas de:</span>
              <select
                value={copyFromId}
                onChange={(e) => {
                  setCopyFromId(e.target.value);
                  setConfirmCopy(false);
                }}
                className="min-w-[180px] rounded-lg border border-slate-200 bg-white py-2 px-3 text-slate-700"
                aria-label="Copiar taxas de"
              >
                <option value="">Selecione a bandeira</option>
                {brands
                  .filter((b) => b.id !== selected.id)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!copyFromId}
                onClick={handleCopy}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold border whitespace-normal cursor-pointer disabled:opacity-40 ${
                  confirmCopy ? 'bg-amber-500 text-white border-amber-500' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Copy className="w-3 h-3" />
                {confirmCopy ? `Confirmar: sobrescrever taxas de ${selected.name}` : 'Copiar taxas'}
              </button>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className={`w-full sm:w-auto sm:min-w-[300px] sm:self-start py-3 px-6 ${
          isSaving ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer'
        } text-white font-bold text-xs rounded-xl shadow-sm hover:shadow transition-all inline-flex items-center justify-center gap-1.5`}
      >
        <CheckCircle className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
        <span>{isSaving ? 'Salvando taxas...' : 'Salvar Taxas da Maquininha'}</span>
      </button>
      {dirty && !isSaving && (
        <p className="text-[11px] text-amber-700 font-semibold text-center">Há alterações não salvas.</p>
      )}

    </div>
  );
};
