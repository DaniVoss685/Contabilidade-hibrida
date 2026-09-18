import React, { useState, useEffect } from 'react';
import { User, X, Loader2, Phone, Mail, AlertCircle, Edit3 } from 'lucide-react';
import { Patient } from '../../types';
import { db } from '../../lib/db';
import { formatCpf, isValidCpf, isValidEmail, maskPhoneInput, isValidPhone, maskCpfInput } from '../../lib/masks';
import { ConfirmDialog, useToast } from '../UI';

export interface PatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (patient: Patient) => void;
  mode?: 'create' | 'edit';
  patient?: Patient | null;
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
  mode = 'create',
  patient,
  initialData,
}) => {
  const toast = useToast();
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirmDiscard, setShowConfirmDiscard] = useState(false);

  const isEdit = mode === 'edit' && Boolean(patient);

  // Inicializa os campos quando o modal abre ou os dados mudam
  useEffect(() => {
    if (isOpen) {
      if (isEdit && patient) {
        setName(patient.name || '');
        setCpf(patient.cpf ? formatCpf(patient.cpf) : '');
        setPhone(patient.phone ? maskPhoneInput(patient.phone) : '');
        setEmail(patient.email || '');
      } else {
        setName(initialData?.name || '');
        setCpf(initialData?.cpf ? formatCpf(initialData.cpf) : '');
        setPhone(initialData?.phone ? maskPhoneInput(initialData.phone) : '');
        setEmail(initialData?.email || '');
      }
      setErrors({});
      setIsDirty(false);
      setIsSubmitting(false);
      setShowConfirmDiscard(false);
    }
  }, [isOpen, isEdit, patient, initialData]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // 1. Nome Completo (Obrigatório, sem apenas espaços)
    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      newErrors.name = 'Informe o nome completo do paciente.';
    }

    // 2. CPF (Obrigatório, algoritmo oficial e unicidade no tenant)
    const cleanCpf = cpf.replace(/\D/g, '');
    if (!cleanCpf) {
      newErrors.cpf = 'Informe o CPF do paciente.';
    } else if (cleanCpf.length !== 11 || !isValidCpf(cleanCpf)) {
      newErrors.cpf = 'Informe um CPF válido.';
    } else {
      // Checar duplicidade no tenant
      const existing = db.getPatients().find((p) => {
        if (isEdit && patient && p.id === patient.id) return false;
        return p.cpf.replace(/\D/g, '') === cleanCpf;
      });
      if (existing) {
        newErrors.cpf = 'Já existe um paciente cadastrado com este CPF.';
      }
    }

    // 3. WhatsApp / Telefone (Obrigatório, máscara e validação brasileira)
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || !isValidPhone(cleanPhone)) {
      newErrors.phone = 'Informe o WhatsApp ou telefone do paciente.';
    }

    // 4. E-mail (Opcional, mas se preenchido deve ser válido)
    if (email.trim() && !isValidEmail(email)) {
      newErrors.email = 'E-mail em formato inválido.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCpfChange = (val: string) => {
    setCpf(maskCpfInput(val));
    setIsDirty(true);
    if (errors.cpf) {
      setErrors((prev) => ({ ...prev, cpf: '' }));
    }
  };

  const handlePhoneChange = (val: string) => {
    setPhone(maskPhoneInput(val));
    setIsDirty(true);
    if (errors.phone) {
      setErrors((prev) => ({ ...prev, phone: '' }));
    }
  };

  const handleCloseAttempt = () => {
    if (isDirty) {
      setShowConfirmDiscard(true);
    } else {
      onClose();
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const cleanName = name.trim().replace(/\s+/g, ' ');
      const cleanCpf = cpf.replace(/\D/g, '');
      const cleanPhone = phone.trim();
      const cleanEmail = email.trim() || undefined;

      if (isEdit && patient) {
        // UPDATE REAL no PostgreSQL (df_patients)
        const res = await db.updatePatientAsync(patient.id, {
          name: cleanName,
          cpf: cleanCpf,
          phone: cleanPhone,
          email: cleanEmail,
        });

        if (!res.success) {
          setErrors({ form: res.error || 'Erro ao atualizar paciente.' });
          return;
        }

        const updatedPatient: Patient = {
          ...patient,
          name: cleanName,
          cpf: cleanCpf,
          phone: cleanPhone,
          email: cleanEmail,
        };

        setIsDirty(false);
        toast.success('Paciente atualizado com sucesso.');
        if (onSave) onSave(updatedPatient);
        onClose();
      } else {
        // CADASTRO NOVO (INSERT)
        const res = await db.addPatientAsync({
          name: cleanName,
          cpf: cleanCpf,
          phone: cleanPhone,
          email: cleanEmail,
        });

        if (!res.success || !res.patient) {
          setErrors({ form: res.error || 'Erro ao cadastrar paciente.' });
          return;
        }

        setIsDirty(false);
        toast.success('Paciente cadastrado com sucesso.');
        if (onSave) onSave(res.patient);
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDiscard = () => {
    setShowConfirmDiscard(false);
    setIsDirty(false);
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
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-2xs border ${
                isEdit 
                  ? 'bg-amber-50 border-amber-200/70 text-amber-700' 
                  : 'bg-emerald-50 border-emerald-200/70 text-emerald-700'
              }`}>
                {isEdit ? <Edit3 className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  {isEdit ? 'Editar Paciente' : 'Cadastrar Novo Paciente'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isEdit 
                    ? 'Atualize os dados cadastrais do paciente' 
                    : 'Dados cadastrais para prontuário e emissão fiscal'}
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

          <form noValidate onSubmit={handleSubmit} className="p-6 space-y-4">
            {errors.form && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errors.form}</span>
              </div>
            )}

            {/* Nome Completo */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nome Completo <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Maria da Silva"
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
                CPF <span className="text-rose-500">*</span>
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

            {/* WhatsApp / Telefone & E-mail */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  WhatsApp / Telefone <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className={`w-full text-xs rounded-xl border p-2.5 bg-white font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all ${
                      errors.phone
                        ? 'border-rose-500 ring-2 ring-rose-500/20'
                        : 'border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                    }`}
                  />
                </div>
                {errors.phone && (
                  <p className="text-[11px] font-medium text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {errors.phone}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  E-mail (Opcional)
                </label>
                <input
                  type="email"
                  placeholder="exemplo@email.com"
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
                  <span>{isEdit ? 'Salvar Alterações' : 'Cadastrar Paciente'}</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Confirmação de descarte de alterações */}
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
    </>
  );
};
