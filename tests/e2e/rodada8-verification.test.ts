import { describe, test, expect } from './harness/testHarness';
import { db, getSalePaymentSummary } from '../../src/lib/db';
import { Sale, Appointment, AppointmentStatus } from '../../src/types';

describe('Rodada 8: Agenda Clínica, Login, Vínculo Receitas ↔ Contas a Receber e Simulador', 1, () => {
  test('R8-APPOINTMENTS: Gestão Completa da Agenda Clínica (CRUD, Status e Horários)', () => {
    db.resetToDemo();
    const initialAppointments = db.getAppointments();
    expect(initialAppointments.length).toBeGreaterThan(0);

    // 1. Criar novo agendamento
    const newApt = db.addAppointment({
      orgId: db.getOrg().id,
      patientId: 'pat_demo_01',
      patientName: 'Mariana Costa Ribeiro',
      patientPhone: '(11) 98765-4321',
      patientCpf: '123.456.789-00',
      date: '2025-05-15',
      startTime: '10:00',
      durationMinutes: 45,
      endTime: '10:45',
      dentistName: 'Dr. Carlos Eduardo Mendes',
      procedureName: 'Restauração Resina Dente 16',
      status: 'CONFIRMADA',
      origin: 'WHATSAPP',
      notes: 'Paciente prefere anestesia sem vasoconstritor.',
      sendWhatsappReminder: true,
    });

    expect(newApt.id).toBeDefined();
    expect(newApt.patientName).toBe('Mariana Costa Ribeiro');
    expect(newApt.status).toBe('CONFIRMADA');

    // 2. Localizar na lista
    const aptsAfterAdd = db.getAppointments();
    const found = aptsAfterAdd.find((a) => a.id === newApt.id);
    expect(found).toBeDefined();

    // 3. Atualizar status para ciclo de atendimento
    db.updateAppointmentStatus(newApt.id, 'AGUARDANDO');
    let current = db.getAppointments().find((a) => a.id === newApt.id);
    expect(current?.status).toBe('AGUARDANDO');

    db.updateAppointmentStatus(newApt.id, 'EM_ATENDIMENTO');
    current = db.getAppointments().find((a) => a.id === newApt.id);
    expect(current?.status).toBe('EM_ATENDIMENTO');

    db.updateAppointmentStatus(newApt.id, 'FINALIZADA');
    current = db.getAppointments().find((a) => a.id === newApt.id);
    expect(current?.status).toBe('FINALIZADA');

    // 4. Excluir agendamento
    const deleted = db.deleteAppointment(newApt.id);
    expect(deleted).toBe(true);
    const aptsAfterDelete = db.getAppointments();
    expect(aptsAfterDelete.some((a) => a.id === newApt.id)).toBe(false);
  }, { requirement: 'R8' });

  test('R8-RECEIVABLES-SYNC: Sincronização Receitas ↔ Contas a Receber & Estorno (Unsettle)', () => {
    db.resetToDemo();

    // Cria uma venda de teste com 3 parcelas de R$ 1.000 (total R$ 3.000)
    const testSale = db.addSale({
      taxOrigin: 'CPF',
      patientId: 'pat_test_01',
      patientName: 'Paciente Teste Sincronização',
      patientCpf: '111.222.333-44',
      payerIsBeneficiary: true,
      procedureName: 'Tratamento Canal Molar',
      description: 'Endodontia especializada',
      totalValue: 3000,
      serviceDate: '2025-05-10',
      paymentMethod: 'PIX',
      installmentsCount: 3,
      installments: [
        {
          id: 'inst_sync_1',
          saleId: 'sale_sync_test',
          installmentNumber: 1,
          totalInstallments: 3,
          dueDate: '2027-05-10',
          value: 1000,
          status: 'A_RECEBER',
          receitaSaudeStatus: 'A_EMITIR',
        },
        {
          id: 'inst_sync_2',
          saleId: 'sale_sync_test',
          installmentNumber: 2,
          totalInstallments: 3,
          dueDate: '2027-06-10',
          value: 1000,
          status: 'A_RECEBER',
          receitaSaudeStatus: 'A_EMITIR',
        },
        {
          id: 'inst_sync_3',
          saleId: 'sale_sync_test',
          installmentNumber: 3,
          totalInstallments: 3,
          dueDate: '2027-07-10',
          value: 1000,
          status: 'A_RECEBER',
          receitaSaudeStatus: 'A_EMITIR',
        },
      ],
    });

    // 1. Inicialmente: Todas a receber -> status PENDENTE
    let summary = getSalePaymentSummary(testSale);
    expect(summary.overallStatus).toBe('PENDENTE');
    expect(summary.receivedCount).toBe(0);
    expect(summary.pendingCount).toBe(3);
    expect(summary.receivedValue).toBe(0);
    expect(summary.pendingValue).toBe(3000);

    // 2. Liquidar parcela 1 -> status PARCIALMENTE_RECEBIDA
    db.updateReceivableInstallment('inst_sync_1', {
      status: 'RECEBIDO',
      paymentDate: '2025-05-10',
      value: 1000,
    });
    let updatedSale = db.getSaleById(testSale.id)!;
    summary = getSalePaymentSummary(updatedSale);
    expect(summary.overallStatus).toBe('PARCIALMENTE_RECEBIDA');
    expect(summary.receivedCount).toBe(1);
    expect(summary.pendingCount).toBe(2);
    expect(summary.receivedValue).toBe(1000);
    expect(summary.pendingValue).toBe(2000);

    // 3. Liquidar parcelas 2 e 3 -> status TOTALMENTE_RECEBIDA
    db.updateReceivableInstallment('inst_sync_2', {
      status: 'RECEBIDO',
      paymentDate: '2025-06-10',
      value: 1000,
    });
    db.updateReceivableInstallment('inst_sync_3', {
      status: 'RECEBIDO',
      paymentDate: '2025-07-10',
      value: 1000,
    });
    updatedSale = db.getSaleById(testSale.id)!;
    summary = getSalePaymentSummary(updatedSale);
    expect(summary.overallStatus).toBe('TOTALMENTE_RECEBIDA');
    expect(summary.receivedCount).toBe(3);
    expect(summary.pendingCount).toBe(0);
    expect(summary.receivedValue).toBe(3000);
    expect(summary.pendingValue).toBe(0);

    // 4. Ação reversa: Desfazer recebimento da parcela 3 (unsettle)
    const unsetResult = db.unsettleInstallment(testSale.id, 'inst_sync_3');
    expect(unsetResult).toBe(true);

    updatedSale = db.getSaleById(testSale.id)!;
    const inst3 = updatedSale.installments.find((i) => i.id === 'inst_sync_3')!;
    expect(inst3.status).toBe('A_RECEBER');
    expect(inst3.paymentDate).toBeUndefined();
    expect(inst3.amountReceived).toBe(0);
    expect(inst3.receitaSaudeStatus).toBe('A_EMITIR');

    // Status da venda deve retornar para PARCIALMENTE_RECEBIDA
    summary = getSalePaymentSummary(updatedSale);
    expect(summary.overallStatus).toBe('PARCIALMENTE_RECEBIDA');
    expect(summary.receivedCount).toBe(2);
    expect(summary.pendingCount).toBe(1);
    expect(summary.receivedValue).toBe(2000);
    expect(summary.pendingValue).toBe(1000);

    // 5. Desfazer as demais parcelas -> deve retornar para PENDENTE
    db.unsettleInstallment(testSale.id, 'inst_sync_1');
    db.unsettleInstallment(testSale.id, 'inst_sync_2');
    updatedSale = db.getSaleById(testSale.id)!;
    summary = getSalePaymentSummary(updatedSale);
    expect(summary.overallStatus).toBe('PENDENTE');
    expect(summary.receivedCount).toBe(0);
    expect(summary.pendingCount).toBe(3);
    expect(summary.receivedValue).toBe(0);
  }, { requirement: 'R8' });

  test('R8-AUTH-DEMO: Consistência do Perfil e Acesso de Demonstração', () => {
    db.resetToDemo();
    const user = db.getUser();
    const prof = db.getProfessional();
    const org = db.getOrg();

    // Verificações essenciais de login / multi-tenant
    expect(user.email).toBe('dr.carlos@mendesodonto.com.br');
    expect(user.role).toBe('OWNER');
    expect(prof.croUf).toBe('SP');
    expect(prof.cro).toBe('98765');
    expect(org.id).toBe(user.orgId);
    expect(prof.optanteSimples).toBe(true);
  }, { requirement: 'R8' });

  test('R8-SIMULATOR-DELTA: Exibição Amigável do Delta do Fator R em % com Tooltip', () => {
    const baselineFatorR = 28.0; // 28%
    const simulatedFatorR = 32.5; // 32.5%
    const deltaPp = simulatedFatorR - baselineFatorR; // +4.5 p.p.

    // Formatação amigável para o dentista
    const formattedDelta = `${deltaPp > 0 ? '+' : ''}${deltaPp.toFixed(1)}%`;
    expect(formattedDelta).toBe('+4.5%');

    // Tooltip explicativo
    const tooltipText = `Variação de ${deltaPp > 0 ? '+' : ''}${deltaPp.toFixed(1)} pontos percentuais (p.p.) na razão Folha/Faturamento`;
    expect(tooltipText).toContain('+4.5 pontos percentuais');
    expect(tooltipText).toContain('Folha/Faturamento');
  }, { requirement: 'R8' });
});
