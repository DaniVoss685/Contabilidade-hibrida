import { describe, test, expect } from './harness/testHarness';
import { db } from '../../src/lib/db';
import { hashPassword, verifyPassword, generateSalt } from '../../src/lib/authCrypto';
import { formatDateBr } from '../../src/lib/masks';
import { Appointment, AppointmentStatus } from '../../src/types';
import fs from 'fs';
import path from 'path';

describe('Rodada 10: Estabilidade da Agenda, Fluxo de Consultas, Dados Reais e Multi-Tenant Real', 1, () => {
  // Test 1: Zero Hooks Error & Stability of AppointmentModal
  test('R10-STABILITY-HOOKS: Prevenção de Erros de Hooks e Execução Incondicional', () => {
    // Read the component source code to statically verify hooks placement
    const modalPath = path.join(process.cwd(), 'src', 'components', 'Appointments', 'AppointmentModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf-8');

    // 1. Verify all hooks are called before any early return statement
    const earlyReturnRegex = /if\s*\(\s*!isOpen\s*\)\s*return\s*null;/;
    expect(earlyReturnRegex.test(modalContent)).toBe(true);

    const indexOfEarlyReturn = modalContent.search(earlyReturnRegex);
    const lastUseStateIndex = modalContent.lastIndexOf('useState(');
    const lastUseEffectIndex = modalContent.lastIndexOf('useEffect(');
    const lastUseMemoIndex = modalContent.lastIndexOf('useMemo(');

    // All hooks must appear BEFORE the early return
    expect(lastUseStateIndex).toBeLessThan(indexOfEarlyReturn);
    expect(lastUseEffectIndex).toBeLessThan(indexOfEarlyReturn);
    expect(lastUseMemoIndex).toBeLessThan(indexOfEarlyReturn);

    // 2. Verify rescheduleFromAppointment prop exists and is handled
    expect(modalContent.includes('rescheduleFromAppointment')).toBe(true);
    expect(modalContent.includes('rescheduledFromId')).toBe(true);

    // 3. Verify empty state for procedures when clinic has 0 procedures
    expect(modalContent.includes('Nenhum procedimento cadastrado')).toBe(true);
  }, { requirement: 'R10' });

  // Test 2: Standard Brazilian Date Format (DD/MM/AAAA)
  test('R10-DATE-FORMAT-BR: Formatação Estrita em DD/MM/AAAA no Sistema e Mensagens', () => {
    // 1. Test formatDateBr utility
    expect(formatDateBr('2026-09-15')).toBe('15/09/2026');
    expect(formatDateBr('2026-01-05')).toBe('05/01/2026');
    expect(formatDateBr('2025-12-31')).toBe('31/12/2025');

    // 2. Appointment Details Modal uses formatDateBr for displayed dates and WhatsApp template
    const detailsModalPath = path.join(process.cwd(), 'src', 'components', 'Appointments', 'AppointmentDetailsModal.tsx');
    const detailsContent = fs.readFileSync(detailsModalPath, 'utf-8');
    expect(detailsContent.includes('formatDateBr(appointment.date)')).toBe(true);

    // 3. Verify WhatsApp notification template uses formatDateBr
    expect(detailsContent.includes('formatDateBr(appointment.date)} às ${appointment.startTime}')).toBe(true);
  }, { requirement: 'R10' });

  // Test 3: Operational Flow, Missed Confirmation & Bidirectional Reschedule
  test('R10-OPERATIONAL-FLOW: Fluxo Operacional de Consultas, Falta e Reagendamento Vinculado', () => {
    db.resetToDemo();

    // 1. Add appointment in initial AGENDADA state
    const apt = db.addAppointment({
      orgId: db.getOrg().id,
      patientId: 'pat_01',
      patientName: 'Ana Beatriz Souza',
      professionalId: db.getProfessional().id,
      professionalName: db.getProfessional().name,
      date: '2026-09-20',
      startTime: '10:00',
      endTime: '11:00',
      durationMinutes: 60,
      status: 'AGENDADA',
      procedureName: 'Profilaxia e Raspagem',
    });

    expect(apt.id).toBeDefined();
    expect(apt.status).toBe('AGENDADA');

    // 2. Sequential operational transitions
    db.updateAppointmentStatus(apt.id, 'CONFIRMADA');
    expect(db.getAppointmentById(apt.id)?.status).toBe('CONFIRMADA');

    db.updateAppointmentStatus(apt.id, 'CHEGOU');
    expect(db.getAppointmentById(apt.id)?.status).toBe('CHEGOU');

    db.updateAppointmentStatus(apt.id, 'EM_ATENDIMENTO');
    expect(db.getAppointmentById(apt.id)?.status).toBe('EM_ATENDIMENTO');

    db.updateAppointmentStatus(apt.id, 'FINALIZADA');
    expect(db.getAppointmentById(apt.id)?.status).toBe('FINALIZADA');

    // 3. Register missed appointment (FALTOU)
    const missedApt = db.addAppointment({
      orgId: db.getOrg().id,
      patientId: 'pat_02',
      patientName: 'Carlos Henrique Lima',
      professionalId: db.getProfessional().id,
      professionalName: db.getProfessional().name,
      date: '2026-09-21',
      startTime: '14:00',
      endTime: '15:00',
      durationMinutes: 60,
      status: 'AGENDADA',
      procedureName: 'Restauração em Resina',
    });

    const missedTimestamp = new Date().toISOString();
    db.updateAppointment(missedApt.id, {
      status: 'FALTOU',
      missedAt: missedTimestamp,
    });

    const recordedMissed = db.getAppointmentById(missedApt.id);
    expect(recordedMissed?.status).toBe('FALTOU');
    expect(recordedMissed?.missedAt).toBe(missedTimestamp);

    // 4. Reschedule missed appointment into a new one with bidirectional linkage
    const rescheduledApt = db.addAppointment({
      orgId: db.getOrg().id,
      patientId: recordedMissed!.patientId,
      patientName: recordedMissed!.patientName,
      professionalId: recordedMissed!.professionalId,
      professionalName: recordedMissed!.professionalName,
      date: '2026-09-25',
      startTime: '16:00',
      endTime: '17:00',
      durationMinutes: 60,
      status: 'AGENDADA',
      procedureName: recordedMissed!.procedureName,
      rescheduledFromId: recordedMissed!.id,
      rescheduledFromDate: recordedMissed!.date,
    });

    // Link original appointment to the new rescheduled one
    db.updateAppointment(recordedMissed!.id, {
      rescheduledToId: rescheduledApt.id,
      rescheduledToDate: rescheduledApt.date,
      rescheduledToTime: rescheduledApt.startTime,
    });

    // Verify mutual links
    const originalAfter = db.getAppointmentById(recordedMissed!.id);
    const rescheduledAfter = db.getAppointmentById(rescheduledApt.id);

    expect(originalAfter?.rescheduledToId).toBe(rescheduledApt.id);
    expect(originalAfter?.rescheduledToDate).toBe('2026-09-25');
    expect(originalAfter?.rescheduledToTime).toBe('16:00');

    expect(rescheduledAfter?.rescheduledFromId).toBe(recordedMissed!.id);
    expect(rescheduledAfter?.rescheduledFromDate).toBe('2026-09-21');
  }, { requirement: 'R10' });

  // Test 4: Multi-Tenant Architecture & Complete Isolation
  test('R10-MULTI-TENANT-ISOLATION: Isolamento Rigoroso entre Clínicas e Pureza de Dados', async () => {
    // 1. Create Clinic Alpha
    const alphaRes = await db.createClinicAccount({
      clinicName: 'Clínica Odonto Alpha',
      professionalName: 'Dr. Lucas Alpha',
      cro: '11111',
      uf: 'SP',
      email: 'lucas@alpha.com.br',
      password: 'Alpha@Secret2026',
    });

    expect(alphaRes.success).toBe(true);
    expect(alphaRes.session?.clinic.name).toBe('Clínica Odonto Alpha');

    // 2. Real account starts clean: ZERO patients, sales, expenses, appointments
    expect(db.getPatients().length).toBe(0);
    expect(db.getSales().length).toBe(0);
    expect(db.getExpenses().length).toBe(0);
    expect(db.getAppointments().length).toBe(0);

    // 3. Add data into Alpha
    const alphaPatient = db.addPatient({
      orgId: db.getOrg().id,
      name: 'Paciente Exclusivo Alpha',
      cpf: '11122233344',
      phone: '(11) 91111-1111',
    });

    const alphaSale = db.addSale({
      orgId: db.getOrg().id,
      taxOrigin: 'CPF',
      patientId: alphaPatient.id,
      patientName: alphaPatient.name,
      patientCpf: alphaPatient.cpf,
      payerIsBeneficiary: true,
      procedureName: 'Consulta Alpha',
      description: 'Procedimento Alpha',
      totalValue: 500,
      serviceDate: '2026-09-10',
      paymentMethod: 'PIX',
      installmentsCount: 1,
      installments: [
        {
          id: 'inst_alpha_1',
          saleId: '',
          installmentNumber: 1,
          totalInstallments: 1,
          value: 500,
          dueDate: '2026-09-10',
          status: 'RECEBIDO',
        },
      ],
    });

    expect(db.getPatients().length).toBe(1);
    expect(db.getSales().length).toBe(1);

    // 4. Create Clinic Beta
    const betaRes = await db.createClinicAccount({
      clinicName: 'Clínica Odonto Beta',
      professionalName: 'Dra. Beatriz Beta',
      cro: '22222',
      uf: 'RJ',
      email: 'beatriz@beta.com.br',
      password: 'Beta@Secret2026',
    });

    expect(betaRes.success).toBe(true);

    // 5. Beta MUST be completely isolated: 0 patients, 0 sales (No Alpha leakage)
    expect(db.getPatients().length).toBe(0);
    expect(db.getSales().length).toBe(0);
    expect(db.getPatients().find(p => p.name === 'Paciente Exclusivo Alpha')).toBeUndefined();

    // 6. Switch back to Alpha: Alpha data remains preserved
    db.loadTenant(alphaRes.session!.clinic.id, false);
    expect(db.getPatients().length).toBe(1);
    expect(db.getPatients()[0].name).toBe('Paciente Exclusivo Alpha');
    expect(db.getSales().length).toBe(1);

    // 7. Demo mode is fully preserved and distinct
    const demoSession = db.loginDemo();
    expect(demoSession.isDemo).toBe(true);
    expect(db.getIsDemoMode()).toBe(true);
    expect(db.getSales().length).toBeGreaterThan(50);
  }, { requirement: 'R10' });

  // Test 5: PBKDF2 Password Hashing & Safe Recovery
  test('R10-AUTH-PBKDF2-SECURITY: Criptografia PBKDF2, Zero Texto Plano e Recuperação Segura', async () => {
    // 1. Password hashing with 100,000 iters and 16-byte random salt
    const salt = generateSalt();
    expect(salt.length).toBe(32); // 16 bytes = 32 hex chars

    const hash1 = await hashPassword('MinhaSenha@2026', salt);
    expect(hash1.length).toBe(64); // SHA-256 = 64 hex chars

    // Matching password verifies correctly
    const match = await verifyPassword('MinhaSenha@2026', hash1, salt);
    expect(match).toBe(true);

    // Wrong password strictly rejected
    const wrongMatch = await verifyPassword('SenhaIncorreta@2026', hash1, salt);
    expect(wrongMatch).toBe(false);

    // 2. Verify all stored users NEVER store plain text
    const users = db.getStoredUsers();
    users.forEach((u) => {
      expect(u.passwordHash).toBeDefined();
      expect(u.passwordHash.length).toBe(64);
      // Plain text passwords must never be stored on the object
      expect((u as any).password).toBeUndefined();
    });

    // 3. Password recovery workflow
    const recoveryUserEmail = 'carlos@mendesodonto.com.br';
    const reqRes = await db.requestPasswordReset(recoveryUserEmail);
    expect(reqRes.success).toBe(true);

    const resetRes = await db.resetPasswordWithToken(recoveryUserEmail, 'token', 'NovaSenha@2026');
    expect(resetRes.success).toBe(true);

    // Verify login with new password succeeds
    const authNew = await db.authenticate(recoveryUserEmail, 'NovaSenha@2026');
    expect(authNew.success).toBe(true);
  }, { requirement: 'R10' });

  // Test 6: Audited Platform Admin Support Session
  test('R10-AUDITED-SUPPORT: Sessão Administrativa de Suporte com Auditoria Completa', async () => {
    // 1. Login as Platform Admin
    const adminAuth = await db.authenticate('suporte@dentalfinance.com.br', 'Admin@2026');
    expect(adminAuth.success).toBe(true);
    expect(adminAuth.session?.user.role).toBe('PLATFORM_ADMIN');

    // 2. Start support session on tenant_demo
    const reason = 'Chamado #4812 - Verificação de consistência fiscal e faturamento';
    const startRes = db.startSupportSession('tenant_demo', reason);
    expect(startRes.success).toBe(true);

    const activeSession = db.getCurrentSession();
    expect(activeSession?.supportSession).toBeDefined();
    expect(activeSession?.supportSession?.isSupportMode).toBe(true);
    expect(activeSession?.supportSession?.reason).toBe(reason);

    // 3. Verify SUPPORT_SESSION_START audit log exists
    const logs = db.getAuditLogs();
    const startLog = logs.find(l => l.action === 'SUPPORT_SESSION_START');
    expect(startLog).toBeDefined();
    expect(startLog?.details.includes(reason)).toBe(true);

    // 4. Perform mutation during support mode: audit log must record support identity
    db.addPatient({
      orgId: db.getOrg().id,
      name: 'Paciente Teste Auditado Suporte',
      cpf: '99988877766',
    });

    const updatedLogs = db.getAuditLogs();
    const patientLog = updatedLogs.find(l => l.details.includes('Paciente Teste Auditado Suporte'));
    expect(patientLog).toBeDefined();
    expect(patientLog?.userId.includes('SUPPORT')).toBe(true);

    // 5. End support session
    const endRes = db.endSupportSession();
    expect(endRes.success).toBe(true);
    expect(db.getCurrentSession()?.supportSession).toBeUndefined();

    // Verify exit log
    const finalLogs = db.getAuditLogs();
    const endLog = finalLogs.find(l => l.action === 'SUPPORT_SESSION_END');
    expect(endLog).toBeDefined();
  }, { requirement: 'R10' });
});
