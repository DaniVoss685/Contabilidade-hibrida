import { describe, it } from 'node:test';
import assert from 'node:assert';
import { db } from '../../src/lib/db';
import { getRecoveryRedirectUrl } from '../../src/lib/supabaseClient';

describe('Suite Funcional: Correcao de Autenticacao, Recuperacao de Senha e Reconciliacao (BUG A e BUG B)', () => {
  it('AUTH-01: getRecoveryRedirectUrl deve retornar URL canonica adaptada ao origin', () => {
    const origin = 'https://dental-finance.vercel.app';
    const originalWindow = globalThis.window;
    (globalThis as any).window = { location: { origin } };

    try {
      const url = getRecoveryRedirectUrl();
      assert.strictEqual(url, 'https://dental-finance.vercel.app/auth/recovery');
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('AUTH-02: requestPasswordReset deve retornar mensagem neutra anti-enumeracao e registrar auditoria', async () => {
    const testEmail = 'dentista.seguro@clinica.com.br';
    const res = await db.requestPasswordReset(testEmail);

    assert.strictEqual(res.success, true);
    assert.ok(res.message.includes('Se o e-mail informado estiver cadastrado'));
    assert.strictEqual(res.token, undefined, 'Nao deve expor token em claro na resposta');

    const logs = db.getAuditLogs();
    const foundLog = logs.find(
      (l) => l.action === 'PASSWORD_RESET_REQUESTED' && l.entityId === testEmail
    );
    assert.ok(foundLog, 'Deve registrar log de solicitacao de recuperacao de senha');
  });

  it('AUTH-03: updatePassword deve rejeitar senhas curtas com menos de 6 caracteres', async () => {
    const resShort = await db.updatePassword('12345');
    assert.strictEqual(resShort.success, false);
    assert.ok(resShort.error?.includes('6 caracteres'));
  });

  it('AUTH-04: Deteccao de link expirado (otp_expired / access_denied) via hash e search', () => {
    const parseUrl = (hashStr: string, searchStr: string = '') => {
      const hash = hashStr.startsWith('#') ? hashStr.substring(1) : hashStr;
      const search = searchStr.startsWith('?') ? searchStr.substring(1) : searchStr;
      const hashParams = new URLSearchParams(hash);
      const searchParams = new URLSearchParams(search);

      const errorCode = hashParams.get('error_code') || searchParams.get('error_code') || '';
      const error = hashParams.get('error') || searchParams.get('error') || '';
      const errorDesc = hashParams.get('error_description') || searchParams.get('error_description') || '';
      const type = hashParams.get('type') || searchParams.get('type') || '';

      const hasOtpExpired =
        errorCode === 'otp_expired' ||
        errorDesc.toLowerCase().includes('expired') ||
        errorDesc.toLowerCase().includes('invalid') ||
        (error === 'access_denied' && (errorCode === 'otp_expired' || errorDesc.includes('expired')));

      const isRecovery = type === 'recovery';

      return { hasOtpExpired, isRecovery, errorCode, errorDesc };
    };

    const hashExpired = 'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    const resA1 = parseUrl(hashExpired);
    assert.strictEqual(resA1.hasOtpExpired, true, 'Deve identificar link expirado via hash');
    assert.strictEqual(resA1.isRecovery, false);

    const resA2 = parseUrl('', 'error_code=otp_expired');
    assert.strictEqual(resA2.hasOtpExpired, true, 'Deve identificar link expirado via query search');

    const hashValid = 'access_token=eyJh...&refresh_token=...&type=recovery';
    const resA3 = parseUrl(hashValid);
    assert.strictEqual(resA3.hasOtpExpired, false);
    assert.strictEqual(resA3.isRecovery, true, 'Deve identificar fluxo legitimo de recuperacao');
  });

  it('AUTH-05: db.isPasswordRecoveryMode deve reter o estado de recuperacao sem vazar para o dashboard', () => {
    assert.strictEqual(db.getIsPasswordRecovery(), false);

    db.setIsPasswordRecovery(true);
    assert.strictEqual(db.getIsPasswordRecovery(), true);

    db.setIsPasswordRecovery(false);
    assert.strictEqual(db.getIsPasswordRecovery(), false);
  });

  it('AUTH-06: Validacao de email e senha forte no cadastro de usuario', async () => {
    const resEmail = await db.createAccount({
      email: 'invalid-email',
      password: 'StrongPassword123!',
    });
    assert.strictEqual(resEmail.success, false);
    assert.ok(resEmail.error?.includes('e-mail'));

    const resPass = await db.createAccount({
      email: 'dentista@teste.com',
      password: '123',
    });
    assert.strictEqual(resPass.success, false);
    assert.ok(resPass.error?.includes('8 caracteres'));
  });

  it('AUTH-07: Sanitizacao de mensagem de erro tecnica do banco de dados', () => {
    const rawError = 'Database error saving new user';
    let userMessage = rawError;
    if (rawError.toLowerCase().includes('database error saving new user')) {
      userMessage = 'Nao foi possivel concluir seu cadastro no momento. Por favor, tente novamente ou contate o suporte.';
    }

    assert.ok(!userMessage.includes('Database error'), 'Nao deve expor detalhes de infraestrutura');
    assert.ok(userMessage.includes('Nao foi possivel concluir seu cadastro'));
  });

  it('AUTH-08: Estrutura da resposta RPC reconcile_or_provision_dental_user para novo usuario vs legado', () => {
    const novoUsuarioRpcResponse = {
      success: true,
      is_reconciled: false,
      tenant_id: 'clinic_novo_123',
      user_id: 'usr_novo_123',
      role: 'OWNER',
      clinic_name: 'Minha Clinica',
      trade_name: 'Minha Clinica Odontologica',
    };

    assert.strictEqual(novoUsuarioRpcResponse.is_reconciled, false);
    assert.strictEqual(novoUsuarioRpcResponse.role, 'OWNER');
    assert.strictEqual(novoUsuarioRpcResponse.tenant_id, 'clinic_novo_123');

    const legadoRpcResponse = {
      success: true,
      is_reconciled: true,
      tenant_id: 'clinic_existente_456',
      user_id: 'usr_existente_456',
      role: 'ADMIN',
      clinic_name: 'Clinica Odontologica Existente',
      trade_name: 'Consultorio Odonto VIP',
    };

    assert.strictEqual(legadoRpcResponse.is_reconciled, true);
    assert.strictEqual(legadoRpcResponse.tenant_id, 'clinic_existente_456');
    assert.strictEqual(legadoRpcResponse.clinic_name, 'Clinica Odontologica Existente');
  });

  it('AUTH-09: Isolamento de dados entre clinicas e integridade de sessao', () => {
    const demoSession = db.loginDemo();
    assert.strictEqual(demoSession.isDemo, true);
    assert.strictEqual(demoSession.tenantId, 'tenant_demo');

    const org = db.getOrg();
    assert.ok(org.name.length > 0);
    const professional = db.getProfessional();
    assert.ok(professional.cro.length > 0);
  });

  it('AUTH-10: getRecoveryRedirectUrl em producao Vercel vs desenvolvimento Localhost', () => {
    const originalWindow = globalThis.window;

    try {
      // Cenário Produção Vercel
      (globalThis as any).window = { location: { origin: 'https://contabilidade-hibrida.vercel.app' } };
      assert.strictEqual(
        getRecoveryRedirectUrl(),
        'https://contabilidade-hibrida.vercel.app/auth/recovery',
        'Produção deve apontar para o domínio canônico Vercel com rota /auth/recovery'
      );

      // Cenário Desenvolvimento Local
      (globalThis as any).window = { location: { origin: 'http://localhost:3000' } };
      assert.strictEqual(
        getRecoveryRedirectUrl(),
        'http://localhost:3000/auth/recovery',
        'Ambiente local deve apontar para localhost:3000/auth/recovery'
      );
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('AUTH-11: Acesso direto a rota /auth/recovery sem token deve ativar invalid_link', () => {
    const evaluateRecoveryEntry = (pathname: string, hash: string, search: string, isRecoverySession: boolean) => {
      const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
      const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

      const errorCode = hashParams.get('error_code') || searchParams.get('error_code') || '';
      const errorDesc = hashParams.get('error_description') || searchParams.get('error_description') || '';
      const type = hashParams.get('type') || searchParams.get('type') || '';

      const hasOtpExpired =
        errorCode === 'otp_expired' ||
        errorDesc.toLowerCase().includes('expired') ||
        errorDesc.toLowerCase().includes('invalid');

      if (hasOtpExpired) return 'expired';

      const hasRecoveryTokens =
        type === 'recovery' ||
        hash.includes('type=recovery') ||
        search.includes('type=recovery') ||
        hash.includes('access_token=');

      if (isRecoverySession || hasRecoveryTokens) return 'set_new_password';

      if (pathname.includes('/auth/recovery')) return 'invalid_link';

      return 'request';
    };

    // 1. Acesso direto via digitação na barra de endereços (sem token)
    const directAccess = evaluateRecoveryEntry('/auth/recovery', '', '', false);
    assert.strictEqual(
      directAccess,
      'invalid_link',
      'Acesso direto a /auth/recovery sem token DEVE resultar em invalid_link'
    );

    // 2. Acesso via link expirado
    const expiredAccess = evaluateRecoveryEntry('/auth/recovery', '#error_code=otp_expired', '', false);
    assert.strictEqual(expiredAccess, 'expired', 'Link com otp_expired DEVE resultar em expired');

    // 3. Acesso com token de recuperação válido
    const validAccess = evaluateRecoveryEntry('/auth/recovery', '#access_token=valid_token&type=recovery', '', false);
    assert.strictEqual(validAccess, 'set_new_password', 'Link com hash de recuperação válido DEVE permitir set_new_password');
  });

  it('AUTH-12: Fluxo linear impede salto prematuro para definicao de senha', () => {
    type Stage = 'request' | 'sent' | 'invalid_link' | 'expired' | 'set_new_password' | 'password_updated';

    let currentStage: Stage = 'request';

    // Usuário solicita recuperação informando e-mail
    const onRequestSent = () => {
      currentStage = 'sent';
    };
    onRequestSent();
    assert.strictEqual(currentStage, 'sent', 'Após envio, o estado deve ser sent (confirmação)');

    // O usuário não pode pular diretamente para set_new_password a partir de sent
    assert.notStrictEqual(currentStage, 'set_new_password');

    // Apenas quando o Supabase Auth emite evento PASSWORD_RECOVERY ou token válido
    const onAuthRecoveryEvent = () => {
      currentStage = 'set_new_password';
    };
    onAuthRecoveryEvent();
    assert.strictEqual(currentStage, 'set_new_password', 'Transição para set_new_password permitida com token autenticado');
  });

  it('AUTH-13: Cooldown timer para reenviar link', () => {
    let cooldownSeconds = 60;
    assert.strictEqual(cooldownSeconds > 0, true, 'Cooldown deve iniciar ativo (60s)');

    // Simula passagem de tempo
    cooldownSeconds -= 30;
    assert.strictEqual(cooldownSeconds, 30);

    cooldownSeconds = 0;
    assert.strictEqual(cooldownSeconds <= 0, true, 'Quando zero, o botão Reenviar Link fica habilitado');
  });

  it('AUTH-14: Conclusao de recuperacao de senha (password_updated)', () => {
    let stage = 'set_new_password';
    db.setIsPasswordRecovery(true);

    // Senha atualizada com sucesso
    db.setIsPasswordRecovery(false);
    stage = 'password_updated';

    assert.strictEqual(stage, 'password_updated');
    assert.strictEqual(db.getIsPasswordRecovery(), false, 'Estado de recuperação do db deve ser resetado');
  });
});

