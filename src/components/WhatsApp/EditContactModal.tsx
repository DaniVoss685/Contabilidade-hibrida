import React, { useState, useEffect } from 'react';
import { X, UserCheck, RefreshCw, User, Phone, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { WhatsAppContact } from '../../types/whatsapp';
import { supabase } from '../../lib/supabaseClient';
import { formatPhoneDisplay } from '../../lib/phoneUtils';

interface EditContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: WhatsAppContact;
  tenantId: string;
  onUpdated: (updated: WhatsAppContact) => void;
}

export const EditContactModal: React.FC<EditContactModalProps> = ({
  isOpen,
  onClose,
  contact,
  tenantId,
  onUpdated,
}) => {
  const [name, setName] = useState(contact.name);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(contact.patient_id || null);
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<{ id: string; name: string; cpf?: string; phone?: string }[]>([]);
  const [syncingPhoto, setSyncingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(contact.name);
      setSelectedPatientId(contact.patient_id || null);
      setPatientSearch('');
      setError(null);
      loadPatients();
    }
  }, [isOpen, contact]);

  const loadPatients = async () => {
    try {
      const { data } = await supabase
        .from('df_patients')
        .select('id, name, cpf, phone')
        .eq('tenant_id', tenantId)
        .order('name')
        .limit(50);
      setPatients(data || []);
    } catch (err) {
      console.warn('Erro ao listar pacientes:', err);
    }
  };

  const handleSyncPhoto = async () => {
    setSyncingPhoto(true);
    try {
      const newPicUrl = await DentalWhatsAppService.syncProfilePic(
        contact.id,
        tenantId,
        contact.whatsapp_number
      );
      if (newPicUrl) {
        onUpdated({ ...contact, profile_pic_url: newPicUrl });
      }
    } catch (e) {
      console.warn('Erro ao sincronizar foto:', e);
    } finally {
      setSyncingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('O nome é obrigatório.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updated = await DentalWhatsAppService.updateContact(contact.id, tenantId, {
        name: name.trim(),
        patient_id: selectedPatientId || null,
      });

      if (updated) {
        onUpdated(updated);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar alterações.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Editar Contato</h3>
              <p className="text-xs text-slate-500">{formatPhoneDisplay(contact.whatsapp_number)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Foto de perfil e botão de sincronizar */}
          <div className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg overflow-hidden border border-slate-200 shrink-0">
              {contact.profile_pic_url ? (
                <img src={contact.profile_pic_url} alt={contact.name} className="w-full h-full object-cover" />
              ) : (
                <span>{contact.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-700">Foto do WhatsApp</p>
              <p className="text-[11px] text-slate-400">
                {contact.profile_pic_synced_at
                  ? `Sincronizada em ${new Date(contact.profile_pic_synced_at).toLocaleDateString()}`
                  : 'Ainda não sincronizada'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSyncPhoto}
              disabled={syncingPhoto}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingPhoto ? 'animate-spin' : ''}`} />
              {syncingPhoto ? 'Sincronizando...' : 'Atualizar Foto'}
            </button>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome de Exibição</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Paciente Vinculado */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Paciente Vinculado do Sistema
            </label>
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder="Buscar paciente para vincular..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden"
              />
            </div>

            {selectedPatientId && (
              <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 mb-2">
                <span className="font-semibold">
                  Paciente: {patients.find((p) => p.id === selectedPatientId)?.name || 'Vinculado'}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedPatientId(null)}
                  className="text-rose-600 hover:text-rose-700 text-xs font-semibold cursor-pointer"
                >
                  Desvincular
                </button>
              </div>
            )}

            {patientSearch.trim() && (
              <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                {patients
                  .filter((p) => p.name.toLowerCase().includes(patientSearch.toLowerCase()))
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedPatientId(p.id);
                        setPatientSearch('');
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <span className="font-medium">{p.name}</span>
                      {selectedPatientId === p.id && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                    </button>
                  ))}
              </div>
            )}
          </div>

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
              disabled={saving}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
