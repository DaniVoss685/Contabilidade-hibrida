import React, { useState } from 'react';
import { Users, Plus, Pencil, Lock, Power, X } from 'lucide-react';
import { db } from '../../lib/db';
import { hasPermission } from '../../lib/permissions';
import { ClinicalProfessional } from '../../types';
import { useToast } from '../UI';

/**
 * Equipe de profissionais CLÍNICOS (dentistas/atendentes) — distinto do cadastro fiscal único da
 * clínica. USUÁRIO/LOGIN ≠ PROFISSIONAL: duas dentistas podem compartilhar o mesmo login e cada
 * uma ter seu próprio cartão aqui, usado por Agenda/Prontuário/Procedimentos/mensagens automáticas.
 * Visível a quem gerencia (professionals:manage); os demais nunca veem este card (roster não é
 * informação sensível o bastante para exibir read-only, e hoje não há tela de consulta separada).
 */
export const ProfessionalsRosterCard: React.FC<{ onSaved?: () => void }> = ({ onSaved }) => {
  const toast = useToast();
  const user = db.getUser();
  const canManage = hasPermission(user?.role, 'professionals:manage', user?.permissions, user?.isPrimary);

  const [professionals, setProfessionals] = useState<ClinicalProfessional[]>(() => db.getClinicalProfessionals());
  const [editing, setEditing] = useState<ClinicalProfessional | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [cro, setCro] = useState('');
  const [croUf, setCroUf] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [color, setColor] = useState('#0d9488');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => db.subscribe(() => setProfessionals(db.getClinicalProfessionals())), []);

  if (!canManage) return null;

  const openCreate = () => {
    setEditing(null);
    setName('');
    setCro('');
    setCroUf('');
    setEspecialidade('');
    setColor('#0d9488');
    setIsCreating(true);
  };

  const openEdit = (p: ClinicalProfessional) => {
    setEditing(p);
    setName(p.name);
    setCro(p.cro || '');
    setCroUf(p.croUf || '');
    setEspecialidade(p.especialidade || '');
    setColor(p.color || '#0d9488');
    setIsCreating(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.warning('Informe o nome da profissional.');
      return;
    }
    setSaving(true);
    try {
      const saved = await db.saveClinicalProfessional({
        id: editing?.id,
        name: name.trim(),
        cro: cro.trim() || null,
        croUf: croUf.trim() || null,
        especialidade: especialidade.trim() || null,
        color: color || null,
        isActive: editing?.isActive ?? true,
      });
      if (!saved) {
        toast.error('Não foi possível salvar a profissional.');
        return;
      }
      toast.success(editing ? 'Profissional atualizada.' : 'Profissional cadastrada.');
      setIsCreating(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (p: ClinicalProfessional) => {
    const ok = await db.setClinicalProfessionalActive(p.id, !p.isActive);
    if (ok) {
      toast.success(p.isActive ? `${p.name} desativada.` : `${p.name} reativada.`);
      onSaved?.();
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4" data-testid="professionals-roster-card">
      <div className="pb-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-4 h-4 text-teal-600" />
          Profissionais Clínicos
        </h3>
        <button
          type="button"
          onClick={openCreate}
          className="px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Nova profissional
        </button>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Duas dentistas podem usar o mesmo login da clínica — cadastre cada uma aqui para que Agenda,
        Procedimentos, Prontuário e mensagens automáticas saibam sempre quem realmente atendeu, mesmo
        quando o login não diferencia. Desativar preserva o histórico; só some das opções para novos
        agendamentos/registros.
      </p>

      {professionals.length === 0 ? (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
          Nenhuma profissional cadastrada ainda. Enquanto isso, Agenda e Prontuário continuam usando o
          responsável fiscal único da clínica.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {professionals.map((p) => (
            <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: p.color || '#0d9488' }}
                />
                <div className="min-w-0">
                  <p className={`text-sm font-semibold truncate ${p.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                    {p.name}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {[p.cro ? `CRO-${p.croUf || 'SP'} ${p.cro}` : null, p.especialidade].filter(Boolean).join(' • ') || 'Sem CRO/especialidade informados'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!p.isActive && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                    Inativa
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="p-1.5 text-slate-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                  title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleActive(p)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${p.isActive ? 'text-slate-400 hover:text-rose-700 hover:bg-rose-50' : 'text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'}`}
                  title={p.isActive ? 'Desativar' : 'Reativar'}
                >
                  <Power className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto" onClick={() => setIsCreating(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[calc(100dvh-2rem)] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 flex-shrink-0">
              <h4 className="text-sm font-bold text-slate-900">{editing ? 'Editar profissional' : 'Nova profissional'}</h4>
              <button type="button" onClick={() => setIsCreating(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3.5 overflow-y-auto flex-1 min-h-0">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nome *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dra. Bruna Costa"
                  className="w-full text-sm rounded-xl border border-slate-200 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">CRO</label>
                  <input
                    type="text"
                    value={cro}
                    onChange={(e) => setCro(e.target.value)}
                    className="w-full text-sm rounded-xl border border-slate-200 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">UF do CRO</label>
                  <input
                    type="text"
                    value={croUf}
                    onChange={(e) => setCroUf(e.target.value.toUpperCase().slice(0, 2))}
                    maxLength={2}
                    className="w-full text-sm rounded-xl border border-slate-200 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Especialidade</label>
                <input
                  type="text"
                  value={especialidade}
                  onChange={(e) => setEspecialidade(e.target.value)}
                  placeholder="Ortodontia, Implantodontia..."
                  className="w-full text-sm rounded-xl border border-slate-200 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Cor na agenda</label>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-14 h-9 rounded-lg border border-slate-200 cursor-pointer" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 flex-shrink-0 bg-white">
              <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
