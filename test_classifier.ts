/**
 * Teste unitário e determinístico do classificador de intenções do paciente
 */

function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?!"']/g, ' ') // remove pontuações mantendo palavras separadas
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyPatientResponse(text: string): 'AFFIRMATIVE' | 'NEGATIVE' | 'UNKNOWN' {
  const norm = normalizeText(text);
  if (!norm) return 'UNKNOWN';

  // =========================================================================
  // 1. DÚVIDAS, INCERTEZAS E RESPOSTAS INCONCLUSIVAS -> UNKNOWN
  // (Verificado antes de negação genérica para tratar "não sei ainda", etc.)
  // =========================================================================
  const uncertaintyRegex = /\b(talvez|provavelmente|acho que|se der|vou ver|ver se|depois te aviso|depois eu aviso|depois confirmo|vou confirmar|nao sei|ainda nao sei|quem sabe|depende)\b/;
  if (uncertaintyRegex.test(norm)) {
    return 'UNKNOWN';
  }

  // =========================================================================
  // 2. PRIORIDADE MÁXIMA: PADRÕES NEGATIVOS E CONTRADITÓRIOS
  // =========================================================================

  // Negações compostas, adversativas e contradições
  const negativeContradictionRegex = /\b(mas|porem|contudo|so que|entretanto|todavia)\s+(nao|nem)\b/;
  if (negativeContradictionRegex.test(norm)) {
    return 'NEGATIVE';
  }

  // Padrões negativos verbais diretos ("não vou", "não posso", "não consigo", etc.)
  const negativeVerbRegex = /\b(nao|nem)\s+(vou|vou conseguir|posso|consigo|estarei|estou|irei|estaria|pretendo|quero|tenho como|da para ir|vou poder)\b/;
  if (negativeVerbRegex.test(norm)) {
    return 'NEGATIVE';
  }

  // Padrões explícitos de cancelamento / remarcação / recusa
  const explicitNegativeRegex = /\b(pode cancelar|quero cancelar|favor cancelar|preciso cancelar|desejo cancelar|cancela|cancelar|cancelamento|desmarcar|desmarca|desmarque|nao precisa confirmar|infelizmente nao|nao vai dar|nao da|preciso remarcar|quero remarcar|favor remarcar|desejo remarcar|reagendar|remarcar|trocar horario|mudar horario|mudar data)\b/;
  if (explicitNegativeRegex.test(norm)) {
    return 'NEGATIVE';
  }

  // Negação estrita isolada ou início enfático de recusa ("não", "nao obrigado", etc.)
  if (/^nao(\s+.*)?$/.test(norm)) {
    return 'NEGATIVE';
  }

  if (/^(n|nop|nope|nunca|jamais)$/.test(norm)) {
    return 'NEGATIVE';
  }

  // =========================================================================
  // 3. PADRÕES AFIRMATIVOS (INTENÇÃO CLARA)
  // =========================================================================

  // Padrões compostos de confirmação explícita
  const explicitAffirmativePatterns = [
    /\b(pode confirmar|pode deixar confirmado|deixar confirmado|favor confirmar|confirma por favor|confirma ai)\b/,
    /\b(vou sim|eu vou|estarei ai|estarei la|estou confirmad[ao]|pode contar comigo|pode deixar|com certeza|sem duvidas?)\b/,
    /\b(esta confirmad[ao]|ta confirmad[ao]|tudo confirmad[ao]|ja esta confirmad[ao]|ja ta confirmad[ao])\b/,
    /\b(tudo certo|ta certo|ta bom|fechado|combinado|combinadissim[ao]|perfeito|show de bola)\b/,
    /\b(irei sim|irei com certeza|comparecerei)\b/,
    /\b(confirmo sim|confirmad[ao] sim)\b/,
  ];

  for (const pattern of explicitAffirmativePatterns) {
    if (pattern.test(norm)) {
      return 'AFFIRMATIVE';
    }
  }

  // Tokens e verbos afirmativos diretos com word boundary
  const singleTokensAffirmative = [
    /\bconfirmad[ao]\b/,
    /\bconfirmo\b/,
    /\bconfirmar\b/,
    /\bcombinado\b/,
    /\bfechado\b/,
    /\bsim\b/,
    /\bok\b/,
    /\bokay\b/,
    /\bblz\b/,
    /\bbeleza\b/,
    /\bclaro\b/,
    /\bperfeito\b/,
    /\botimo\b/,
    /\bshow\b/,
    /\bcerto\b/,
    /\birei\b/,
    /\bvou\b/,
  ];

  for (const tokenRegex of singleTokensAffirmative) {
    if (tokenRegex.test(norm)) {
      return 'AFFIRMATIVE';
    }
  }

  return 'UNKNOWN';
}

// BATERIA DE TESTES
const testCases: { input: string; expected: 'AFFIRMATIVE' | 'NEGATIVE' | 'UNKNOWN' }[] = [
  // Exigidos pelo usuário como AFFIRMATIVE:
  { input: "vou sim", expected: "AFFIRMATIVE" },
  { input: "eu vou", expected: "AFFIRMATIVE" },
  { input: "pode confirmar", expected: "AFFIRMATIVE" },
  { input: "pode confirmar, eu vou", expected: "AFFIRMATIVE" },
  { input: "Pode confirmar, eu vou!", expected: "AFFIRMATIVE" },
  { input: "confirmado", expected: "AFFIRMATIVE" },
  { input: "sim, estarei aí", expected: "AFFIRMATIVE" },
  { input: "ok, estarei lá", expected: "AFFIRMATIVE" },
  { input: "beleza, pode confirmar", expected: "AFFIRMATIVE" },
  { input: "combinado", expected: "AFFIRMATIVE" },
  { input: "irei sim", expected: "AFFIRMATIVE" },
  { input: "sim!", expected: "AFFIRMATIVE" },
  { input: "vou", expected: "AFFIRMATIVE" },
  { input: "pode deixar confirmado", expected: "AFFIRMATIVE" },
  { input: "pode contar comigo", expected: "AFFIRMATIVE" },
  { input: "está confirmado", expected: "AFFIRMATIVE" },
  { input: "fechado", expected: "AFFIRMATIVE" },
  { input: "tudo certo", expected: "AFFIRMATIVE" },
  { input: "certo", expected: "AFFIRMATIVE" },
  { input: "ok", expected: "AFFIRMATIVE" },
  { input: "okay", expected: "AFFIRMATIVE" },
  { input: "blz", expected: "AFFIRMATIVE" },
  { input: "beleza", expected: "AFFIRMATIVE" },

  // Exigidos pelo usuário como NEGATIVE:
  { input: "não vou", expected: "NEGATIVE" },
  { input: "nao vou", expected: "NEGATIVE" },
  { input: "não consigo ir", expected: "NEGATIVE" },
  { input: "pode cancelar", expected: "NEGATIVE" },
  { input: "preciso remarcar", expected: "NEGATIVE" },
  { input: "não posso amanhã", expected: "NEGATIVE" },
  { input: "não posso", expected: "NEGATIVE" },
  { input: "não consigo", expected: "NEGATIVE" },
  { input: "não estarei", expected: "NEGATIVE" },
  { input: "não precisa confirmar", expected: "NEGATIVE" },
  { input: "quero cancelar", expected: "NEGATIVE" },
  { input: "quero remarcar", expected: "NEGATIVE" },
  { input: "não vou conseguir", expected: "NEGATIVE" },
  { input: "infelizmente não", expected: "NEGATIVE" },
  { input: "sim, mas não vou conseguir", expected: "NEGATIVE" },
  { input: "pode confirmar não, cancela por favor", expected: "NEGATIVE" },

  // Exigidos pelo usuário como UNKNOWN:
  { input: "talvez", expected: "UNKNOWN" },
  { input: "vou ver", expected: "UNKNOWN" },
  { input: "acho que sim", expected: "UNKNOWN" },
  { input: "depois te aviso", expected: "UNKNOWN" },
  { input: "não sei ainda", expected: "UNKNOWN" },
  { input: "se der eu vou", expected: "UNKNOWN" },
  { input: "provavelmente", expected: "UNKNOWN" },
];

let failed = 0;
for (const tc of testCases) {
  const result = classifyPatientResponse(tc.input);
  if (result !== tc.expected) {
    console.error(`FALHA: "${tc.input}" -> esperado: ${tc.expected}, obtido: ${result}`);
    failed++;
  } else {
    console.log(`PASSOU: "${tc.input}" -> ${result}`);
  }
}

if (failed === 0) {
  console.log(`\nTODOS OS ${testCases.length} TESTES PASSARAM COM SUCESSO!`);
} else {
  console.error(`\n${failed} TESTES FALHARAM!`);
  process.exit(1);
}
