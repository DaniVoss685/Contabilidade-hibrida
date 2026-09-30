// Fase B: PROFISSIONAL ≠ LOGIN. Duas dentistas podem compartilhar o mesmo login da clínica; Agenda,
// Procedimentos, Prontuário e mensagens automáticas precisam saber qual profissional CLÍNICO
// (df_clinical_professionals) realmente atende, independente de quem está autenticado. df_professionals
// (fiscal, 1 por tenant) NUNCA é reutilizado para isso — ver comentário na migration.
// Rodar com: npx tsx tests/functional/multiProfessional.test.ts

import { readFileSync } from 'node:fs';
import {
  isSameProfessional,
  findSchedulingConflict,
  resolveEligibleProfessionals,
  defaultProfessionalId,
} from '../../src/lib/professionalScheduling';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}
const src = (p: string) => readFileSync(p, 'utf-8');

console.log('\n=== PROFISSIONAL ≠ LOGIN: mesmo horário, profissionais diferentes -> sem conflito ===');
{
  const existing = [
    { id: 'apt_1', date: '2026-10-05', status: 'AGENDADA', startTime: '09:00', endTime: '09:45', professionalId: 'clprof_bruna', dentistName: 'Dra. Bruna' },
  ];
  const conflict = findSchedulingConflict(existing, {
    date: '2026-10-05',
    startTime: '09:00',
    endTime: '09:45',
    professionalId: 'clprof_carla',
    dentistName: 'Dra. Carla',
  });
  assert(conflict === null, 'Dra. Bruna e Dra. Carla podem atender no MESMO horário — não é conflito');
}

console.log('\n=== MESMO LOGIN / 2 PROFISSIONAIS: mesmo profissional + mesmo horário -> bloqueado ===');
{
  const existing = [
    { id: 'apt_1', date: '2026-10-05', status: 'AGENDADA', startTime: '09:00', endTime: '09:45', professionalId: 'clprof_bruna', dentistName: 'Dra. Bruna' },
  ];
  const conflict = findSchedulingConflict(existing, {
    date: '2026-10-05',
    startTime: '09:20',
    endTime: '10:00',
    professionalId: 'clprof_bruna',
    dentistName: 'Dra. Bruna',
  });
  assert(conflict !== null && conflict.id === 'apt_1', 'mesma profissional (mesmo professionalId) com horário sobreposto é bloqueado');
}

console.log('\n=== id tem prioridade sobre nome livre legado ===');
{
  // Dois agendamentos legados com o MESMO dentistName (coincidência de texto) mas professionalId
  // diferentes reais -> não são a mesma pessoa; o id (sinal forte) decide, não o texto.
  assert(
    isSameProfessional(
      { professionalId: 'clprof_a', dentistName: 'Dr. João' },
      { professionalId: 'clprof_b', dentistName: 'Dr. João' }
    ) === false,
    'professionalId diferente prevalece sobre dentistName igual (nomes podem coincidir por acaso)'
  );
  assert(
    isSameProfessional({ dentistName: 'Dr. João' }, { dentistName: 'Dr. João' }) === true,
    'sem professionalId em nenhum dos dois, cai para comparação por nome (compatibilidade com agendamentos legados)'
  );
}

console.log('\n=== FINALIZADA/CANCELADA não bloqueia novo agendamento no mesmo horário ===');
{
  const existing = [
    { id: 'apt_1', date: '2026-10-05', status: 'CANCELADA', startTime: '09:00', endTime: '09:45', professionalId: 'clprof_bruna', dentistName: 'Dra. Bruna' },
  ];
  const conflict = findSchedulingConflict(existing, {
    date: '2026-10-05',
    startTime: '09:00',
    endTime: '09:45',
    professionalId: 'clprof_bruna',
    dentistName: 'Dra. Bruna',
  });
  assert(conflict === null, 'consulta CANCELADA nunca bloqueia o mesmo horário para um novo agendamento');
}

console.log('\n=== PROCEDIMENTO RESTRINGE: sem vínculo = todos os ativos; com vínculo = só os listados ===');
{
  const all = [
    { id: 'clprof_bruna', isActive: true },
    { id: 'clprof_carla', isActive: true },
    { id: 'clprof_inactive', isActive: false },
  ];
  const unrestricted = resolveEligibleProfessionals(all, []);
  assert(unrestricted.length === 2 && unrestricted.every((p) => p.isActive), 'procedimento sem nenhum vínculo fica disponível a TODOS os profissionais ativos (nunca aos inativos)');

  const restricted = resolveEligibleProfessionals(all, ['clprof_bruna']);
  assert(restricted.length === 1 && restricted[0].id === 'clprof_bruna', 'procedimento com vínculo só libera os profissionais explicitamente listados');

  const restrictedToInactive = resolveEligibleProfessionals(all, ['clprof_inactive']);
  assert(restrictedToInactive.length === 0, 'vínculo para um profissional que virou inativo não o reativa magicamente na lista');
}

console.log('\n=== Pré-seleção de profissional NUNCA é o usuário logado por padrão ===');
{
  const profs = [
    { id: 'clprof_bruna', userId: 'usr_bruna' },
    { id: 'clprof_carla', userId: 'usr_carla' },
  ];
  // Usuário logado é usr_bruna, mas ela pode estar operando para a Carla (mesmo login da clínica) —
  // como HÁ 2 profissionais e o vínculo userId resolve para Bruna especificamente, o sistema só
  // pré-seleciona quando o vínculo é inequívoco (aqui, é: usr_bruna -> clprof_bruna).
  assert(defaultProfessionalId(profs, 'usr_bruna') === 'clprof_bruna', 'com vínculo userId inequívoco, pré-seleciona a profissional vinculada ao usuário atual');
  // Usuário sem vínculo a NENHUM profissional (ex.: recepcionista) e 2+ profissionais cadastrados -> não adivinha.
  assert(defaultProfessionalId(profs, 'usr_recepcao') === '', 'sem vínculo e com 2+ profissionais, exige escolha explícita (nunca chuta)');
  // Só 1 profissional cadastrado -> pode pré-selecionar mesmo sem vínculo de usuário.
  assert(defaultProfessionalId([{ id: 'clprof_unica', userId: null }], 'usr_qualquer') === 'clprof_unica', 'com exatamente 1 profissional ativa, pré-seleciona mesmo sem vínculo de usuário');
  assert(defaultProfessionalId([], 'usr_qualquer') === '', 'roster vazio -> sem pré-seleção (tela usa o fallback fiscal legado)');
}

console.log('\n=== AGENDA FILTRA: AppointmentsView.tsx tem filtro por profissional que persiste por navegação e reseta/redefault por tenant ===');
{
  const code = src('src/components/Appointments/AppointmentsView.tsx');
  assert(code.includes("useState<string>('ALL')") && code.includes('professionalFilter'), 'estado de filtro de profissional existe, independente do filtro de status');
  assert(
    code.includes("if (professionalFilter !== 'ALL' && apt.professionalId !== professionalFilter) return false;"),
    'filtro aplica sobre TODAS as visões (Dia/Semana/Mês compartilham o mesmo filteredAppointments)'
  );
  assert(
    /useEffect\(\(\) => \{\s*professionalFilterChosenManually\.current = false;\s*setProfessionalFilter\('ALL'\);\s*\}, \[activeTenantId\]\);/.test(code),
    'troca de tenant limpa a escolha manual e não herda a seleção da clínica anterior'
  );
  assert(
    code.includes('defaultProfessionalId(activeProfessionals, db.getUser()?.id)') && code.includes('db.subscribe(load)'),
    'PROF-09: load recalcula o padrão conforme o roster chega pelo subscribe, usando o vínculo userId'
  );
  assert(
    code.includes('if (!professionalFilterChosenManually.current)') && code.includes('professionalFilterChosenManually.current = true;'),
    'recalcula enquanto os dados chegam até o usuário escolher manualmente um filtro'
  );
  assert(
    !code.includes("setStatusFilter('ALL')\n  }, [activeTenantId]") ,
    'sanity: o reset por tenant é específico do filtro de profissional, não reescreveu o de status'
  );
}

console.log('\n=== PROF-09: usuário logado vinculado a um profissional -> Agenda abre por padrão filtrada nele (não em "Todos") ===');
{
  const bruna = { id: 'clprof_bruna', userId: 'usr_bruna', isActive: true };
  const carla = { id: 'clprof_carla', userId: 'usr_carla', isActive: true };
  assert(
    defaultProfessionalId([bruna, carla], 'usr_carla') === 'clprof_carla',
    'Carla loga -> Agenda abre filtrada em "Carla", não em "Todos os profissionais"'
  );
  assert(
    defaultProfessionalId([bruna, carla], 'usr_bruna') === 'clprof_bruna',
    'Bruna loga -> Agenda abre filtrada em "Bruna" (proprietária e também profissional clínica)'
  );
  assert(
    defaultProfessionalId([bruna, carla], 'usr_recepcao') === '',
    'PROF-10: usuário sem vínculo (ex.: recepção) com 2+ profissionais -> cai para "Todos os profissionais" (AppointmentsView mapeia \'\' -> \'ALL\')'
  );
}

console.log('\n=== PROCEDIMENTO RESTRINGE (UI): ProcedureModal grava vínculo, sem gravar quando não ofereceu a opção ===');
{
  const code = src('src/components/Modals/ProcedureModal.tsx');
  assert(
    code.includes('activeProfessionals.length > 0 ? selectedProfessionalIds : undefined'),
    'só envia a lista de profissionais habilitados quando a clínica tem roster (undefined = "não mexe" quando não ofereceu a opção)'
  );
  const viewCode = src('src/components/Procedures/ProceduresView.tsx');
  assert(
    viewCode.includes('eligibleProfessionalIds !== undefined') && viewCode.includes('db.setProcedureProfessionals(savedId, eligibleProfessionalIds)'),
    'o vínculo só é sobrescrito quando a tela realmente ofereceu a seleção (nunca apaga vínculo existente ao salvar de uma clínica sem roster configurado)'
  );
}

console.log('\n=== MENSAGEM USA PROFISSIONAL: {{profissional}} nunca usa o usuário logado ===');
{
  // O contrato já existente (auditado): profissional = appointment.dentistName || appointment.professionalName
  // — como AppointmentModal.tsx agora só grava dentistName/professionalName a partir do roster
  // clínico selecionado (nunca de db.getUser()), o placeholder correto passa a fluir automaticamente,
  // SEM precisar tocar nos 3 pontos de composição (client + 2 edge functions).
  const modalCode = src('src/components/Appointments/AppointmentModal.tsx');
  // db.getUser() É lido (para achar o profissional vinculado a ele via userId — feature legítima),
  // mas o NOME do profissional nunca pode vir diretamente do usuário logado (currentUser.name).
  assert(!modalCode.includes('setDentistName(currentUser') && !modalCode.includes('currentUser.name'), 'o nome do profissional nunca é copiado diretamente do usuário logado — só o id é usado para achar o vínculo (userId) correto');
  assert(
    modalCode.includes('professionalId: selectedProfessionalId || undefined') &&
      modalCode.includes('professionalName: selectedProfessionalId ? dentistName : undefined'),
    'dentistName/professionalName gravados vêm sempre do profissional selecionado no roster, nunca de um default do login'
  );
  const svcCode = src('src/services/dentalWhatsAppService.ts');
  assert(
    svcCode.includes('appointment.dentistName || appointment.professionalName'),
    'contrato de composição da mensagem automática (profissional = dentistName || professionalName) preservado — não precisou mudar'
  );
}

console.log('\n=== PRONTUÁRIO: ClinicalRecordModal para de usar sempre a identidade fiscal única ===');
{
  const code = src('src/components/Patients/Clinical/ClinicalRecordModal.tsx');
  assert(
    code.includes("professionalId: chosenProfessional?.id || professional?.id || 'prof_01'"),
    'novo registro usa a profissional REALMENTE selecionada no roster antes de cair no fallback fiscal legado'
  );
  assert(
    code.includes('clinicalProfessionals.length > 1 && !selectedProfessionalId'),
    'com 2+ profissionais cadastradas, exige seleção explícita antes de salvar (nunca herda a última usada silenciosamente)'
  );
  assert(
    !recordToEditDefaultsToFiscal(code),
    'em EDIÇÃO de um registro existente, o profissional gravado permanece fixo (não é reatribuído à fiscal ao reabrir para editar)'
  );
}
function recordToEditDefaultsToFiscal(code: string): boolean {
  // Verificação estrutural: dentro do branch "if (recordToEdit)" do submit, não deve existir
  // nenhuma referência a "professional?.id" (o fallback fiscal só pertence ao branch de criação).
  const editBlockMatch = code.match(/if \(recordToEdit\) \{[\s\S]*?\n      \} else \{/);
  return !!editBlockMatch && editBlockMatch[0].includes("professional?.id");
}

console.log('\n=== Schema: tabelas novas isoladas por tenant, nunca reaproveitando df_professionals fiscal ===');
{
  const migCore = src('supabase/migrations/20260929140000_clinical_professionals.sql');
  assert(migCore.includes('CREATE TABLE IF NOT EXISTS public.df_clinical_professionals'), 'tabela de profissionais clínicos é NOVA, distinta de df_professionals');
  assert(migCore.includes('is_dental_tenant_member(tenant_id)'), 'RLS isola por tenant (mesmo padrão de df_patient_guardian_links)');
  assert(migCore.includes("user_id TEXT REFERENCES public.df_users(id) ON DELETE SET NULL"), 'vínculo opcional a um login (user_id), nunca obrigatório');

  const migLink = src('supabase/migrations/20260929140100_procedure_professionals.sql');
  assert(
    migLink.includes('PRIMARY KEY (procedure_id, professional_id)') && migLink.includes('ON DELETE CASCADE'),
    'vínculo procedimento<->profissional é N:N com PK composta e cascata (mesmo padrão de df_wa_contact_patients)'
  );
}

console.log('\n=== RBAC: professionals:manage existe e é concedido a quem já gerencia precificação ===');
{
  const code = src('src/lib/permissions.ts');
  assert(code.includes("| 'professionals:manage'"), 'permissão professionals:manage declarada');
  assert(
    (code.match(/'professionals:manage'/g) || []).length >= 3,
    'permissão aparece em ALL_APP_PERMISSIONS, no papel FINANCE e no grupo de exibição (não só declarada e nunca usada)'
  );
}

console.log(`\n${passed} verificações passaram.`);
