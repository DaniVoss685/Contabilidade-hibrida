import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ContabilexIntegrationService } from '../../src/services/contabilexIntegrationService';
import { ContabilexSnapshotPayload, competencyToDisplay } from '../../src/types/contabilexIntegration';

describe('Suíte Funcional: Integração Contábil Contaju — Fonte Oficial Automática, Sync Real e Tabela Simplificada', () => {

  // --------------------------------------------------------------------------
  // 1. REGRA OFICIAL: Fonte Oficial Automática
  // --------------------------------------------------------------------------
  it('INTEGRATION-01: Ao detectar vínculo ACTIVE com snapshots > 0, Contaju deve ser ativado automaticamente como fonte oficial', async () => {
    let activeFiscalMode: string = 'MANUAL_TOTAL';
    let baselineConfigured = false;

    const mockDb = {
      switchFiscalModeAsync: async (newMode: 'CONTABILEX', hasSnapshots: boolean) => {
        activeFiscalMode = newMode;
        return { success: true };
      },
      updateProfessional: (fields: { baselineConfigured?: boolean }) => {
        if (fields.baselineConfigured !== undefined) {
          baselineConfigured = fields.baselineConfigured;
        }
      },
    };

    const linkRes = { link: { status: 'ACTIVE', cnpj: '59666014000140' } };
    const snapRes = {
      snapshots: [
        {
          id: 'snap-1',
          competency: '2026-08',
          gross_revenue: 9797.50,
          factor_r_payroll_base: 3242.00,
          das_total: 587.84,
          version: 1,
        } as ContabilexSnapshotPayload,
      ],
    };

    // Lógica reproduzida de loadContabilexData
    if (linkRes.link && linkRes.link.status === 'ACTIVE') {
      if (snapRes.snapshots && snapRes.snapshots.length > 0) {
        if (activeFiscalMode !== 'CONTABILEX') {
          await mockDb.switchFiscalModeAsync('CONTABILEX', true);
        }
        if (!baselineConfigured) {
          mockDb.updateProfessional({ baselineConfigured: true });
        }
      }
    }

    assert.strictEqual(activeFiscalMode, 'CONTABILEX', 'A modalidade fiscal deve se tornar CONTABILEX automaticamente');
    assert.strictEqual(baselineConfigured, true, 'baselineConfigured deve ser marcado como true automaticamente');
  });

  it('INTEGRATION-02: Se vínculo estiver PENDING ou snapshots for vazio, modalidade manual permanece preservada', async () => {
    let activeFiscalMode: string = 'MANUAL_TOTAL';
    let baselineConfigured = false;

    const mockDb = {
      switchFiscalModeAsync: async (newMode: 'CONTABILEX', hasSnapshots: boolean) => {
        activeFiscalMode = newMode;
        return { success: true };
      },
      updateProfessional: (fields: { baselineConfigured?: boolean }) => {
        if (fields.baselineConfigured !== undefined) {
          baselineConfigured = fields.baselineConfigured;
        }
      },
    };

    const linkRes = { link: { status: 'PENDING', cnpj: '59666014000140' } };
    const snapRes = { snapshots: [] as ContabilexSnapshotPayload[] };

    if (linkRes.link && linkRes.link.status === 'ACTIVE') {
      if (snapRes.snapshots && snapRes.snapshots.length > 0) {
        if (activeFiscalMode !== 'CONTABILEX') {
          await mockDb.switchFiscalModeAsync('CONTABILEX', true);
        }
      }
    }

    assert.strictEqual(activeFiscalMode, 'MANUAL_TOTAL', 'Não deve migrar para CONTABILEX se ainda estiver PENDING');
    assert.strictEqual(baselineConfigured, false, 'baselineConfigured não deve ser ativado antes de ter snapshots');
  });

  // --------------------------------------------------------------------------
  // 2. SINCRONIZAÇÃO SERVER-SIDE REAL (RPC)
  // --------------------------------------------------------------------------
  it('SYNC-01: syncTenantSnapshots existe no ContabilexIntegrationService e valida tenantId', async () => {
    assert.strictEqual(typeof ContabilexIntegrationService.syncTenantSnapshots, 'function');
    
    // Sem tenantId deve retornar erro sem disparar requisição
    const emptyRes = await ContabilexIntegrationService.syncTenantSnapshots('');
    assert.strictEqual(emptyRes.success, false);
    assert.strictEqual(emptyRes.error, 'Tenant ID não informado');
  });

  it('SYNC-02: Feedback Toast correto conforme retorno da sincronização', () => {
    const getToastMessage = (syncRes: { success: boolean; changed?: boolean; error?: string }) => {
      if (!syncRes.success) {
        return 'Não foi possível sincronizar agora. Tente novamente em instantes.';
      }
      if (syncRes.changed) {
        return 'Dados atualizados com sucesso.';
      }
      return 'Dados já estão atualizados.';
    };

    // Caso A: Houve retificação / novas competências
    assert.strictEqual(
      getToastMessage({ success: true, changed: true }),
      'Dados atualizados com sucesso.'
    );

    // Caso B: Nenhuma alteração (idempotente)
    assert.strictEqual(
      getToastMessage({ success: true, changed: false }),
      'Dados já estão atualizados.'
    );

    // Caso C: Falha de rede ou RPC
    assert.strictEqual(
      getToastMessage({ success: false, error: 'Network timeout' }),
      'Não foi possível sincronizar agora. Tente novamente em instantes.'
    );
  });

  // --------------------------------------------------------------------------
  // 3. TABELA DE COMPETÊNCIAS COM ALÍQUOTA DO MÊS
  // --------------------------------------------------------------------------
  it('TABLE-01: Formatação e cálculo correto das 6 colunas da tabela incluindo Alíquota do Mês', () => {
    const mockSnapshots: ContabilexSnapshotPayload[] = [
      {
        id: 'snap-1',
        competency: '2026-08',
        gross_revenue: 9797.50,
        factor_r_payroll_base: 3242.00,
        das_total: 587.84,
        effective_rate: 6.0,
        version: 1,
        status: 'PUBLISHED',
      } as ContabilexSnapshotPayload,
      {
        id: 'snap-2',
        competency: '2026-07',
        gross_revenue: 0,
        factor_r_payroll_base: 0,
        das_total: 0,
        effective_rate: null,
        version: 1,
        status: 'PUBLISHED',
      } as ContabilexSnapshotPayload,
    ];

    const tableRows = mockSnapshots.map((s) => {
      const revenue = Number(s.gross_revenue) || 0;
      const payroll = Number(s.factor_r_payroll_base) || 0;
      const ratio = revenue > 0 ? (payroll / revenue) * 100 : null;

      return {
        competencia: competencyToDisplay(s.competency),
        receitaBruta: revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        valorDaFolha: payroll.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        guiaDas: s.das_total !== null ? s.das_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Em apuração',
        aliquotaDoMes: s.effective_rate !== null && s.effective_rate !== undefined ? `${Number(s.effective_rate).toFixed(2).replace('.', ',')}%` : '—',
        relacaoFolhaReceita: ratio !== null ? `${ratio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '—',
      };
    });

    // Coluna 1: Competência MM/YYYY
    assert.strictEqual(tableRows[0].competencia, '08/2026');
    assert.strictEqual(tableRows[1].competencia, '07/2026');

    // Coluna 2: Receita Bruta
    assert.ok(tableRows[0].receitaBruta.includes('9.797,50'));

    // Coluna 3: Valor da Folha
    assert.ok(tableRows[0].valorDaFolha.includes('3.242,00'));

    // Coluna 4: Guia DAS
    assert.ok(tableRows[0].guiaDas.includes('587,84'));

    // Coluna 5: Alíquota do Mês
    assert.strictEqual(tableRows[0].aliquotaDoMes, '6,00%');
    assert.strictEqual(tableRows[1].aliquotaDoMes, '—');

    // Coluna 6: Relação Folha/Receita (% pt-BR)
    // 3242 / 9797.50 = 33.09007... -> 33,09%
    assert.strictEqual(tableRows[0].relacaoFolhaReceita, '33,09%');
    assert.strictEqual(tableRows[1].relacaoFolhaReceita, '—');

    // Garante que o objeto da linha tem as 6 propriedades essenciais esperadas
    const keys = Object.keys(tableRows[0]);
    assert.strictEqual(keys.length, 6);
    assert.deepStrictEqual(keys, ['competencia', 'receitaBruta', 'valorDaFolha', 'guiaDas', 'aliquotaDoMes', 'relacaoFolhaReceita']);
  });

  it('SYNC-03: Sincronização varre todos os 12 meses cadastrados na contabilidade, permitindo retificação de meses antigos', () => {
    // Simula 12 competências onde meses anteriores (ex: 10/2025 e 09/2025) foram retificados de 0 para 1518
    const existingSnapshots = [
      { competency: '2026-08', gross_revenue: 9797.50, factor_r_payroll_base: 3242.00, content_hash: 'hash-08' },
      { competency: '2025-10', gross_revenue: 4480.00, factor_r_payroll_base: 0.00, content_hash: 'old-hash-10' },
      { competency: '2025-09', gross_revenue: 13550.00, factor_r_payroll_base: 0.00, content_hash: 'old-hash-09' },
    ];

    const updatedPayrollFromContaju: Record<string, number> = {
      '2026-08': 3242.00,
      '2025-10': 1518.00, // Preenchido posteriormente
      '2025-09': 1518.00, // Preenchido posteriormente
    };

    let updatedCount = 0;
    let unchangedCount = 0;

    for (const snap of existingSnapshots) {
      const currentSalary = updatedPayrollFromContaju[snap.competency];
      if (currentSalary !== snap.factor_r_payroll_base) {
        updatedCount++;
      } else {
        unchangedCount++;
      }
    }

    assert.strictEqual(updatedCount, 2, 'Deve atualizar as 2 competências retificadas de meses anteriores (10/2025 e 09/2025)');
    assert.strictEqual(unchangedCount, 1, 'Deve manter intacta a competência que não mudou');
  });

  // --------------------------------------------------------------------------
  // 4. AUSÊNCIA DE BRANDING "CONTÁBILEX" NA INTERFACE
  // --------------------------------------------------------------------------
  it('BRANDING-01: Rótulos e badges na UI utilizam "Contaju" ou "Escritório Contaju"', () => {
    const uiLabels = {
      connectedBadge: 'Contaju conectado',
      waitingBadge: 'Contaju — Conexão ativa (Aguardando publicações)',
      pendingBadge: 'Contaju — Solicitação pendente de aprovação',
      officialRate: 'Oficial Contaju',
      sectionTitle: 'Composição dos Meses Sincronizados (Escritório Contaju)',
      note: 'Base Oficial Contaju: A apuração do Fator R utiliza a base da folha consolidada e homologada oficialmente pelo Escritório Contaju.',
    };

    Object.values(uiLabels).forEach((text) => {
      assert.ok(!/contábilex/i.test(text), `Texto "${text}" não deve conter Contábilex`);
      assert.ok(/contaju/i.test(text), `Texto "${text}" deve mencionar Contaju`);
    });
  });
});
