import { readFileSync } from 'node:fs';

const code = readFileSync('src/components/UI/PatientSearchSelect.tsx', 'utf8');
let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`❌ ${message}`);
  passed++;
  console.log(`✅ ${message}`);
}

assert((code.match(/<input\b/g) || []).length === 1, 'um único input fica montado continuamente');
assert(code.includes('onFocus={() => {') && code.includes('if (!disabled) setIsOpen(true);'), 'o foco do input abre o popover');
assert(code.includes("isOpen ? 'relative' : 'absolute inset-0 h-full opacity-0 cursor-text'"), 'o input fechado continua disponível para receber o primeiro clique');
assert(code.includes('inputRef.current?.blur();'), 'fechar ou selecionar desfoca o input');
assert(!code.includes('setTimeout('), 'não depende de timeout para obter foco');
assert(!/setIsOpen\(true\);\s*inputRef\.current\?\.focus\(\)/.test(code), 'não tenta focar um input que ainda não foi montado');
assert(code.includes('onClick={() => handleSelect(patient)}'), 'selecionar um resultado continua funcionando');
const whatsappCode = readFileSync('src/components/WhatsApp/WhatsAppContextDrawer.tsx', 'utf8');
assert(/placeholder="Nome, CPF ou telefone\.\.\."[\s\S]{0,180}/.test(whatsappCode) && /<input[\s\S]{0,120}autoFocus/.test(whatsappCode), 'busca de paciente equivalente no WhatsApp recebe foco ao abrir');

console.log(`\n${passed}/8 testes passaram em patientSearchFocus.test.ts`);
