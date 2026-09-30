import { readFileSync } from 'node:fs';
import { defaultProfessionalId } from '../../src/lib/professionalScheduling';

const code = readFileSync('src/components/Appointments/AppointmentsView.tsx', 'utf8');
let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`❌ ${message}`);
  passed++;
  console.log(`✅ ${message}`);
}

assert(code.includes('const professionalFilterChosenManually = useRef(false)'), 'mantém a escolha manual em ref');
const tenantReset = code.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[activeTenantId\]\);/);
assert(Boolean(tenantReset?.[1].includes('professionalFilterChosenManually.current = false')), 'reseta a escolha manual ao trocar de tenant');
assert(code.includes('const unsub = db.subscribe(load)'), 'escuta atualizações do estado do banco');
assert(code.includes('defaultProfessionalId(activeProfessionals, db.getUser()?.id)'), 'resolve o padrão pelo userId/professionalId real');
assert(code.includes('if (!professionalFilterChosenManually.current)'), 'continua recalculando até haver escolha manual');
assert(code.includes('professionalFilterChosenManually.current = true;'), 'preserva o filtro escolhido manualmente');
assert(!code.includes('professionalName ===') && !code.includes('dentistName ==='), 'não usa comparação por nome para definir o profissional');
assert(defaultProfessionalId([{ id: 'p1', userId: 'u1' }, { id: 'p2', userId: 'u2' }], 'u2') === 'p2', 'resolve vínculo pelo ID real do usuário');

console.log(`\n${passed}/8 testes passaram em agendaProfessionalFilter.test.ts`);
