import React, { useState, useEffect, useMemo } from 'react';
import { User, X, Loader2, Phone, Mail, FileText, AlertCircle } from 'lucide-react';
import { Patient } from '../../types';
import { db } from '../../lib/db';
import { formatCpf, formatPhone, isValidCpf, isValidEmail } from '../../lib/masks';
import { ConfirmDialog, SuccessDialog } from '../UI';

export interface PatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (patient: Patient) => void;
  initialData?: {
    name?: string;
    cpf?: string;
    phone?: string;
    email?: string;
  } | null;
}

export const PatientModal: React.FC<PatientModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirmDiscard, setShowConfirmDiscard] = useState(false);
  const [createdPatient, setCreatedPatient] = useState<Patient | null>(null);

  // Inicializa os campos quando o modal abre
  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || '');
      setCpf(initialData?.cpf ? formatCpf(initialData.cpf) : '');
      setPhone(initialData?.phone ? formatPhone(initialData.phone) : '');
      setEmail(initialData?.email || '');
      setErrors({});
      setIsDirty(false);
      setIsSubmitting(false);
      setShowConfirmDiscard(false);
      setCreatedPatient(null);
    }
  }, [isOpen, initialData]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Nome completo é obrigatório.';
    } else if (name.trim().length < 3) {
      newErrors.name = 'Informe o nome completo do paciente.';
    }

    const cleanCpf = cpf.replace(/\D/g, '');
    if (!cleanCpf) {
      newErrors.cpf = 'CPF é obrigatório.';
    } else if (cleanCpf.length !== 11) {
      newErrors.cpf = 'O CPF deve conter exatamente 11 dígitos.';
    } else if (!isValidCpf(cleanCpf)) {
      newErrors.cpf = 'CPF inválido. Verifique os dígitos digitados.';
    } else {
      // Checar duplicidade no banco
      const existing = db.getPatients().find((p) => p.cpf.replace(/\D/g, '') === cleanCpf);
      if (existing) {
        newErrors.cpf = `Já existe um paciente cadastrado com este CPF (${existing.name}).`;
      }
    }

    if (email.trim() && !isValidEmail(email)) {
      newErrors.email = 'E-mail em formato inválido.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCpfChange = (val: string) => {
    setCpf(formatCpf(val));
    setIsDirty(true);
    if (errors.cpf) {
      setErrors((prev) => ({ ...prev, cpf: '' }));
    }
  };

  const handlePhoneChange = (val: string) => {
    setPhone(formatPhone(val));
    setIsDirty(true);
  };

  const handleCloseAttempt = () => {
    if (isDirty) {
      setShowConfirmDiscard(true);
    } else {
      onClose();
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const cleanCpf = cpf.replace(/\D/g, '');
      const created = db.addPatient({
        name: name.trim(),
        cpf: cleanCpf,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      });

      setIsDirty(false);
      setCreatedPatient(created);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndCloseFromDialog = () => {
    setShowConfirmDiscard(false);
    handleSubmit();
  };

  const handleConfirmDiscard = () => {
    setShowConfirmDiscard(false);
    setIsDirty(false);
    onClose();
  };

  const handleSuccessClose = () => {
    if (createdPatient && onSave) {
      onSave(createdPatient);
    }
    setCreatedPatient(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200/80 animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-700 shadow-2xs">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  Cadastrar Novo Paciente
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dados cadastrais para prontuário e emissão fiscal
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseAttempt}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Nome Completo */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nome Completo do Paciente <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Mariana Santos Lima"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setIsDirty(true);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                }}
                className={`w-full text-xs rounded-xl border p-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all ${
                  errors.name
                    ? 'border-rose-500 ring-2 ring-rose-500/20'
                    : 'border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                }`}
                required
              />
              {errors.name && (
                <p className="text-[11px] font-medium text-rose-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  {errors.name}
                </p>
              )}
            </div>

            {/* CPF */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                CPF do Paciente <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="000.000.000-00"
                maxLength={14}
                value={cpf}
                onChange={(e) => handleCpfChange(e.target.value)}
                className={`w-full text-xs rounded-xl border p-2.5 bg-white font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all ${
                  errors.cpf
                    ? 'border-rose-500 ring-2 ring-rose-500/20'
                    : 'border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                }`}
                required
              />
              {errors.cpf && (
                <p className="text-[11px] font-medium text-rose-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  {errors.cpf}
                </p>
              )}
              <p className="text-[10.5px] text-slate-400 mt-1">
                Necessário para cruzamento no Carnê-Leão e NFS-e.
              </p>
            </div>

            {/* Telefone & E-mail */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Telefone / WhatsApp
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-white font-mono text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  E-mail (Opcional)
                </label>
                <input
                  type="email"
                  placeholder="paciente@exemplo.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setIsDirty(true);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  className={`w-full text-xs rounded-xl border p-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all ${
                    errors.email
                      ? 'border-rose-500 ring-2 ring-rose-500/20'
                      : 'border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                  }`}
                />
                {errors.email && (
                  <p className="text-[11px] font-medium text-rose-600 mt-1">
                    {errors.email}
                  </p>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleCloseAttempt}
                disabled={isSubmitting}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <span>Salvar Paciente</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Confirmação de descarte de alterações (Sem window.confirm!) */}
      <ConfirmDialog
        isOpen={showConfirmDiscard}
        onClose={() => setShowConfirmDiscard(false)}
        onCancel={() => setShowConfirmDiscard(false)}
        onConfirm={handleConfirmDiscard}
        title="Descartar alterações?"
        description="Existem informações preenchidas que ainda não foram salvas."
        cancelLabel="Continuar editando"
        confirmLabel="Descartar alterações"
        variant="danger"
      />

      {/* Diálogo de sucesso visual inequívoco */}
      <SuccessDialog
        isOpen={Boolean(createdPatient)}
        onClose={handleSuccessClose}
        title="Paciente cadastrado"
        message={`${createdPatient?.name || ''} foi adicionado(a) com sucesso.`}
        primaryActionLabel="Concluir"
      />
    </>
  );
};
