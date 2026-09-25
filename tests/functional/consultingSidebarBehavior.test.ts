// Barra lateral do Modo Consultoria: recolhimento automático (~5 s, mesma regra da barra da clínica), gaveta no
// mobile/tablet com botão de menu no cabeçalho e topo sem quebrar as letras do nome.
// O timer é testado por um controlador puro com relógio simulado (sem React nem espera real).
// Rodar com: npx tsx tests/functional/consultingSidebarBehavior.test.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SIDEBAR_AUTO_COLLAPSE_MS, createAutoCollapseController, type AutoCollapseScheduler } from '../../src/lib/sidebarAutoCollapse';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}

// relógio simulado
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const scheduler: AutoCollapseScheduler = {
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (h) => {
      timers.delete(h as number);
    },
  };
  return {
    scheduler,
    pending: () => timers.size,
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
      }
      now = target;
    },
  };
}

function setup() {
  const clock = fakeClock();
  const events: string[] = [];
  const ctrl = createAutoCollapseController({
    scheduler: clock.scheduler,
    onCollapse: () => events.push('collapse'),
    onManualToggle: (next) => events.push(`manual:${next}`),
  });
  return { clock, events, ctrl };
}

console.log('\n— Recolhimento automático (5 s)');
assert(SIDEBAR_AUTO_COLLAPSE_MS === 5000, 'o atraso é de 5 segundos (o mesmo da barra da clínica)');

{
  const { clock, events, ctrl } = setup();
  ctrl.sync({ enabled: true, isCollapsed: false });
  clock.advance(4999);
  assert(events.length === 0, 'aos 4,999 s ainda NÃO recolheu');
  clock.advance(1);
  assert(events.join() === 'collapse', 'aos 5 s recolhe sozinha');
  clock.advance(60000);
  assert(events.length === 1, 'recolhe uma única vez (sem repetir)');
}
{
  const { clock, events, ctrl } = setup();
  ctrl.sync({ enabled: true, isCollapsed: false });
  clock.advance(3000);
  ctrl.mouseEnter();
  clock.advance(60000);
  assert(events.length === 0 && clock.pending() === 0, 'mouse em cima da barra PAUSA a contagem (nunca recolhe embaixo do cursor)');
  ctrl.mouseLeave();
  clock.advance(4999);
  assert(events.length === 0, 'ao sair, a contagem recomeça do zero (4,999 s ainda não recolhe)');
  clock.advance(1);
  assert(events.join() === 'collapse', 'e recolhe 5 s depois de o mouse sair');
}
{
  const { clock, events, ctrl } = setup();
  ctrl.sync({ enabled: true, isCollapsed: false });
  clock.advance(2000);
  ctrl.manualToggle(false);
  assert(events.join() === 'manual:false' && ctrl.hasUserInteracted, 'clique manual: repassa a escolha e marca que o usuário interagiu');
  clock.advance(60000);
  assert(events.join() === 'manual:false', 'depois de um clique manual a barra NÃO recolhe mais sozinha (respeita o usuário)');
  ctrl.mouseLeave();
  ctrl.sync({ enabled: true, isCollapsed: false });
  clock.advance(60000);
  assert(events.length === 1, 'nem ao sair com o mouse nem ao re-sincronizar');
}
{
  const { clock, events, ctrl } = setup();
  ctrl.sync({ enabled: false, isCollapsed: false }); // mobile: gaveta
  clock.advance(60000);
  assert(events.length === 0 && clock.pending() === 0, 'mobile/tablet (gaveta): o recolhimento automático não roda');
  ctrl.sync({ enabled: true, isCollapsed: false }); // girou o aparelho / redimensionou para desktop
  clock.advance(5000);
  assert(events.join() === 'collapse', 'ao virar desktop, passa a valer');
}
{
  const { clock, events, ctrl } = setup();
  ctrl.sync({ enabled: true, isCollapsed: true });
  clock.advance(60000);
  assert(events.length === 0 && clock.pending() === 0, 'já recolhida: nada a agendar');
  ctrl.sync({ enabled: true, isCollapsed: false }); // usuário expandiu por outro caminho
  clock.advance(5000);
  assert(events.join() === 'collapse', 'expandida de novo sem interação manual registrada: recolhe após 5 s');
}
{
  const { clock, events, ctrl } = setup();
  ctrl.sync({ enabled: true, isCollapsed: false });
  ctrl.dispose();
  clock.advance(60000);
  assert(events.length === 0 && clock.pending() === 0, 'desmontar a barra cancela o timer (sem vazamento)');
}
{
  const { clock, events, ctrl } = setup();
  ctrl.sync({ enabled: true, isCollapsed: false });
  clock.advance(1000);
  ctrl.sync({ enabled: true, isCollapsed: false });
  clock.advance(4999);
  assert(events.length === 0, 're-sincronizar reinicia a contagem (nunca dispara duas vezes)');
  clock.advance(1);
  assert(events.length === 1, 'e recolhe uma vez');
}

// ---------------------------------------------------------------- estrutura (estático)
console.log('\n— Barra da consultoria, cabeçalho e ligação no App');
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const sidebar = strip(read('src/components/Consulting/ConsultingSidebar.tsx'));
const header = strip(read('src/components/Consulting/ConsultingHeader.tsx'));
const app = strip(read('src/App.tsx'));
const hook = strip(read('src/hooks/useSidebarAutoCollapse.ts'));

assert(/useSidebarAutoCollapse\(\{[\s\S]*enabled: isDesktop/.test(sidebar) && /createAutoCollapseController/.test(hook), 'a barra da consultoria usa o recolhimento automático compartilhado, só no desktop');
assert(/onMouseEnter=\{handleMouseEnter\}/.test(sidebar) && /onMouseLeave=\{handleMouseLeave\}/.test(sidebar), 'mouse em cima pausa, ao sair recomeça (handlers no <aside>)');
assert(/handleManualToggle\(!isCollapsed\)/.test(sidebar) && /handleManualToggle\(false\)/.test(sidebar), 'os dois botões de expandir/recolher registram a ação manual');
assert(/const isCollapsed = isCollapsedPref && isDesktop/.test(sidebar), 'no mobile a barra nunca usa o modo compacto de 112px');
assert(/-translate-x-full lg:translate-x-0/.test(sidebar) && /inert=\{!isDesktop && !isOpenMobile\}/.test(sidebar), 'mobile/tablet: a barra fica FORA da tela (e inerte) até abrir — não cobre mais o conteúdo');
assert(/w-\[min\(86vw,300px\)\] lg:w-\[280px\]/.test(sidebar), 'gaveta limitada a 86% da largura do aparelho (300 px no máximo)');
assert(/consulting-sidebar-backdrop/.test(sidebar) && /onClick=\{closeMobile\}/.test(sidebar), 'fundo escurecido fecha a gaveta ao tocar fora');
assert(/e\.key === 'Escape'/.test(sidebar) && /document\.body\.style\.overflow = previousOverflow/.test(sidebar), 'ESC fecha e a rolagem travada é sempre destravada no cleanup');
assert((sidebar.match(/closeMobile\(\);/g) || []).length >= 2, 'escolher um item (compacto ou expandido) fecha a gaveta');
assert(/aria-label="Fechar menu"/.test(sidebar) && /lg:hidden shrink-0 inline-flex items-center justify-center w-11 h-11/.test(sidebar), 'botão de fechar com 44 px de área de toque, só no mobile');
assert(/whitespace-nowrap/.test(sidebar.slice(sidebar.indexOf('<span>Dental</span>') - 260, sidebar.indexOf('<span>Dental</span>'))), 'topo: "Dental Finance" numa linha só (nowrap) — as letras não quebram mais');
const brand = sidebar.slice(sidebar.indexOf('<span>Dental</span>'), sidebar.indexOf('Carteira Contaju'));
assert(/Consultoria/.test(brand) && brand.indexOf('</div>') < brand.indexOf('Consultoria'), 'topo: o crachá "Consultoria" fica na linha de baixo (não ao lado do nome)');
assert(!/>\s*CONSU\s*</.test(sidebar) && /Consultoria/.test(sidebar.slice(sidebar.indexOf('isCollapsed ? ('))), 'modo compacto: crachá com a palavra inteira (não mais "CONSU" truncado)');
assert(/lg:hidden -ml-1 shrink-0 inline-flex items-center justify-center w-11 h-11/.test(header) && /aria-label="Abrir menu"/.test(header) && /onOpenMobileMenu &&/.test(header), 'cabeçalho da consultoria tem o botão de menu (só < lg, 44 px)');
assert(/consulting-header-actions/.test(header) && /flex-wrap w-full sm:w-auto sm:shrink-0 min-w-0 justify-start sm:justify-end/.test(header) && !/gap-2\.5 sm:gap-3 shrink-0 flex-wrap justify-end/.test(header), 'cabeçalho: o bloco de ações (clínica, busca, período, sair) quebra linha no celular em vez de estourar a largura da página (rolagem horizontal)');
assert(/isOpenMobile=\{isConsultingMobileMenuOpen\}/.test(app) && /onCloseMobile=\{\(\) => setIsConsultingMobileMenuOpen\(false\)\}/.test(app) && /onOpenMobileMenu=\{\(\) => setIsConsultingMobileMenuOpen\(true\)\}/.test(app), 'App liga cabeçalho ↔ gaveta pelo mesmo estado');
assert(/isConsultingSidebarCollapsed \? 'lg:pl-\[112px\]' : 'lg:pl-\[280px\]'/.test(app), 'o recuo do conteúdo continua só em telas lg+ (no mobile o conteúdo usa a largura toda)');

console.log(`\n${passed} verificações passaram.`);
