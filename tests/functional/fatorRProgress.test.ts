// Barra do Fator R no Dashboard (card Operação Pessoa Jurídica): o valor e a META usam a MESMA régua.
// Antes: preenchimento em escala 0–100 mas rótulos "0% · Meta 28% · 50%+" — com 68,1% parecia que ainda faltava.
// Agora: meta marcada na posição real, check quando já bateu, excedente visível e "faltam N pontos" quando não bateu.
// Rodar com: npx tsx tests/functional/fatorRProgress.test.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describeFatorRProgress, resolveFiscalBase, type CanonicalFiscalBase } from '../../src/lib/fiscalBase';
import { DEFAULT_TAX_RULES_SIMPLES, isFatorRAtOrAboveThreshold } from '../../src/lib/taxEngine';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

function base(rbt12: number, fs12: number): CanonicalFiscalBase {
  return resolveFiscalBase({
    todayStr: '2026-09-25',
    professional: { fiscalSourceType: 'MANUAL_TOTAL', baselineConfigured: true, rbt12Inicial: rbt12, folha12MesesInicial: fs12, initialFiscalHistory: undefined },
    contabilex: { loaded: true, linkStatus: null, snapshots: [] },
    taxRules: DEFAULT_TAX_RULES_SIMPLES[2026],
    year: 2026,
  });
}

// ---------------------------------------------------------------- caso real: Odonto Minas (68,1%)
console.log('\n— Já passou da meta (Odonto Minas, 68,1%)');
const om = describeFatorRProgress(base(15226.4, 10372.89));
assert(om.state === 'REACHED' && om.thresholdPercent === 28, 'estado: meta ATINGIDA (28%)');
assert(near(om.percent!, 68.12, 0.05) && om.diffPoints === 40.1, `passou 40,1 pontos da meta (obtido ${om.diffPoints})`);
assert(om.scaleMax === 70, 'a escala vai até 70% (o valor cabe na barra — não fica "0 a 50%+" com o valor estourando)');
assert(near(om.markerPercent, 40, 0.01), 'o marcador da meta fica em 28/70 = 40% da barra (não no meio)');
assert(near(om.fillPercent, (68.12 / 70) * 100, 0.1), 'o preenchimento acompanha o valor na MESMA régua (~97% da barra)');
assert(om.fillPercent > om.markerPercent, 'o preenchimento passa do marcador da meta — visualmente "já passamos"');
assert(om.missingPayroll === null && !om.atLimit, 'nada falta e não é "no limite"');

// ---------------------------------------------------------------- ainda abaixo
console.log('\n— Ainda abaixo da meta');
const low = describeFatorRProgress(base(100000, 20000));
assert(low.state === 'BELOW' && low.percent === 20 && low.diffPoints === 8, 'Fator R 20%: abaixo da meta, faltam 8,0 pontos');
assert(low.scaleMax === 50 && near(low.markerPercent, 56) && near(low.fillPercent, 40), 'escala 0–50: o marcador da meta (56%) fica ADIANTE do preenchimento (40%) — a barrinha vai até a meta');
assert(low.fillPercent < low.markerPercent, 'preenchimento ainda não chegou ao marcador');
assert(low.missingPayroll === 8000, 'faltam R$ 8.000,00 de folha (28% de R$ 100.000 = R$ 28.000 − R$ 20.000)');

// a folha que falta é exata: com ela bate a meta, com 1 centavo a menos não
const b = base(15226.4, 3000);
const gap = describeFatorRProgress(b);
assert(gap.state === 'BELOW' && gap.missingPayroll === 1263.4, `folha que falta = R$ 1.263,40 (0,28 × 15.226,40 = 4.263,392 → 4.263,40 − 3.000) (obtido ${gap.missingPayroll})`);
assert(isFatorRAtOrAboveThreshold(3000 + gap.missingPayroll!, 15226.4) && !isFatorRAtOrAboveThreshold(3000 + gap.missingPayroll! - 0.01, 15226.4), 'com essa folha o Fator R bate 28% e com 1 centavo a menos ainda não bate');

// ---------------------------------------------------------------- limiar
console.log('\n— Limiar 28%');
const at = describeFatorRProgress(base(10000, 2800));
assert(at.state === 'REACHED' && at.atLimit && at.diffPoints === 0, '28,00% exato: atingiu, "exatamente na meta"');
assert(at.scaleMax === 50 && near(at.markerPercent, at.fillPercent, 0.0001), '28,00%: o preenchimento termina exatamente no marcador');
const just = describeFatorRProgress(base(10000, 2799));
assert(just.state === 'BELOW' && just.diffPoints === 0 && just.missingPayroll === 1, '27,99%: ainda abaixo (falta R$ 1,00) — não vira "atingida" por arredondamento');
const above = describeFatorRProgress(base(10000, 2801));
assert(above.state === 'REACHED' && !above.atLimit === (above.diffPoints >= 0.05), '28,01%: atingida');

// ---------------------------------------------------------------- escala
console.log('\n— Escala e coerência valor × meta');
const huge = describeFatorRProgress(base(10000, 15000));
assert(huge.percent === 150 && huge.scaleMax === 100 && huge.fillPercent === 100 && near(huge.markerPercent, 28, 1e-9), 'Fator R > 100%: escala limitada a 100 e barra cheia (sem estourar o layout)');
let inconsistent = 0;
for (let pct = 0; pct <= 130; pct += 0.5) {
  const p = describeFatorRProgress(base(10000, Math.round(pct * 100)));
  const reachedByRule = isFatorRAtOrAboveThreshold(Math.round(pct * 100), 10000);
  if ((p.state === 'REACHED') !== reachedByRule) inconsistent++;
  if (p.state === 'REACHED' && p.fillPercent < p.markerPercent - 1e-9) inconsistent++;
  if (p.state === 'BELOW' && p.fillPercent >= p.markerPercent) inconsistent++;
  if (p.scaleMax < 50 || p.scaleMax > 100 || p.scaleMax % 10 !== 0) inconsistent++;
  if (p.percent !== null && p.percent <= p.scaleMax && p.fillPercent > 100) inconsistent++;
}
assert(inconsistent === 0, '261 valores de 0% a 130%: BATEU ⇔ o preenchimento alcança o marcador da meta (uma régua só), escala sempre 50–100 em múltiplos de 10');

// ---------------------------------------------------------------- sem base
console.log('\n— Sem base fiscal');
for (const [label, b0] of [
  ['carregando', resolveFiscalBase({ todayStr: '2026-09-25', professional: { fiscalSourceType: 'CONTABILEX', baselineConfigured: true, rbt12Inicial: 0, folha12MesesInicial: 0 }, contabilex: { loaded: false, linkStatus: null, snapshots: [] } })],
  ['não configurada', resolveFiscalBase({ todayStr: '2026-09-25', professional: { fiscalSourceType: 'MANUAL_TOTAL', baselineConfigured: false, rbt12Inicial: 0, folha12MesesInicial: 0 }, contabilex: { loaded: true, linkStatus: null, snapshots: [] } })],
] as Array<[string, CanonicalFiscalBase]>) {
  const u = describeFatorRProgress(b0);
  assert(u.state === 'UNAVAILABLE' && u.percent === null && u.fillPercent === 0 && u.missingPayroll === null, `${label}: barra vazia, sem "atingida" nem "faltam" inventados`);
  assert(u.markerPercent > 0 && Number.isFinite(u.markerPercent), `${label}: a meta continua marcada na régua (sem NaN)`);
}

// ---------------------------------------------------------------- tela (estático)
console.log('\n— Componente e Dashboard');
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const comp = strip(read('src/components/Dashboard/FatorRProgress.tsx'));
const dash = strip(read('src/components/Dashboard/DashboardView.tsx'));
assert(/<FatorRProgress/.test(dash) && !/Meta: 28\.0% \(Anexo III\)/.test(dash) && !/>50%\+</.test(dash), 'o Dashboard usa o novo componente; a régua antiga "0% · Meta: 28.0% · 50%+" saiu');
assert((dash.match(/Operação Pessoa Jurídica/g) || []).length === 1, 'o card PJ aparece uma única vez (sem duplicação)');
assert(/role="progressbar"/.test(comp) && /aria-valuetext=\{ariaText\}/.test(comp) && /aria-valuemax=\{p\.scaleMax\}/.test(comp), 'barra acessível: role=progressbar com valor e texto anunciados');
assert(/reached \? <Check/.test(comp) && /<Target/.test(comp) && /Meta atingida/.test(comp) && /pontos acima de/.test(comp), 'atingiu: check no marcador + "Meta atingida: N pontos acima de 28%"');
assert(/Faltam \{points\(p\.diffPoints\)\} pontos/.test(comp) && /a mais de folha \(FS12\)/.test(comp), 'não atingiu: "Faltam N pontos" e quanto falta de folha');
assert(/Falta menos de 0,1 ponto/.test(comp), 'não atingiu por menos de 0,1 ponto: "Falta menos de 0,1 ponto" (nunca "Faltam 0,0 pontos")');
assert(/pj-factor-r-excess/.test(comp) && /left: `\$\{p\.markerPercent\}%`/.test(comp), 'o trecho que passou da meta é destacado a partir do marcador');
assert(/data-testid="pj-factor-r-value"/.test(comp) && /data-testid="pj-factor-r-badge"/.test(comp) && /data-testid="pj-base-note"/.test(dash), 'ids de teste preservados (valor, selo, nota da base)');

console.log(`\n${passed} verificações passaram.`);
