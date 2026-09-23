import React, { useState, useEffect } from 'react';
import { User, X, Loader2, Phone, Mail, AlertCircle, Edit3, Calendar } from 'lucide-react';
import { Patient } from '../../types';
import { db } from '../../lib/db';
import { SupabaseService } from '../../lib/supabaseClient';
import { getPhoneFieldLabel } from '../../lib/patientGuardianDisplay';
import { getNameFieldLabel, getDocumentFieldLabel, isBirthDateRequired } from '../../lib/patientDocumentType';
import { isPlaceholderPhoneNumber } from '../../lib/phoneUtils';
import {
  formatCpf,
  formatCnpj,
  isValidCpf,
  isValidCnpj,
  isValidEmail,
  maskPhoneInput,
  isValidPhone,
  maskCpfInput,
  maskCnpjInput,
  isValidCivilDate,
  isFutureCivilDate,
  getTodayCivilDate,
} from '../../lib/masks';
import { ConfirmDialog, useToast } from '../UI';
import { DatePicker } from '../UI/DatePicker';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';

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
    birthDate?: string;
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
  const [documentType, setDocumentType] = useState<'CPF' | 'CNPJ'>('CPF');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [email, setEmail] = useState('');

  // Responsável (guardian) — Fase 3 do modelo de telefone compartilhado
  const [phoneOwner, setPhoneOwner] = useState<'PATIENT' | 'RESPONSIBLE'>('PATIENT');
  const [guardianId, setGuardianId] = useState<string | undefined>(undefined);
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('');
  const [guardianCpf, setGuardianCpf] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianCandidates, setGuardianCandidates] = useState<Array<{ id: string; name: string; cpf?: string; phone?: string; email?: string }>>([]);

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
        const docType = patient.documentType === 'CNPJ' ? 'CNPJ' : 'CPF';
        setDocumentType(docType);
        setCpf(patient.cpf ? (docType === 'CNPJ' ? formatCnpj(patient.cpf) : formatCpf(patient.cpf)) : '');
        setPhone(patient.phone ? maskPhoneInput(patient.phone) : '');
        setBirthDate(patient.birthDate || '');
        setEmail(patient.email || '');
        setPhoneOwner(patient.phoneOwner === 'RESPONSIBLE' ? 'RESPONSIBLE' : 'PATIENT');
        setGuardianId(undefined);
        setGuardianName('');
        setGuardianRelationship('');
        setGuardianCpf('');
        setGuardianEmail('');
        if (patient.phoneOwner === 'RESPONSIBLE') {
          const tenantId = db.getActiveTenantId() || '';
          if (tenantId) {
            SupabaseService.getPrimaryGuardianForPatient(tenantId, patient.id).then((g) => {
              if (g) {
                setGuardianId(g.id);
                setGuardianName(g.name || '');
                setGuardianRelationship(g.relationshipType || '');
                setGuardianCpf(g.cpf ? formatCpf(g.cpf) : '');
                setGuardianEmail(g.email || '');
              }
            }).catch(() => {});
          }
        }
      } else {
        setName(initialData?.name || '');
        setDocumentType('CPF');
        setCpf(initialData?.cpf ? formatCpf(initialData.cpf) : '');
        setPhone(initialData?.phone ? maskPhoneInput(initialData.phone) : '');
        setBirthDate(initialData?.birthDate || '');
        setEmail(initialData?.email || '');
        setPhoneOwner('PATIENT');
        setGuardianId(undefined);
        setGuardianName('');
        setGuardianRelationship('');
        setGuardianCpf('');
        setGuardianEmail('');
      }
      setGuardianCandidates([]);
      setErrors({});
      setIsDirty(false);
      setIsSubmitting(false);
      setShowConfirmDiscard(false);
    }
  }, [isOpen, isEdit, patient, initialData]);

  // Busca responsáveis já cadastrados no tenant com o mesmo telefone/CPF
  // informado, para reaproveitar (não duplicar responsável entre irmãos).
  useEffect(() => {
    if (phoneOwner !== 'RESPONSIBLE' || !isOpen) {
      setGuardianCandidates([]);
      return;
    }
    const tenantId = db.getActiveTenantId() || '';
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanGuardianCpf = guardianCpf.replace(/\D/g, '');
    if (!tenantId || (!cleanPhone && !cleanGuardianCpf)) {
      setGuardianCandidates([]);
      return;
    }
    const handle = setTimeout(() => {
      SupabaseService.findGuardianCandidates(tenantId, { phone: cleanPhone, cpf: cleanGuardianCpf })
        .then(setGuardianCandidates)
        .catch(() => setGuardianCandidates([]));
    }, 350);
    return () => clearTimeout(handle);
  }, [phoneOwner, phone, guardianCpf, isOpen]);

  const applyGuardianCandidate = (g: { id: string; name: string; cpf?: string; phone?: string; email?: string }) => {
    setGuardianId(g.id);
    setGuardianName(g.name || '');
    setGuardianCpf(g.cpf ? formatCpf(g.cpf) : '');
    setGuardianEmail(g.email || '');
    setGuardianCandidates([]);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // 1. Nome Completo (Obrigatório, sem apenas espaços)
    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      newErrors.name = 'Informe o nome completo do paciente.';
    }

    // 2. CPF ou CNPJ (Obrigatório, algoritmo oficial e unicidade no tenant) —
    // depende de documentType (Pessoa Física / Pessoa Jurídica).
    const cleanCpf = cpf.replace(/\D/g, '');
    const isCnpj = documentType === 'CNPJ';
    if (!cleanCpf) {
      newErrors.cpf = isCnpj ? 'Informe o CNPJ da empresa.' : 'Informe o CPF do paciente.';
    } else if (isCnpj ? cleanCpf.length !== 14 || !isValidCnpj(cleanCpf) : cleanCpf.length !== 11 || !isValidCpf(cleanCpf)) {
      newErrors.cpf = isCnpj ? 'Informe um CNPJ válido.' : 'Informe um CPF válido.';
    } else {
      // Checar duplicidade no tenant
      const existing = db.getPatients().find((p) => {
        if (isEdit && patient && p.id === patient.id) return false;
        return p.cpf.replace(/\D/g, '') === cleanCpf;
      });
      if (existing) {
        newErrors.cpf = isCnpj ? 'Já existe um cliente cadastrado com este CNPJ.' : 'Já existe um paciente cadastrado com este CPF.';
      }
    }

    // 3. WhatsApp / Telefone (Obrigatório, máscara e validação brasileira)
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || !isValidPhone(cleanPhone)) {
      newErrors.phone = 'Informe o WhatsApp ou telefone do paciente.';
    }

    // 3b. Responsável (obrigatório apenas se o telefone for do responsável)
    if (phoneOwner === 'RESPONSIBLE' && !guardianName.trim()) {
      newErrors.guardianName = 'Informe o nome do responsável.';
    }

    // 4. Data de Nascimento — obrigatória apenas para Pessoa Física (CPF).
    // Empresas (CNPJ) não têm data de nascimento.
    const cleanBirthDate = birthDate.trim();
    if (isBirthDateRequired(documentType)) {
      if (!cleanBirthDate) {
        newErrors.birthDate = 'Informe a data de nascimento do paciente.';
      } else if (!isValidCivilDate(cleanBirthDate)) {
        newErrors.birthDate = 'Informe uma data de nascimento válida.';
      } else if (isFutureCivilDate(cleanBirthDate)) {
        newErrors.birthDate = 'A data de nascimento não pode ser futura.';
      }
    }

    // 5. E-mail (Opcional, mas se preenchido deve ser válido)
    if (email.trim() && !isValidEmail(email)) {
      newErrors.email = 'E-mail em formato inválido.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCpfChange = (val: string) => {
    setCpf(documentType === 'CNPJ' ? maskCnpjInput(val) : maskCpfInput(val));
    setIsDirty(true);
    if (errors.cpf) {
      setErrors((prev) => ({ ...prev, cpf: '' }));
    }
  };

  const handleDocumentTypeChange = (next: 'CPF' | 'CNPJ') => {
    setDocumentType(next);
    setIsDirty(true);
    // Reaplica a máscara correta sobre os dígitos já digitados, em vez de
    // limpar o campo — evita perder o que o usuário já tinha começado a digitar.
    const digits = cpf.replace(/\D/g, '');
    setCpf(next === 'CNPJ' ? maskCnpjInput(digits) : maskCpfInput(digits));
    if (errors.cpf) setErrors((prev) => ({ ...prev, cpf: '' }));
    if (next === 'CNPJ' && errors.birthDate) setErrors((prev) => ({ ...prev, birthDate: '' }));
  };

  const handlePhoneChange = (val: string) => {
    setPhone(maskPhoneInput(val));
    setIsDirty(true);
    if (errors.phone) {
      setErrors((prev) => ({ ...prev, phone: '' }));
    }
  };

  const handleBirthDateChange = (val: string) => {
    setBirthDate(val);
    setIsDirty(true);
    if (errors.birthDate) {
      setErrors((prev) => ({ ...prev, birthDate: '' }));
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
      // Pessoa Jurídica (CNPJ) não tem data de nascimento — nunca gravar um
      // valor residual se o usuário trocou de CPF para CNPJ depois de digitar.
      const cleanBirthDate = isBirthDateRequired(documentType) ? birthDate.trim() : '';
      const cleanEmail = email.trim() || undefined;

      // Aviso preventivo (NÃO bloqueante) de telefone compartilhado com outro
      // paciente/responsável nesta clínica. Telefone repetido é esperado e
      // válido (irmãos usando o telefone da mãe) — ver CLAUDE.md "Guardian".
      const activeTenant = db.getActiveTenantId() || '';
      let sharedPhoneNotice: string | null = null;
      // Placeholder (ex.: 99999999999) tem formato válido mas não é um WhatsApp real —
      // a trigger de banco (fn_is_placeholder_phone_local) já bloqueia a criação/atualização
      // do df_wa_contact para esse número; aqui só avisamos o usuário do motivo (A23).
      const placeholderPhoneNotice =
        cleanPhone && isPlaceholderPhoneNumber(cleanPhone)
          ? 'Este telefone parece ser um número de exemplo/placeholder e não terá um contato de WhatsApp criado automaticamente. Confirme se é o número real do paciente.'
          : null;
      if (cleanPhone && activeTenant) {
        const conflictCheck = await DentalWhatsAppService.syncPatientToContact(
          { id: isEdit && patient ? patient.id : 'temp_check_id', name: cleanName, phone: cleanPhone, tenantId: activeTenant },
          activeTenant,
          { dryRun: true }
        );
        if (!conflictCheck.success && conflictCheck.code === 'CONTACT_PHONE_CONFLICT') {
          sharedPhoneNotice =
            phoneOwner === 'PATIENT'
              ? 'Este telefone já é utilizado por outros pacientes/responsáveis. Confirme se este número pertence realmente ao paciente.'
              : 'Este telefone já é utilizado por outros pacientes/responsáveis.';
        }
      }

      let savedPatientId: string | null = null;
      let savedPatient: Patient | null = null;

      if (isEdit && patient) {
        // UPDATE REAL no PostgreSQL (df_patients)
        const res = await db.updatePatientAsync(patient.id, {
          name: cleanName,
          documentType,
          cpf: cleanCpf,
          phone: cleanPhone,
          phoneOwner,
          birthDate: cleanBirthDate,
          email: cleanEmail,
        });

        if (!res.success) {
          setErrors({ form: res.error || 'Erro ao atualizar paciente.' });
          return;
        }

        savedPatientId = patient.id;
        savedPatient = {
          ...patient,
          name: cleanName,
          documentType,
          cpf: cleanCpf,
          phone: cleanPhone,
          phoneOwner,
          birthDate: cleanBirthDate,
          email: cleanEmail,
        };
      } else {
        // CADASTRO NOVO (INSERT)
        const res = await db.addPatientAsync({
          name: cleanName,
          documentType,
          cpf: cleanCpf,
          phone: cleanPhone,
          phoneOwner,
          birthDate: cleanBirthDate,
          email: cleanEmail,
        });

        if (!res.success || !res.patient) {
          setErrors({ form: res.error || 'Erro ao cadastrar paciente.' });
          return;
        }

        savedPatientId = res.patient.id;
        savedPatient = res.patient;
      }

      // Responsável: cria/reaproveita e vincula como primário deste paciente.
      if (phoneOwner === 'RESPONSIBLE' && savedPatientId && activeTenant && guardianName.trim()) {
        const guardianRes = await SupabaseService.upsertGuardian(activeTenant, {
          id: guardianId,
          name: guardianName.trim(),
          cpf: guardianCpf.replace(/\D/g, '') || undefined,
          phone: cleanPhone,
          email: guardianEmail.trim() || undefined,
        });
        if (guardianRes.success && guardianRes.id) {
          await SupabaseService.linkGuardianToPatient(activeTenant, savedPatientId, guardianRes.id, {
            relationshipType: guardianRelationship.trim() || undefined,
            isPrimary: true,
          });
        }
      } else if (phoneOwner === 'PATIENT' && savedPatientId && activeTenant) {
        // Telefone voltou a ser do próprio paciente: remove o vínculo
        // primário de responsável, se existia (nunca apaga o guardian nem
        // afeta outros pacientes vinculados a ele).
        await SupabaseService.unlinkPrimaryGuardianFromPatient(activeTenant, savedPatientId);
      }

      setIsDirty(false);
      toast.success(isEdit ? 'Paciente atualizado com sucesso.' : 'Paciente cadastrado com sucesso.');
      if (sharedPhoneNotice) toast.warning(sharedPhoneNotice, 8000);
      if (placeholderPhoneNotice) toast.warning(placeholderPhoneNotice, 8000);
      if (onSave && savedPatient) onSave(savedPatient);
      onClose();
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

            {/* Tipo de cadastro: Pessoa Física (CPF) ou Pessoa Jurídica (CNPJ) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Tipo de cadastro</label>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => handleDocumentTypeChange('CPF')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    documentType === 'CPF' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Pessoa Física (CPF)
                </button>
                <button
                  type="button"
                  onClick={() => handleDocumentTypeChange('CNPJ')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    documentType === 'CNPJ' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Pessoa Jurídica (CNPJ)
                </button>
              </div>
            </div>

            {/* Nome Completo / Razão Social */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {getNameFieldLabel(documentType)} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder={documentType === 'CNPJ' ? 'Ex: Clínica Exemplo LTDA' : 'Ex: Maria da Silva'}
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

            {/* Grid: CPF/CNPJ & Data de Nascimento (Pessoa Física apenas) */}
            <div className={`grid grid-cols-1 gap-3 ${isBirthDateRequired(documentType) ? 'sm:grid-cols-2' : ''}`}>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {getDocumentFieldLabel(documentType)} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder={documentType === 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                  maxLength={documentType === 'CNPJ' ? 18 : 14}
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
              </div>

              {isBirthDateRequired(documentType) && (
                <div>
                  <DatePicker
                    label="Data de Nascimento"
                    required
                    value={birthDate}
                    onChange={handleBirthDateChange}
                    placeholder="DD/MM/AAAA"
                    maxDate={getTodayCivilDate()}
                  />
                  {errors.birthDate && (
                    <p className="text-[11px] font-medium text-rose-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      {errors.birthDate}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* WhatsApp / Telefone & E-mail */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1.5">
                  <span>
                    {getPhoneFieldLabel(phoneOwner)} <span className="text-rose-500">*</span>
                  </span>
                  {phoneOwner === 'RESPONSIBLE' && (
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold uppercase tracking-wide">
                      Responsável
                    </span>
                  )}
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
                {phoneOwner === 'RESPONSIBLE' && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Este será o telefone de contato do responsável informado abaixo.
                  </p>
                )}
                {errors.phone && (
                  <p className="text-[11px] font-medium text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {errors.phone}
                  </p>
                )}

                {/* Contexto do telefone: paciente ou responsável */}
                <div className="mt-2 flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg w-fit">
                  <button
                    type="button"
                    onClick={() => { setPhoneOwner('PATIENT'); setIsDirty(true); }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      phoneOwner === 'PATIENT' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Do paciente
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPhoneOwner('RESPONSIBLE'); setIsDirty(true); }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      phoneOwner === 'RESPONSIBLE' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Do responsável
                  </button>
                </div>
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

            {/* Dados do responsável (só quando o telefone é do responsável) */}
            {phoneOwner === 'RESPONSIBLE' && (
              <div className="p-3 bg-emerald-50/60 border border-emerald-200/70 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-emerald-800">Dados do responsável</p>
                  {phone && (
                    <p className="text-[11px] text-emerald-700">
                      <span className="text-emerald-600/80">Telefone de contato:</span>{' '}
                      <span className="font-mono font-semibold">{phone}</span>
                    </p>
                  )}
                </div>

                {guardianCandidates.length > 0 && !guardianId && (
                  <div className="p-2 bg-white border border-emerald-200 rounded-lg space-y-1">
                    <p className="text-[11px] text-slate-600">Responsável já cadastrado nesta clínica — reutilizar?</p>
                    {guardianCandidates.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => applyGuardianCandidate(g)}
                        className="w-full text-left px-2 py-1.5 rounded-md text-xs font-medium text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nome do responsável <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Maria da Silva (mãe)"
                    value={guardianName}
                    onChange={(e) => { setGuardianName(e.target.value); setGuardianId(undefined); setIsDirty(true); if (errors.guardianName) setErrors((prev) => ({ ...prev, guardianName: '' })); }}
                    className={`w-full text-xs rounded-xl border p-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all ${
                      errors.guardianName ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                    }`}
                  />
                  {errors.guardianName && (
                    <p className="text-[11px] font-medium text-rose-600 mt-1">{errors.guardianName}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Parentesco</label>
                    <input
                      type="text"
                      placeholder="Ex: Mãe, Pai, Tutor"
                      value={guardianRelationship}
                      onChange={(e) => { setGuardianRelationship(e.target.value); setIsDirty(true); }}
                      className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">CPF (Opcional)</label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      maxLength={14}
                      value={guardianCpf}
                      onChange={(e) => { setGuardianCpf(maskCpfInput(e.target.value)); setGuardianId(undefined); setIsDirty(true); }}
                      className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-white font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">E-mail do responsável (Opcional)</label>
                  <input
                    type="email"
                    placeholder="exemplo@email.com"
                    value={guardianEmail}
                    onChange={(e) => { setGuardianEmail(e.target.value); setIsDirty(true); }}
                    className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                </div>
              </div>
            )}

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
