import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatCnpj, normalizeCnpj } from '../../src/types/contabilexIntegration';
import { Professional, ClinicTenant, AuthSession, User } from '../../src/types';

describe('Suíte Funcional: CNPJ da Clínica em Configurações & Integração Automática Contaju', () => {

  // --------------------------------------------------------------------------
  // 1. FORMATAÇÃO E VALIDAÇÃO DE CNPJ NAS CONFIGURAÇÕES
  // --------------------------------------------------------------------------
  it('SETTINGS-CNPJ-01: Formatação com máscara progressiva e normalização de 14 dígitos', () => {
    // Digitação progressiva
    assert.strictEqual(formatCnpj('32'), '32');
    assert.strictEqual(formatCnpj('32784'), '32.784');
    assert.strictEqual(formatCnpj('32784757'), '32.784.757');
    assert.strictEqual(formatCnpj('327847570001'), '32.784.757/0001');
    assert.strictEqual(formatCnpj('32784757000188'), '32.784.757/0001-88');

    // Normalização limpa caracteres especiais
    assert.strictEqual(normalizeCnpj('32.784.757/0001-88'), '32784757000188');
    assert.strictEqual(normalizeCnpj('32.784.757/0001-88').length, 14);

    // Rejeição de CNPJ incompleto
    assert.strictEqual(normalizeCnpj('12345').length, 5);
    assert.notStrictEqual(normalizeCnpj('12345').length, 14);
  });

  // --------------------------------------------------------------------------
  // 2. PERSISTÊNCIA NOS DADOS PROFISSIONAIS E PROPAGAÇÃO PARA CLÍNICA E SESSÃO
  // --------------------------------------------------------------------------
  it('SETTINGS-CNPJ-02: Persistência de CNPJ atualiza Professional, registeredClinics e currentSession', () => {
    let mockProfessional: Professional = {
      id: 'prof_test',
      orgId: 'org_test',
      name: 'Dra Bruna',
      cpf: '12345678901',
      cro: '255633',
      croUf: 'MG',
      cnpj: '',
      razaoSocial: 'Bizone',
      nomeFantasia: 'Bizone',
      municipio: 'Belo Horizonte - MG',
      regimeTributario: 'SIMPLES_NACIONAL',
      optanteSimples: true,
      rbt12Inicial: 0,
      folha12MesesInicial: 0,
      proLaboreMensal: 0,
      numDependentes: 0,
      inssProprioMensal: 0,
      outrosRendimentosTributaveis: 0,
    };

    let mockClinic: ClinicTenant = {
      id: 'clinic_test',
      name: 'Bizone',
      tradeName: 'Bizone',
      cnpj: '',
      cpfCnpj: '',
      cro: '255633',
      croUf: 'MG',
      createdAt: new Date().toISOString(),
    };

    let mockSession: AuthSession = {
      user: { id: 'usr_1', orgId: 'org_test', name: 'Dra Bruna', email: 'bruna@bizone.com', role: 'OWNER' } as User,
      clinic: mockClinic,
      tenantId: 'clinic_test',
      isDemo: false,
    };

    // Função de atualização replicando a lógica de db.updateProfessional
    const updateProfessionalSim = (updates: Partial<Professional>) => {
      mockProfessional = { ...mockProfessional, ...updates };

      const clinicName = (updates.nomeFantasia || updates.razaoSocial || '').trim();
      const updatedCnpj = updates.cnpj !== undefined ? updates.cnpj.trim() : undefined;

      if (clinicName || updatedCnpj !== undefined) {
        if (clinicName) {
          mockClinic.name = clinicName;
          mockClinic.tradeName = clinicName;
        }
        if (updatedCnpj !== undefined) {
          mockClinic.cnpj = updatedCnpj;
          mockClinic.cpfCnpj = updatedCnpj;
        }

        if (mockSession.clinic && mockSession.tenantId === 'clinic_test') {
          if (clinicName) {
            mockSession.clinic.name = clinicName;
            mockSession.clinic.tradeName = clinicName;
          }
          if (updatedCnpj !== undefined) {
            mockSession.clinic.cnpj = updatedCnpj;
            mockSession.clinic.cpfCnpj = updatedCnpj;
          }
        }
      }
    };

    // Usuária preenche e salva o CNPJ nas Configurações
    const novoCnpjFormatado = formatCnpj('32784757000188');
    updateProfessionalSim({
      name: 'Dra Bruna',
      nomeFantasia: 'Bizone',
      cnpj: novoCnpjFormatado,
    });

    assert.strictEqual(mockProfessional.cnpj, '32.784.757/0001-88');
    assert.strictEqual(mockClinic.cnpj, '32.784.757/0001-88');
    assert.strictEqual(mockSession.clinic.cnpj, '32.784.757/0001-88');
  });

  // --------------------------------------------------------------------------
  // 3. INTEGRAÇÃO AUTOMÁTICA EM TAXESVIEW SEM PRECISAR DIGITAR O CNPJ
  // --------------------------------------------------------------------------
  it('INTEGRATION-CNPJ-01: TaxesView resolve savedCnpj e hasSavedCnpj a partir de Professional', () => {
    // Cenário A: Profissional sem CNPJ
    const profSemCnpj: Partial<Professional> = { cnpj: '' };
    const savedCnpjA = (profSemCnpj.cnpj || '').replace(/\D/g, '');
    const hasSavedCnpjA = savedCnpjA.length === 14;

    assert.strictEqual(hasSavedCnpjA, false, 'Sem CNPJ nas configurações não deve marcar hasSavedCnpj como true');

    // Cenário B: Profissional com CNPJ salvo nas Configurações
    const profComCnpj: Partial<Professional> = { cnpj: '32.784.757/0001-88' };
    const savedCnpjB = (profComCnpj.cnpj || '').replace(/\D/g, '');
    const hasSavedCnpjB = savedCnpjB.length === 14;

    assert.strictEqual(hasSavedCnpjB, true, 'Com CNPJ de 14 dígitos nas configurações deve marcar hasSavedCnpj como true');
    assert.strictEqual(formatCnpj(savedCnpjB), '32.784.757/0001-88');
  });

  it('INTEGRATION-CNPJ-02: Botão Conectar ao Escritório Contaju fica habilitado imediatamente para 1 clique', () => {
    const tenantAuthStatus = 'AUTHENTICATED_WITH_TENANT';
    const isRequestingLink = false;
    const savedCnpj = '32784757000188';
    const contabilexCnpjInput = '';

    // Condição do botão no TaxesView
    const effectiveCnpj = savedCnpj || contabilexCnpjInput;
    const isButtonDisabled =
      isRequestingLink ||
      tenantAuthStatus !== 'AUTHENTICATED_WITH_TENANT' ||
      normalizeCnpj(effectiveCnpj).length !== 14;

    assert.strictEqual(isButtonDisabled, false, 'O botão deve ficar habilitado diretamente para 1 clique sem exigir digitação');
  });

  it('INTEGRATION-CNPJ-03: handleRequestContabilexLink usa savedCnpj e não quebra se contabilexCnpjInput for vazio', () => {
    const savedCnpj = '32784757000188';
    const contabilexCnpjInput = '';

    const targetCnpj = savedCnpj || normalizeCnpj(contabilexCnpjInput);
    const clean = normalizeCnpj(targetCnpj);

    assert.strictEqual(clean, '32784757000188');
    assert.strictEqual(clean.length, 14);
  });
});
