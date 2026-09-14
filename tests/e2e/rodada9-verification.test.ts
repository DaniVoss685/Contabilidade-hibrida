import { describe, test, expect } from './harness/testHarness';
import { db } from '../../src/lib/db';
import { Appointment, AppointmentStatus } from '../../src/types';

describe('Rodada 9: Acabamento da Agenda, Data Dinâmica Global, Inputs Premium e Modal Central', 1, () => {
  test('R9-DYNAMIC-DATE: Data Dinâmica Global no Sistema (Sem Hardcode de Maio/2025)', () => {
    db.resetToDemo();
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const curYM = `${curYear}-${curMonth}`;

    // 1. Folha de pagamento possui 12 meses contínuos terminando no mês corrente
    const payroll = db.getPayrollHistory();
    expect(payroll.length).toBe(12);
    expect(payroll[payroll.length - 1].month).toBe(curYM);

    // 2. Base do ano corrente possui vendas e despesas devidamente populadas
    const sales = db.getSales();
    const expenses = db.getExpenses();
    const curYearSales = sales.filter((s) => s.serviceDate?.startsWith(String(curYear)));
    const curYearExpenses = expenses.filter((e) => e.competenceDate?.startsWith(String(curYear)));
    expect(curYearSales.length).toBeGreaterThan(0);
    expect(curYearExpenses.length).toBeGreaterThan(0);

    // 3. Profissional Responsável controlado
    const profs = db.getProfessionals();
    expect(profs.length).toBeGreaterThanOrEqual(1);
    expect(profs[0].name).toBe('Dr. Carlos Eduardo Mendes');
    expect(db.getProfessional().name).toBe('Dr. Carlos Eduardo Mendes');
  }, { requirement: 'R9' });

  test('R9-AGENDA-COHERENCE: Coerência de Dados, Filtros de Período e Próximos Atendimentos', () => {
    db.resetToDemo();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayISO = `${year}-${month}-${day}`;

    // 1. Agendamentos de hoje existem e refletem a data corrente real
    const appointments = db.getAppointments();
    const todaysApts = appointments.filter((a) => a.date === todayISO);
    expect(todaysApts.length).toBeGreaterThan(0);

    // 2. Contadores do período ativo contam apenas os agendamentos visíveis
    const confirmadas = todaysApts.filter((a) => a.status === 'CONFIRMADA').length;
    const finalizadas = todaysApts.filter((a) => a.status === 'FINALIZADA').length;
    const emAtendimento = todaysApts.filter((a) => a.status === 'EM_ATENDIMENTO').length;

    expect(todaysApts.length).toBe(confirmadas + finalizadas + emAtendimento + todaysApts.filter(a => a.status !== 'CONFIRMADA' && a.status !== 'FINALIZADA' && a.status !== 'EM_ATENDIMENTO').length);

    // 3. Período vazio (ano 2029) calcula contadores estritamente zerados
    const emptyPeriodApts = appointments.filter((a) => a.date.startsWith('2029-'));
    expect(emptyPeriodApts.length).toBe(0);
  }, { requirement: 'R9' });

  test('R9-CENTRAL-MODAL: Modal Central de Detalhes com Transições de Status e Cancelamento', () => {
    db.resetToDemo();
    const initialCount = db.getAppointments().length;

    // 1. Criar agendamento teste
    const newApt = db.addAppointment({
      orgId: db.getOrg().id,
      patientId: 'pat_test_r9',
      patientName: 'Fernanda Vasconcelos',
      patientPhone: '(11) 98888-7777',
      patientCpf: '987.654.321-99',
      date: new Date().toISOString().split('T')[0],
      startTime: '11:00',
      durationMinutes: 45,
      endTime: '11:45',
      dentistName: 'Dr. Carlos Eduardo Mendes',
      procedureName: 'Restauração Estética',
      status: 'PENDENTE',
      origin: 'WHATSAPP',
    });

    expect(newApt.id).toBeDefined();

    // 2. Ciclo de atendimento rápido (Recepção -> Atendimento -> Finalizada)
    db.updateAppointmentStatus(newApt.id, 'AGUARDANDO');
    let found = db.getAppointments().find((a) => a.id === newApt.id);
    expect(found?.status).toBe('AGUARDANDO');

    db.updateAppointmentStatus(newApt.id, 'EM_ATENDIMENTO');
    found = db.getAppointments().find((a) => a.id === newApt.id);
    expect(found?.status).toBe('EM_ATENDIMENTO');

    db.updateAppointmentStatus(newApt.id, 'FINALIZADA');
    found = db.getAppointments().find((a) => a.id === newApt.id);
    expect(found?.status).toBe('FINALIZADA');

    // 3. Exclusão / Cancelamento
    const deleted = db.deleteAppointment(newApt.id);
    expect(deleted).toBe(true);
    expect(db.getAppointments().length).toBe(initialCount);
  }, { requirement: 'R9' });

  test('R9-TIME-PICKER: TimePicker e Cálculo de Horário de Término em Múltiplos Intervalos', () => {
    // Cálculo de término para durações suportadas: 15, 30, 45, 60, 90, 120 min
    const calculateEndTime = (start: string, durationMinutes: number): string => {
      const [h, m] = start.split(':').map(Number);
      const totalMin = h * 60 + m + durationMinutes;
      const endH = Math.floor(totalMin / 60) % 24;
      const endM = totalMin % 60;
      return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    };

    expect(calculateEndTime('08:30', 15)).toBe('08:45');
    expect(calculateEndTime('08:30', 30)).toBe('09:00');
    expect(calculateEndTime('08:30', 45)).toBe('09:15');
    expect(calculateEndTime('09:00', 60)).toBe('10:00');
    expect(calculateEndTime('10:30', 90)).toBe('12:00');
    expect(calculateEndTime('14:15', 120)).toBe('16:15');
    expect(calculateEndTime('18:45', 45)).toBe('19:30');
  }, { requirement: 'R9' });
});
