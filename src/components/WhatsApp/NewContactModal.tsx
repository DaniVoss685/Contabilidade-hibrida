import React, { useState, useEffect } from 'react';
import { X, UserPlus, Phone, User, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { WhatsAppContact, WhatsAppConversation } from '../../types/whatsapp';
import { supabase } from '../../lib/supabaseClient';
import { normalizeBrazilianNumber, formatPhoneDisplay } from '../../lib/phoneUtils';

interface NewContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onContactCreated: (contact: WhatsAppContact, conversation: WhatsAppConversation) => void;
}

export const NewContactModal: React.FC<NewContactModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  onContactCreated,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<{ id: string; name: string; phone?: string; cpf?: string }[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setPhone('');
      setSelectedPatientId(null);
      setPatientSearch('');
      setError(null);
      loadPatients();
    }
  }, [isOpen, tenantId]);

  const loadPatients = async () => {
    setLoadingPatients(true);
    try {
      const { data } = await supabase
        .from('df_patients')
        .select('id, name, phone, cpf')
        .eq('tenant_id', tenantId)
        .order('name')
        .limit(50);

      setPatients(data || []);
    } catch (e) {
      console.warn('Erro ao carregar pacientes:', e);
    } finally {
      setLoadingPatients(false);
    }
  };

  const handleSelectPatient = (p: { id: string; name: string; phone?: string }) => {
    setSelectedPatientId(p.id);
    setName(p.name);
    if (p.phone) {
      setPhone(formatPhoneDisplay(p.phone));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Informe o nome do contato.');
      return;
    }
    const cleanNumber = normalizeBrazilianNumber(phone);
    if (!cleanNumber || cleanNumber.length < 10) {
      setError('Informe um número de WhatsApp válido com DDD.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await DentalWhatsAppService.createContact(
        tenantId,
        name.trim(),
        cleanNumber,
        selectedPatientId || undefined
      );

      if (res) {
        onContactCreated(res.contact, res.conversation);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Falha ao cadastrar contato.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const filteredPatients = patientSearch.trim()
    ? patients.filter(
        (p) =>
          p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
          (p.cpf && p.cpf.includes(patientSearch)) ||
          (p.phone && p.phone.includes(patientSearch))
      )
    : patients;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Novo Contato WhatsApp</h3>
              <p className="text-xs text-slate-500">Inicie uma conversa ou cadastre um paciente</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Vincular Paciente Existente */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Vincular a Paciente Cadastrado (Opcional)
            </label>
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder="Pesquisar paciente por nome, CPF ou fone..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {patientSearch.trim() && (
              <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white mb-2">
                {filteredPatients.length === 0 ? (
                  <div className="p-2.5 text-xs text-slate-400 text-center">Nenhum paciente encontrado</div>
                ) : (
                  filteredPatients.slice(0, 5).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPatient(p)}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-emerald-50/50 transition-colors cursor-pointer ${
                        selectedPatientId === p.id ? 'bg-emerald-50 font-semibold text-emerald-900' : 'text-slate-700'
                      }`}
                    >
                      <div className="truncate">
                        <span className="font-medium">{p.name}</span>
                        {p.phone && <span className="text-slate-400 ml-2">({p.phone})</span>}
                      </div>
                      {selectedPatientId === p.id && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nome do Contato <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Dra. Mariana Costa ou João Silva"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Telefone / WhatsApp */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Telefone / WhatsApp com DDD <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Aceita formato com DDD: 11999998888 ou (11) 99999-8888
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : 'Iniciar Conversa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
