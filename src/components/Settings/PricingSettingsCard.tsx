import React, { useEffect, useState } from 'react';
import { Calculator, CheckCircle, Lock, RotateCcw } from 'lucide-react';
import { db } from '../../lib/db';
import { getPricingAccess } from '../../lib/permissions';
import { LEGACY_PRICING_DEFAULTS, resolvePricingParams, validatePricingSettings } from '../../lib/procedureCosting';
import { CurrencyInput, useToast } from '../UI';

/**
 * Parâmetros de precificação da CLÍNICA. Centralizados aqui, alimentam automaticamente todo procedimento novo —
 * ninguém redigita hora clínica/margem em cada cadastro. Visível só com `procedures:costs:view`; editável só com
 * `pricing:manage` (RBAC existente, lib/permissions.ts).
 */
export const PricingSettingsCard: React.FC<{ onSaved?: () => void }> = ({ onSaved }) => {
  const toast = useToast();
  const user = db.getUser();
  const { canViewCosts, canManagePricingParams } = getPricingAccess(user?.role, user?.permissions, user?.isPrimary);

  const [saved, setSaved] = useState(() => resolvePricingParams(db.getPreferences().pricing));
  const [hourRate, setHourRate] = useState<number>(saved.clinicalHourRate);
  const [structureRate, setStructureRate] = useState<number>(saved.structureCostPerHour);
  const [marginText, setMarginText] = useState<string>(String(saved.targetMarginPercent));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = () => {
    const p = resolvePricingParams(db.getPreferences().pricing);
    setSaved(p);
    setHourRate(p.clinicalHourRate);
    setStructureRate(p.structureCostPerHour);
    setMarginText(String(p.targetMarginPercent));
    setDirty(false);
    setErrors({});
  };

  // Recarrega quando as preferências chegam do servidor ou a clínica ativa muda.
  useEffect(() => db.subscribe(() => { if (!dirty) load(); }), [dirty]);

  if (!canViewCosts) return null;

  const margin = Number(marginText.replace(',', '.'));

  const handleSave = async () => {
    const check = validatePricingSettings({ clinicalHourRate: hourRate, structureCostPerHour: structureRate, targetMarginPercent: margin });
    setErrors(check.errors as Record<string, string>);
    if (!check.valid) {
      toast.warning('Confira os parâmetros destacados.');
      return;
    }
    setSaving(true);
    try {
      await db.updatePreferencesAsync({
        pricing: {
          clinicalHourRate: hourRate,
          structureCostPerHour: structureRate,
          targetMarginPercent: margin,
          updatedAt: new Date().toISOString(),
        },
      });
      load();
      toast.success('Parâmetros de precificação salvos. Valem para os próximos procedimentos.');
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefaults = async () => {
    setSaving(true);
    try {
      await db.updatePreferencesAsync({ pricing: undefined });
      load();
      toast.info('A clínica voltou a usar os padrões do sistema.');
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const readOnly = !canManagePricingParams;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4" data-testid="pricing-settings-card">
      <div className="pb-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-emerald-600" />
          Precificação de Procedimentos
        </h3>
        {saved.configured ? (
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Configurada
          </span>
        ) : (
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
            Padrões do sistema
          </span>
        )}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Estes valores alimentam automaticamente todo procedimento novo: a recepção não precisa conhecê-los nem digitá-los em cada
        cadastro. Alterar aqui vale para os próximos procedimentos; os já cadastrados mantêm o custo com que foram gravados.
      </p>

      {!saved.configured && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
          A clínica ainda não salvou seus parâmetros. Enquanto isso valem os padrões do sistema (hora clínica{' '}
          {LEGACY_PRICING_DEFAULTS.clinicalHourRate.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, margem{' '}
          {LEGACY_PRICING_DEFAULTS.targetMarginPercent}%) e o sistema <strong>não avalia</strong> se a margem de um procedimento está
          saudável.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <CurrencyInput
            label="Valor da hora clínica (R$/h)"
            value={hourRate}
            onChange={(v) => {
              setHourRate(v);
              setDirty(true);
            }}
            disabled={readOnly}
            error={errors.clinicalHourRate}
            id="pricing-hour-rate"
          />
          <p className="text-[10px] text-slate-500 mt-1">Quanto vale a hora do dentista na cadeira.</p>
        </div>
        <div>
          <CurrencyInput
            label="Custo/hora da estrutura ou cadeira (R$/h)"
            value={structureRate}
            onChange={(v) => {
              setStructureRate(v);
              setDirty(true);
            }}
            disabled={readOnly}
            error={errors.structureCostPerHour}
            id="pricing-structure-rate"
          />
          <p className="text-[10px] text-slate-500 mt-1">Opcional. Somado à hora clínica; deixe em branco se já estiver incluído nela.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="pricing-margin">
            Margem padrão desejada (%)
          </label>
          <div className="relative">
            <input
              id="pricing-margin"
              type="text"
              inputMode="decimal"
              disabled={readOnly}
              value={marginText}
              onChange={(e) => {
                setMarginText(e.target.value);
                setDirty(true);
              }}
              className="w-full pl-3 pr-8 py-2.5 text-xs font-bold text-slate-900 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-teal-500 font-mono disabled:bg-slate-50"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
          </div>
          {errors.targetMarginPercent && <p className="text-[10px] text-rose-600 mt-1">{errors.targetMarginPercent}</p>}
          <p className="text-[10px] text-slate-500 mt-1">Base do preço sugerido e da avaliação da margem.</p>
        </div>
      </div>

      {readOnly ? (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Lock className="w-3.5 h-3.5" /> Você pode consultar os parâmetros, mas só quem gerencia a precificação pode alterá-los.
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {saved.configured && (
            <button
              type="button"
              onClick={handleRestoreDefaults}
              disabled={saving}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Voltar aos padrões
            </button>
          )}
          <button
            type="button"
            data-testid="pricing-save"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar parâmetros'}
          </button>
        </div>
      )}
    </div>
  );
};
