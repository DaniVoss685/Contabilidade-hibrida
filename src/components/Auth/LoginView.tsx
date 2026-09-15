import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Activity,
  Calculator,
  Stethoscope,
  KeyRound,
  UserPlus,
  ShieldAlert,
  ArrowLeft,
} from 'lucide-react';
import { db } from '../../lib/db';
import { User, ClinicTenant } from '../../types';
import { useToast } from '../UI';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
}

type AuthMode = 'login' | 'register' | 'recovery' | 'support';

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const toast = useToast();
  const [mode, setMode] = useState<AuthMode>('login');

  // Common form states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Login form states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Register / Credentials Only form states
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(true);

  // Password Recovery form states
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [forceResetMode, setForceResetMode] = useState(false);

  React.useEffect(() => {
    const isRecovery = db.getIsPasswordRecovery();
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (isRecovery || hash.includes('type=recovery')) {
      setMode('recovery');
      setForceResetMode(true);
    }
  }, []);

  // Support Mode form states
  const [supportEmail, setSupportEmail] = useState('suporte@dentalfinance.com.br');
  const [supportPassword, setSupportPassword] = useState('');
  const [isSupportAuthenticated, setIsSupportAuthenticated] = useState(false);
  const [selectedTargetClinicId, setSelectedTargetClinicId] = useState('tenant_demo');
  const [supportReason, setSupportReason] = useState('');

  // 1. Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!identifier.trim()) {
      setErrorMsg('Por favor, informe seu e-mail cadastrado.');
      return;
    }
    if (!password) {
      setErrorMsg('Por favor, digite sua senha de acesso.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await db.authenticate(identifier, password);
      setIsLoading(false);

      if (!res.success || !res.session) {
        setErrorMsg(res.error || 'Credenciais inválidas.');
        return;
      }

      toast.success(`Bem-vindo ao Dental Finance, ${res.session.user.name}!`);
      onLoginSuccess(res.session.user);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Erro durante a autenticação.');
    }
  };

  // 2. Handle Instant Demo Access
  const handleDemoAccess = () => {
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    setTimeout(() => {
      const session = db.loginDemo();
      setIsLoading(false);
      toast.success(`Modo Demonstração ativado: ${session.user.name}`);
      onLoginSuccess(session.user);
    }, 300);
  };

  // 3. Handle Register / Create Access (Credentials Only)
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!regEmail.trim()) {
      setErrorMsg('Por favor, informe um endereço de e-mail válido.');
      return;
    }
    if (!regPassword || regPassword.length < 8) {
      setErrorMsg('A senha deve conter no mínimo 8 caracteres para sua segurança.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setErrorMsg('A confirmação de senha não confere com a senha digitada.');
      return;
    }
    if (!termsAccepted) {
      setErrorMsg('É necessário concordar com os Termos de Uso e Política de Privacidade.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await db.createAccount({
        email: regEmail,
        password: regPassword,
        termsAccepted,
      });

      setIsLoading(false);
      if (!res.success || !res.session) {
        setErrorMsg(res.error || 'Falha ao criar o acesso.');
        return;
      }

      toast.success(`Acesso criado com sucesso! Bem-vindo ao Dental Finance.`);
      onLoginSuccess(res.session.user);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Erro ao criar conta.');
    }
  };

  // 4. Handle Password Recovery Email Request (Supabase Auth)
  const handleRequestRecoveryToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!recoveryEmail.trim()) {
      setErrorMsg('Informe o e-mail da sua conta para recuperar a senha.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await db.requestPasswordReset(recoveryEmail);
      setIsLoading(false);
      setSuccessMsg(res.message);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Erro ao processar solicitação de recuperação.');
    }
  };

  // 5. Handle Password Reset Execution (Supabase Auth updateUser)
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('A nova senha deve possuir no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('A confirmação não confere com a nova senha.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await db.updatePassword(newPassword);
      setIsLoading(false);

      if (!res.success) {
        setErrorMsg(res.error || 'Erro ao redefinir senha.');
        return;
      }

      toast.success('Senha redefinida com sucesso! Você já pode entrar com a nova senha.');
      setMode('login');
      setForceResetMode(false);
      setIdentifier(recoveryEmail);
      setPassword(newPassword);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Erro ao processar nova senha.');
    }
  };

  // 6. Handle Support Login & Session Start
  const handleSupportLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    setIsLoading(true);
    try {
      const res = await db.authenticate(supportEmail, supportPassword);
      setIsLoading(false);

      if (!res.success || !res.session) {
        setErrorMsg(res.error || 'Falha ao autenticar credenciais de suporte.');
        return;
      }

      if (res.session.user.role !== 'PLATFORM_ADMIN') {
        setErrorMsg('Este usuário não possui privilégios de Administrador da Plataforma.');
        db.logout();
        return;
      }

      setIsSupportAuthenticated(true);
      toast.success('Administrador da plataforma autenticado. Selecione a clínica alvo.');
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Erro na autenticação de suporte.');
    }
  };

  const handleStartSupportSession = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!supportReason.trim()) {
      setErrorMsg('O motivo ou número de chamado é estritamente obrigatório para auditoria.');
      return;
    }

    const res = db.startSupportSession(selectedTargetClinicId, supportReason);
    if (!res.success) {
      setErrorMsg(res.error || 'Falha ao iniciar sessão de suporte.');
      return;
    }

    const cur = db.getCurrentSession();
    if (cur) {
      toast.info(`Acesso de suporte iniciado na clínica ${cur.supportSession?.targetTenantName}.`);
      onLoginSuccess(cur.user);
    }
  };

  const registeredClinics = db.getRegisteredClinics();

  const isDev = import.meta.env.DEV;

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between items-center bg-[#f8fafc] text-slate-800 font-sans antialiased p-4 sm:p-8 overflow-hidden select-none selection:bg-emerald-500/20 selection:text-emerald-900">
      <style>{`
        @keyframes ambient-float-1 {
          0% { transform: translate(0px, 0px) scale(1) rotate(0deg); }
          50% { transform: translate(45px, -35px) scale(1.1) rotate(4deg); }
          100% { transform: translate(-35px, 30px) scale(0.95) rotate(-3deg); }
        }
        @keyframes ambient-float-2 {
          0% { transform: translate(0px, 0px) scale(1) rotate(0deg); }
          50% { transform: translate(-40px, 40px) scale(1.08) rotate(-4deg); }
          100% { transform: translate(35px, -30px) scale(0.94) rotate(3deg); }
        }
        @keyframes ambient-float-3 {
          0% { transform: translate(0px, 0px) scale(0.96); }
          50% { transform: translate(30px, 25px) scale(1.07); }
          100% { transform: translate(-25px, -35px) scale(1); }
        }
        .ambient-orb-1 {
          animation: ambient-float-1 20s ease-in-out infinite alternate;
        }
        .ambient-orb-2 {
          animation: ambient-float-2 24s ease-in-out infinite alternate;
        }
        .ambient-orb-3 {
          animation: ambient-float-3 28s ease-in-out infinite alternate;
        }
        @media (prefers-reduced-motion: reduce) {
          .ambient-orb-1, .ambient-orb-2, .ambient-orb-3 {
            animation: none !important;
          }
        }
      `}</style>

      {/* Decorative Ambient Mesh Gradient Orbs & Subtle Financial Data Layer */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        {/* Soft Emerald Mesh (Dental Finance) */}
        <div
          className="ambient-orb-1 absolute -top-24 -right-24 sm:top-[-10%] sm:right-[10%] w-[550px] sm:w-[720px] h-[550px] sm:h-[720px] rounded-full bg-emerald-400/10 blur-[100px] pointer-events-none"
        />
        {/* Soft Cyan/Blue Mesh */}
        <div
          className="ambient-orb-2 absolute -bottom-24 -left-24 sm:bottom-[-10%] sm:left-[10%] w-[550px] sm:w-[720px] h-[550px] sm:h-[720px] rounded-full bg-sky-400/10 blur-[100px] pointer-events-none"
        />
        {/* Dynamic Teal Ambient Aura */}
        <div
          className="ambient-orb-3 absolute top-1/4 left-1/4 w-[480px] sm:w-[650px] h-[480px] sm:h-[650px] rounded-full bg-teal-400/15 blur-[110px] pointer-events-none"
        />
        {/* Subtle Slate/Indigo Depth Accent */}
        <div
          className="absolute bottom-1/4 right-1/4 w-[420px] sm:w-[580px] h-[420px] sm:h-[580px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none"
        />
        {/* Gentle Center Glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] rounded-full bg-teal-300/10 blur-[130px] pointer-events-none"
        />

        {/* Camada sutil de dados: Malha Geométrica e Órbitas Concéntricas */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.035] text-slate-900 pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="df-data-grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M 44 0 L 0 0 0 44" fill="none" stroke="currentColor" strokeWidth="1" />
              <circle cx="2" cy="2" r="1.5" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#df-data-grid)" />
          <circle cx="50%" cy="50%" r="260" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 8" />
          <circle cx="50%" cy="50%" r="420" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="6 12" />
          <circle cx="50%" cy="50%" r="600" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="8 16" />
        </svg>
      </div>

      {/* Top spacer */}
      <div className="relative z-10 w-full max-w-md pt-2 sm:pt-6" />

      {/* Central Login Card */}
      <div className="relative z-10 w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl border border-slate-200/90 shadow-2xl shadow-slate-300/40 p-6 sm:p-10 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3 pb-1">
          {/* Top Badge Sotaque Contábil */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50/90 border border-emerald-200/70 text-[11px] font-bold text-emerald-800 tracking-wide shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Contabilidade Híbrida Odontológica</span>
          </div>

          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/25 ring-4 ring-emerald-50">
            <Stethoscope className="w-6 h-6" />
          </div>
          <div>
            <span className="text-2xl font-black tracking-tight text-slate-900 flex items-center justify-center gap-1.5">
              Dental <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">Finance</span>
            </span>
            <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mt-0.5">
              Gestão Tributária & Clínica de Alta Performance
            </span>
          </div>
        </div>

        {/* Feedback Messages */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* MODE 1: LOGIN */}
        {mode === 'login' && (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <span className="text-[11px] font-semibold text-emerald-600/90 uppercase tracking-wider block">
                Bem-vindo
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Acesse sua Clínica
              </h2>
              <p className="text-xs text-slate-500">
                Entre para continuar no Dental Finance.
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  E-mail de Acesso
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="ex: contato@suaclinica.com.br"
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/50 focus:bg-white transition-all shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Senha de Acesso
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg('');
                      setSuccessMsg('');
                      setMode('recovery');
                    }}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                  >
                    Esqueceu sua senha?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/50 focus:bg-white transition-all shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                  />
                  <span className="text-xs font-medium text-slate-600">Lembrar meu acesso</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] cursor-pointer group"
              >
                {isLoading ? (
                  <span>Autenticando...</span>
                ) : (
                  <>
                    <span>Entrar no Sistema</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            {/* Bottom Actions: Cadastro e Suporte */}
            <div className="pt-2 border-t border-slate-100 flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setSuccessMsg('');
                  setMode('register');
                }}
                aria-label="Não tem conta? Crie seu acesso"
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
              >
                <span>Ainda não possui uma conta?</span>
                <span className="text-emerald-700 font-bold hover:underline">Criar seu acesso</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setSuccessMsg('');
                  setMode('support');
                }}
                className="text-[11px] font-medium text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
              >
                <ShieldAlert className="w-3 h-3" />
                <span>Acesso de Suporte Técnico</span>
              </button>
            </div>

            {/* DEMO DISCRETO CONDICIONADO ESTRITAMENTE AO AMBIENTE DE DESENVOLVIMENTO */}
            {isDev && (
              <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <span>Ambiente de desenvolvimento •</span>
                <button
                  type="button"
                  onClick={handleDemoAccess}
                  disabled={isLoading}
                  className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline cursor-pointer"
                >
                  Entrar Demo
                </button>
              </div>
            )}
          </div>
        )}

        {/* MODE 2: ONBOARDING / REGISTER (CREDENTIALS ONLY) */}
          {mode === 'register' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                  title="Voltar ao login"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                    Criar seu acesso
                  </h2>
                  <p className="text-xs text-slate-500">
                    Crie suas credenciais para acessar o Dental Finance.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  Primeiro Acesso Rápido & Seguro
                </p>
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  Cadastre seu login agora. Os dados da sua clínica e do seu consultório poderão ser preenchidos diretamente nas configurações do sistema.
                </p>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    E-mail *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="seu.email@clinica.com.br"
                      className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Senha *
                    </label>
                    <span className="text-[11px] text-slate-400 font-medium">Mínimo 8 caracteres</span>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={8}
                      className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Confirmar Senha *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showRegConfirmPassword ? 'text' : 'password'}
                      required
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={8}
                      className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      {showRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                    />
                    <span className="text-xs text-slate-600 leading-relaxed">
                      Li e concordo com os <span className="font-semibold text-slate-700">Termos de Uso</span> e a <span className="font-semibold text-slate-700">Política de Privacidade</span>.
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <span>Criando acesso...</span>
                  ) : (
                    <>
                      <span>Criar acesso</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                >
                  Já tem uma conta? Entrar
                </button>
              </div>
            </div>
          )}

          {/* MODE 3: PASSWORD RECOVERY */}
          {mode === 'recovery' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                  title="Voltar ao login"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                    Recuperação de Senha
                  </h2>
                  <p className="text-xs text-slate-500">
                    Redefina sua senha de acesso com segurança criptográfica
                  </p>
                </div>
              </div>

              {!forceResetMode ? (
                <form onSubmit={handleRequestRecoveryToken} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      E-mail Cadastrado
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        placeholder="seu.email@clinica.com.br"
                        className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>{isLoading ? 'Enviando...' : 'Enviar Link de Recuperação'}</span>
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => setForceResetMode(true)}
                      className="text-[11px] text-slate-500 hover:text-emerald-700 underline cursor-pointer"
                    >
                      Já recebi o link por e-mail? Cadastrar nova senha
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Nova Senha
                      </label>
                      <span className="text-[11px] text-slate-400 font-medium">Mínimo 6 caracteres</span>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        minLength={6}
                        className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Confirmar Nova Senha
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showConfirmNewPassword ? 'text' : 'password'}
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="••••••••"
                        minLength={6}
                        className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      >
                        {showConfirmNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>{isLoading ? 'Salvando...' : 'Salvar Nova Senha & Entrar'}</span>
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => setForceResetMode(false)}
                      className="text-[11px] text-slate-500 hover:text-slate-700 underline cursor-pointer"
                    >
                      Voltar para solicitação de link
                    </button>
                  </div>
                </form>
              )}

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                >
                  Voltar para o Login
                </button>
              </div>
            </div>
          )}

          {/* MODE 4: PLATFORM ADMIN AUDITED SUPPORT PORTAL */}
          {mode === 'support' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSupportAuthenticated(false);
                    setMode('login');
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                  title="Voltar ao login"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                    Suporte Técnico Dental Finance
                  </h2>
                  <p className="text-xs text-slate-500">
                    Acesso administrativo com auditoria rigorosa de ações
                  </p>
                </div>
              </div>

              {!isSupportAuthenticated ? (
                <form onSubmit={handleSupportLogin} className="space-y-4">
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-600" />
                      Área Restrita da Plataforma
                    </p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Exclusivo para administradores e analistas de suporte credenciados. Credencial padrão: <code>suporte@dentalfinance.com.br</code>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      E-mail de Suporte
                    </label>
                    <input
                      type="email"
                      required
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Senha de Administrador
                    </label>
                    <input
                      type="password"
                      required
                      value={supportPassword}
                      onChange={(e) => setSupportPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>Autenticar Credenciais de Suporte</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleStartSupportSession} className="space-y-4">
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Administrador Autenticado
                    </p>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      Selecione a clínica e informe o motivo do acesso para abrir a sessão auditada.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Clínica de Destino
                    </label>
                    <select
                      value={selectedTargetClinicId}
                      onChange={(e) => setSelectedTargetClinicId(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      {registeredClinics.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.isDemo ? 'Modo Demo' : 'Conta Real'}) — ID: {c.id}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Motivo / Número do Chamado *
                    </label>
                    <input
                      type="text"
                      required
                      value={supportReason}
                      onChange={(e) => setSupportReason(e.target.value)}
                      placeholder="ex: Chamado #9421 - Auditoria de parcelamento"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>Iniciar Acesso de Suporte Auditado</span>
                  </button>
                </form>
              )}

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSupportAuthenticated(false);
                    setMode('login');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                >
                  Voltar ao Login Principal
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé Oficial da Aplicação */}
        <footer className="relative z-10 w-full max-w-md py-4 text-center text-xs text-slate-500 leading-relaxed font-medium">
          <p>© 2026 Escritório Contaju LTDA — CNPJ 66.281.288/0001-28.</p>
          <p className="text-[11px] text-slate-400 font-normal">Todos os direitos reservados.</p>
        </footer>
      </div>
    );
  };
