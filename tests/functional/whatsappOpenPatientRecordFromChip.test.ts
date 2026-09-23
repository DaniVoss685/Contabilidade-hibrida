/**
 * SUÍTE DE TESTES FUNCIONAIS: ABRIR FICHA DO PACIENTE A PARTIR DO CHIP (rodada 3)
 *
 * Pedido do usuário: nos chips "Pacientes relacionados" (header do chat e drawer),
 * poder clicar em cada paciente para abrir a ficha completa dele (aba Pacientes),
 * ex. para anexar um documento a um paciente específico sem trocar de tela manualmente.
 *
 * Este teste varre o código-fonte (mesmo padrão usado nas outras suítes de regressão
 * de contrato deste projeto) para garantir que a cadeia de prop `onOpenPatientRecord`/
 * `onNavigateToPatient` está conectada ponta a ponta: App.tsx -> WhatsAppMainView ->
 * WhatsAppChatArea/WhatsAppContextDrawer -> chip clicável.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FALHA NA ASSERÇÃO: ${message}`);
  }
}

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../', relPath), 'utf-8');
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TESTES: ABRIR FICHA DO PACIENTE A PARTIR DO CHIP');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  const test = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      console.log(`  ✅ [PASSOU] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FALHOU] ${name}`);
      console.error(`     Motivo: ${err.message}\n`);
      failed++;
    }
  };

  const appTsx = readSrc('src/App.tsx');
  const mainView = readSrc('src/components/WhatsApp/WhatsAppMainView.tsx');
  const chatArea = readSrc('src/components/WhatsApp/WhatsAppChatArea.tsx');
  const drawer = readSrc('src/components/WhatsApp/WhatsAppContextDrawer.tsx');

  await test('App.tsx passa onNavigateToPatient para WhatsAppMainView, reaproveitando a aba Pacientes existente (initialSelectedPatientId)', () => {
    assert(appTsx.includes('onNavigateToPatient={(patientId)'), 'App.tsx deve definir o handler de navegação');
    assert(appTsx.includes('setSelectedPatientForViewId(patientId)'), 'Deve reaproveitar o estado já existente da aba Pacientes, não criar um novo mecanismo');
    assert(appTsx.includes("setCurrentTab('patients')"), 'Deve trocar para a aba Pacientes');
  });

  await test('WhatsAppMainView recebe onNavigateToPatient e repassa para ChatArea e Drawer', () => {
    assert(mainView.includes('onNavigateToPatient?: (patientId: string) => void'), 'Prop deve existir na interface');
    assert(mainView.includes('onOpenPatientRecord={onNavigateToPatient}'), 'Deve repassar para os componentes filhos');
  });

  await test('WhatsAppChatArea: chip de paciente relacionado tem botão de abrir ficha (ExternalLink)', () => {
    assert(chatArea.includes('onOpenPatientRecord?: (patientId: string) => void'), 'Prop deve existir na interface');
    assert(chatArea.includes('onOpenPatientRecord(p.id)'), 'Deve chamar a função com o id do paciente do chip clicado');
    assert(chatArea.includes('ExternalLink'), 'Deve ter um ícone indicando a ação de abrir');
  });

  await test('WhatsAppChatArea: clique de abrir ficha não deve também disparar a seleção de contexto clínico (stopPropagation)', () => {
    const idx = chatArea.indexOf('onOpenPatientRecord(p.id)');
    const window = chatArea.slice(Math.max(0, idx - 200), idx);
    assert(window.includes('e.stopPropagation()'), 'Deve isolar o clique do botão de abrir do clique de seleção do chip');
  });

  await test('WhatsAppContextDrawer: mesmo padrão de abrir ficha aplicado ao chip do drawer', () => {
    assert(drawer.includes('onOpenPatientRecord?: (patientId: string) => void'), 'Prop deve existir na interface do drawer');
    assert(drawer.includes('onOpenPatientRecord(p.id)'), 'Deve chamar a função com o id do paciente do chip clicado no drawer');
  });

  console.log('\n===============================================================');
  console.log(`RESULTADO: ${passed} PASSOU, ${failed} FALHOU (${passed + failed} total)`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
