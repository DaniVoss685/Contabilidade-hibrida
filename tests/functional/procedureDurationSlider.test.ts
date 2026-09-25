// Duração do procedimento: slider como controle principal (mesmo componente do design system usado antes nesta
// tela), campo numérico livre e sincronizado, formatação amigável e recálculo de tempo clínico / custo / preço
// sugerido. O modelo continua sendo MINUTOS inteiros — nada é migrado nem reescrito.
// Rodar com: npx tsx tests/functional/procedureDurationSlider.test.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DURATION_SLIDER_MAX,
  DURATION_SLIDER_MIN,
  DURATION_SLIDER_STEP,
  computeProcedureCosts,
  computeSuggestedPrice,
  durationToSliderPosition,
  formatDurationMinutes,
  joinDuration,
  parseDurationMinutes,
  splitDuration,
} from '../../src/lib/procedureCosting';
import { mapAppProcedureToDb, mapDbProcedureToApp } from '../../src/lib/supabaseClient';
import type { DentalProcedure } from '../../src/types';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ---------------------------------------------------------------- faixa e step
console.log('\n— Faixa do slider');
assert(DURATION_SLIDER_MIN === 15 && DURATION_SLIDER_MAX === 240, 'faixa canônica preservada: mínimo 15 min, máximo 240 min (a que o sistema já usava nesta tela)');
assert(DURATION_SLIDER_STEP === 5, 'step de 5 min (o antigo de 15 não permite 20, 35 ou 50)');
for (const v of [15, 20, 35, 45, 50, 60, 75, 105, 120, 240]) {
  assert((v - DURATION_SLIDER_MIN) % DURATION_SLIDER_STEP === 0 && v >= DURATION_SLIDER_MIN && v <= DURATION_SLIDER_MAX, `${v} min é um valor alcançável pelo slider (não é enum de atalhos)`);
}
const previousStepReaches = (v: number) => (v - 15) % 15 === 0;
assert(!previousStepReaches(20) && !previousStepReaches(35) && !previousStepReaches(50), 'com o step antigo (15) os valores 20, 35 e 50 seriam inalcançáveis — daí o step de 5');

// ---------------------------------------------------------------- formatação
console.log('\n— Formatação amigável');
const fmt: Array<[number, string]> = [
  [15, '15 minutos'], [30, '30 minutos'], [45, '45 minutos'], [60, '1 hora'], [75, '1h 15min'],
  [90, '1h 30min'], [105, '1h 45min'], [120, '2 horas'], [135, '2h 15min'], [240, '4 horas'], [1, '1 minuto'],
];
for (const [m, text] of fmt) assert(formatDurationMinutes(m) === text, `${m} min → "${text}"`);
assert(formatDurationMinutes(0) === '—' && formatDurationMinutes(NaN) === '—' && formatDurationMinutes(-5) === '—', 'duração vazia/inválida → "—" (sem NaN)');

// ---------------------------------------------------------------- input ↔ slider
console.log('\n— Sincronização input ↔ slider');
assert(parseDurationMinutes('45') === 45 && parseDurationMinutes('75') === 75 && parseDurationMinutes('35') === 35, 'digitar 45 / 75 / 35 vira minutos inteiros');
assert(parseDurationMinutes('') === 0 && parseDurationMinutes('abc') === 0 && parseDurationMinutes('-3') === 0, 'campo vazio/inválido/negativo → 0 (a validação do envio pede a duração)');
assert(parseDurationMinutes('300') === 300 && parseDurationMinutes(600) === 600, 'o campo numérico NÃO limita à faixa do slider (procedimentos antigos fora da faixa continuam intactos)');
assert(parseDurationMinutes(75.4) === 75, 'valor decimal é arredondado para minutos inteiros');
assert(durationToSliderPosition(45) === 45 && durationToSliderPosition(75) === 75 && durationToSliderPosition(47) === 47, 'digitou → o slider aponta exatamente para o valor');
assert(durationToSliderPosition(10) === 15 && durationToSliderPosition(300) === 240 && durationToSliderPosition(0) === 15, 'valor fora da faixa: o slider só é limitado VISUALMENTE (o valor real segue no campo)');
// slider → campos: o slider entrega o número e o mesmo estado alimenta os campos (verificado no código abaixo)

// ---------------------------------------------------------------- campo em HORAS + MINUTOS (nunca minutos brutos)
console.log('\n— Campo em horas e minutos');
const parts: Array<[number, number, number]> = [[45, 0, 45], [60, 1, 0], [70, 1, 10], [80, 1, 20], [110, 1, 50], [120, 2, 0], [75, 1, 15], [240, 4, 0]];
for (const [total, h, m] of parts) {
  const sp = splitDuration(total);
  assert(sp.hours === h && sp.minutes === m, `${total} min → campos ${h} h ${m} min (o usuário nunca vê "${total} minutos" como número)`);
  assert(joinDuration(h, m) === total, `${h} h ${m} min → ${total} min internos (ida e volta sem perda)`);
}
assert(joinDuration('1', '10') === 70 && joinDuration('1', '20') === 80, 'digitar "1 hora e 10" / "1 hora e 20" resulta em 70 / 80 min internos');
assert(joinDuration('', '') === 0 && joinDuration('abc', '-5') === 0, 'campos vazios/inválidos → 0 (sem NaN)');
assert(joinDuration('0', '75') === 59 && joinDuration('2', '90') === 2 * 60 + 59, 'minutos ficam em 0–59 (75 não vira "75 minutos": é limitado a 59)');
assert(joinDuration('99', '0') === 24 * 60, 'horas limitadas a 24');
assert(splitDuration(0).hours === 0 && splitDuration(NaN).minutes === 0 && splitDuration(-3).hours === 0, 'split de valor vazio/inválido é 0 h 0 min');
assert(splitDuration(300).hours === 5 && splitDuration(300).minutes === 0, 'duração antiga fora da faixa do slider (300 min) aparece como 5 h 0 min, sem ser alterada'); 

// ---------------------------------------------------------------- recálculo
console.log('\n— Recálculo de tempo clínico, custo e preço sugerido');
const calc = (min: number, extra: Partial<Parameters<typeof computeProcedureCosts>[0]> = {}) =>
  computeProcedureCosts({ durationMinutes: min, clinicalHourRate: 220, inputs: [], ...extra });
assert(calc(45).professionalCost === 165 && calc(45).totalDirectCost === 165, '45 min × R$ 220/h → tempo clínico e custo R$ 165,00');
assert(calc(60).professionalCost === 220 && calc(60).totalDirectCost === 220, '60 min → R$ 220,00 (antes de insumos e outros custos)');
assert(calc(75).professionalCost === 275 && calc(75).totalDirectCost === 275, '75 min → R$ 275,00');
assert(calc(15).professionalCost === 55 && calc(120).professionalCost === 440, '15 min → R$ 55,00 · 120 min → R$ 440,00');
assert(computeSuggestedPrice(calc(45).totalDirectCost, 65) === 471.43, 'preço sugerido a 45 min (65%) = R$ 471,43');
assert(computeSuggestedPrice(calc(60).totalDirectCost, 65) === 628.57, 'preço sugerido a 60 min = R$ 628,57 (recalculado)');
assert(computeSuggestedPrice(calc(75).totalDirectCost, 65) === 785.71, 'preço sugerido a 75 min = R$ 785,71 (recalculado)');
const withOthers = calc(60, { labCost: 100, otherDirectCosts: 30, inputs: [{ quantity: 2, unitCost: 0.2799 }] });
assert(withOthers.labCost === 100 && withOthers.otherDirectCosts === 30 && withOthers.inputsCost === 0.56 && withOthers.totalDirectCost === 350.56, 'a duração só mexe no tempo clínico: insumos, laboratório e outros custos ficam exatamente iguais');
assert(JSON.stringify({ ...calc(75), professionalCost: 0, totalDirectCost: 0 }) === JSON.stringify({ ...calc(45), professionalCost: 0, totalDirectCost: 0 }), 'fórmula de custo inalterada: só professionalCost/total dependem da duração');
const custom = computeProcedureCosts({ durationMinutes: 60, clinicalHourRate: 300, structureCostPerHour: 50, inputs: [] });
assert(custom.professionalCost === 300 && custom.structureCost === 50, 'a duração também escala o custo/hora da estrutura (parâmetros da clínica)');

// ---------------------------------------------------------------- edição / dados existentes
console.log('\n— Edição e dados existentes');
const saved75: DentalProcedure = { id: 'p', code: 'P', name: 'X', category: 'DENTISTICA', clinicalDurationMinutes: 75, professionalHourlyRate: 220, inputs: [], labCost: 0, defaultPrice: 500, active: true } as DentalProcedure;
const roundTrip = mapDbProcedureToApp(JSON.parse(JSON.stringify(mapAppProcedureToDb(saved75, 'clinic_x'))));
assert(roundTrip.clinicalDurationMinutes === 75, 'procedimento salvo com 75 min volta com 75 (o slider e o campo abrem em 75)');
assert(formatDurationMinutes(roundTrip.clinicalDurationMinutes) === '1h 15min' && durationToSliderPosition(roundTrip.clinicalDurationMinutes) === 75, 'edição: campo 75 · slider 75 · rótulo "1h 15min"');
assert(mapAppProcedureToDb(saved75, 'c').clinical_duration_minutes === 75 && mapDbProcedureToApp({ id: 'a', name: 'A', category: 'X', clinical_duration_minutes: 50, default_price: 10 }).clinicalDurationMinutes === 50, 'o modelo continua em minutos inteiros (coluna clinical_duration_minutes), inclusive valores como 50');
assert(mapDbProcedureToApp({ id: 'a', name: 'A', category: 'X', clinical_duration_minutes: 300, default_price: 10 }).clinicalDurationMinutes === 300, 'duração antiga fora da faixa (300) não é alterada ao carregar');

// ---------------------------------------------------------------- estrutura da tela (estático)
console.log('\n— Formulário e componente');
const modal = strip(read('src/components/Modals/ProcedureModal.tsx'));
const slider = strip(read('src/components/UI/Slider.tsx'));
const sectionStart = modal.indexOf('data-testid="proc-duration-section"');
const sectionEnd = modal.indexOf('3. Insumos utilizados', sectionStart);
const section = modal.slice(sectionStart, sectionEnd);
assert(/import \{[^}]*\bSlider\b[^}]*\} from '\.\.\/UI'/.test(modal), 'reaproveita o Slider do design system (sem implementação paralela)');
assert(/<Slider[\s\S]*min=\{DURATION_SLIDER_MIN\}[\s\S]*max=\{DURATION_SLIDER_MAX\}[\s\S]*step=\{DURATION_SLIDER_STEP\}/.test(section), 'o slider usa a faixa/step canônicos (constantes de procedureCosting)');
assert(/onChange=\{setClinicalDurationMinutes\}/.test(section) && /setClinicalDurationMinutes\(joinDuration\(e\.target\.value, durationParts\.minutes\)\)/.test(section) && /setClinicalDurationMinutes\(joinDuration\(durationParts\.hours, e\.target\.value\)\)/.test(section), 'slider e campos de horas/minutos escrevem no MESMO estado (sincronizados nos dois sentidos)');
assert(/value=\{durationToSliderPosition\(clinicalDurationMinutes\)\}/.test(section) && /value=\{durationParts\.hours\}/.test(section) && /value=\{durationParts\.minutes\}/.test(section) && /const durationParts = splitDuration\(clinicalDurationMinutes\)/.test(modal), 'os campos e o slider lêem o mesmo estado (edição abre exatamente na duração salva)');
assert(!/>\s*minutos\s*</.test(section) && !/data-testid="proc-duration"/.test(section), 'não existe mais campo de "minutos" brutos: só horas (h) e minutos (min) da hora');
assert(/data-testid="proc-duration-hours"/.test(section) && /data-testid="proc-duration-minutes"/.test(section) && />\s*h\s*</.test(section) && />\s*min\s*</.test(section), 'campos "[ 1 ] h  [ 10 ] min"');
assert(!/DURATION_PRESETS/.test(modal) && !/\{m < 60 \? `\$\{m\} min`/.test(modal), 'a fileira grande de botões de duração foi removida');
assert((section.match(/<button/g) || []).length === 0, 'a seção de duração não tem botões: os atalhos são só as marcas discretas do slider (15m · 1h · 2h · 4h)');
assert(/marks=\{\[/.test(section) && /label: '15m'/.test(section) && /label: '4h'/.test(section), 'atalhos secundários: marcas discretas do próprio slider (movem o slider e atualizam o campo)');
assert(/formatDurationMinutes\(clinicalDurationMinutes\)/.test(section) && /data-testid="proc-duration-label"/.test(section), 'rótulo amigável ao lado do título e acima do slider');
assert(/role="group" aria-labelledby="proc-duration-title"/.test(section) && /aria-label="Horas"/.test(section) && /aria-label="Minutos"/.test(section) && /inputMode="numeric"/.test(section), 'campos com grupo rotulado e aria-label (Horas/Minutos) e teclado numérico no mobile');
assert(/ariaLabel="Duração do procedimento em minutos"/.test(section) && /ariaValueText=\{formatDurationMinutes\(clinicalDurationMinutes\)\}/.test(section), 'a11y: nome acessível e valor atual anunciado ("1h 15min")');
assert(/comfortable/.test(section), 'mobile: variante de toque confortável do slider');
assert(/canViewCosts &&[\s\S]*proc-duration-cost/.test(section) && /Tempo clínico:/.test(section), 'quem vê custos enxerga "Tempo clínico: 45 minutos × R$ 220/h = R$ 165,00" já na seção (recepção não)');
// Slider compartilhado: nativo, teclado, sem dependência de hover, sem quebrar quem já usa
assert(/type="range"/.test(slider) && /aria-valuetext=\{ariaValueText\}/.test(slider) && /aria-label=\{ariaLabel \|\| label \|\| 'Slider'\}/.test(slider), 'Slider usa <input type="range"> nativo (setas do teclado) com aria-label e aria-valuetext');
assert(/touchAction: 'pan-y'/.test(slider) && /py-\[18px\]/.test(slider) && /w-6 h-6/.test(slider), 'toque: área vertical de ~44px, polegar de 24px e rolagem vertical preservada');
assert(/peer-focus-visible:ring-4/.test(slider), 'foco de teclado visível no polegar');
assert(/comfortable = false/.test(slider) && /'py-2'/.test(slider) && /'w-4\.5 h-4\.5'/.test(slider), 'padrão histórico do Slider preservado (compacto) — nenhuma outra tela muda de tamanho');
// escopo
assert(/computeProcedureCosts\(\{[\s\S]*durationMinutes: clinicalDurationMinutes,/.test(modal), 'o cálculo de custo continua alimentado por clinicalDurationMinutes (mesma fórmula)');

console.log(`\n${passed} verificações passaram.`);
