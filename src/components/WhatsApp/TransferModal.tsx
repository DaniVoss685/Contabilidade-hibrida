import React, { useState, useEffect } from 'react';
import { X, ArrowRightLeft, User, AlertCircle, MessageSquare } from 'lucide-react';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { hasPermission, getRoleLabel } from '../../lib/permissions';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  tenantId: string;
  currentUserId?: string;
  onTransferred: (toUserId: string) => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  tenantId,
  currentUserId,
  onTransferred,
}) => {
  const [staff, setStaff] = useState<{ id: string; name: string; role?: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [reason, setReason] = useState('');
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedUserId('');
      setReason('');
      setError(null);
      loadStaff();
    }
  }, [isOpen, tenantId]);

  const loadStaff = async () => {
    setLoadingStaff(true);
    try {
      const data = await DentalWhatsAppService.getStaff(tenantId);
      // Filtrar o próprio usuário atual E membros que possuem permissão de WhatsApp
      const available = data.filter(
        (u) => u.id !== currentUserId && hasPermission(u.role, 'whatsapp:chat')
      );
      setStaff(available);
      if (available.length > 0) {
        setSelectedUserId(available[0].id);
      }
    } catch (e) {
      console.warn('Erro ao carregar equipe:', e);
    } finally {
      setLoadingStaff(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError('Selecione o profissional de destino.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await DentalWhatsAppService.transferConversation({
        conversationId,
        tenantId,
        fromUserId: currentUserId,
        toUserId: selectedUserId,
        reason: reason.trim() || undefined,
      });

      if (res.success) {
        onTransferred(selectedUserId);
        onClose();
      } else {
        setError(res.error || 'Erro ao transferir atendimento.');
      }
    } catch (err: any) {
      setError(err?.message || 'Falha ao processar transferência.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-md w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Transferir Atendimento</h3>
              <p className="text-xs text-slate-500">Repassar conversa para outro membro da clínica</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleTransfer} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Seleção do Atendente */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Destinatário da Transferência <span className="text-rose-500">*</span>
            </label>
            {loadingStaff ? (
              <div className="text-xs text-slate-400 py-2">Carregando profissionais...</div>
            ) : staff.length === 0 ? (
              <div className="p-3 bg-amber-50 text-amber-800 text-xs rounded-xl border border-amber-200">
                Nenhum outro profissional ativo encontrado nesta clínica.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {staff.map((u) => (
                  <label
                    key={u.id}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors text-xs ${
                      selectedUserId === u.id
                        ? 'bg-purple-50/80 border-purple-300 font-semibold text-purple-950'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-[11px]">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{u.name}</p>
                        {u.role && <p className="text-[10px] text-slate-400">{getRoleLabel(u.role)}</p>}
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="toUserId"
                      value={u.id}
                      checked={selectedUserId === u.id}
                      onChange={() => setSelectedUserId(u.id)}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Motivo / Contexto */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Motivo ou Contexto para o Colega (Opcional)
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Paciente tem dúvidas sobre o orçamento ortodôntico..."
              className="w-full p-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 resize-none"
            />
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
              disabled={submitting || !selectedUserId}
              className="px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Transferindo...' : 'Confirmar Transferência'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
