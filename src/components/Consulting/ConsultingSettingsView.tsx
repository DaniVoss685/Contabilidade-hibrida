import React from 'react';
import { Building2, ShieldCheck, Mail, Phone, Users, CheckCircle2 } from 'lucide-react';

export const ConsultingSettingsView: React.FC = () => {
  return (
    <div className="space-y-6 pb-12">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Configurações do Escritório de Consultoria
        </h2>
        <p className="text-xs text-slate-500">
          Parâmetros operacionais e perfil de supervisão contábil do Escritório Contaju.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Perfil do Escritório */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Building2 className="w-4 h-4 text-emerald-600" />
            Perfil da Assessoria Contábil
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Nome da Organização:</label>
              <input
                type="text"
                readOnly
                value="Escritório Contaju / Assessoria Contábil"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">E-mail de Notificações Fiscais:</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  readOnly
                  value="contato@contaju.com.br"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Telefone / WhatsApp Suporte:</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  readOnly
                  value="(11) 99999-8888"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Políticas Globais de Supervisão */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Parâmetros de Auditoria Automática
          </h3>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <strong className="text-emerald-950 block">Gatilho do Fator R: 28,00%</strong>
                <span className="text-emerald-800">
                  Alerta disparado imediatamente quando o cliente projeta índice inferior a 28%.
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-slate-600 shrink-0" />
              <div>
                <strong className="text-slate-900 block">Sincronização Contábilex / Contaju</strong>
                <span className="text-slate-600">
                  Transmissão contínua de DRE, fluxo de caixa e fechamentos fiscais.
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
              <Users className="w-4 h-4 text-slate-600 shrink-0" />
              <div>
                <strong className="text-slate-900 block">Isolamento Multi-Tenant</strong>
                <span className="text-slate-600">
                  Dados de cada clínica cliente permanecem segregados e auditados em tempo real.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
