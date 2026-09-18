// Masking and Formatting utilities for Brazilian Dental Finance

export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value) || !isFinite(value)) {
    return 'R$ 0,00';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | undefined | null, decimals = 1, fallback = '—'): string {
  if (value === undefined || value === null || isNaN(value) || !isFinite(value)) {
    return fallback;
  }
  return `${value.toFixed(decimals).replace('.', ',')}%`;
}

export function formatCpf(cpf: string, masked = false): string {
  if (!cpf) return '';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf;
  
  if (masked) {
    return `${clean.slice(0, 3)}.***.***-${clean.slice(9, 11)}`;
  }
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

export function formatCnpj(cnpj: string): string {
  if (!cnpj) return '';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return cnpj;
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
}

export function formatPhone(phone: string | undefined | null): string {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }
  return phone;
}

export function formatCpfOrCnpj(doc: string, masked = false): string {
  const clean = (doc || '').replace(/\D/g, '');
  if (clean.length === 11) return formatCpf(clean, masked);
  if (clean.length === 14) return formatCnpj(clean);
  return doc || '';
}

export function cleanCpfCnpj(value: string = ''): string {
  return (value || '').replace(/\D/g, '');
}

export function formatDateBr(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  // Handles YYYY-MM-DD or ISO string
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Converte data ISO ou YYYY-MM-DD em formato brasileiro DD/MM/AAAA.
 * Nunca retorna formato ISO ao usuário final.
 */
export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const clean = dateStr.split('T')[0].trim();
  const parts = clean.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year.length === 4) {
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }
  }
  return formatDateBr(dateStr);
}

export function formatMonthYearBr(monthStr: string): string {
  // input: "2025-05" -> "Maio de 2025"
  return formatMonthYear(monthStr);
}

/**
 * Converte competência YYYY-MM em formato extenso (ex: "Setembro de 2026").
 * Utilizado em títulos, cabeçalhos, seletores e cards executivos.
 */
export function formatMonthYear(monthStr: string | undefined | null): string {
  if (!monthStr) return '';
  const clean = monthStr.trim();
  const parts = clean.split('-');
  if (parts.length < 2) return clean;
  const [year, month] = parts;
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const idx = parseInt(month, 10) - 1;
  const name = monthNames[idx] || month;
  return `${name} de ${year}`;
}

/**
 * Converte competência YYYY-MM em formato compacto MM/AAAA com dois dígitos (ex: "09/2026").
 * Utilizado na janela móvel de 12 meses e em tabelas compactas.
 * NUNCA exibe "2026-09" ou "9-2026".
 */
export function formatMonthYearShort(monthStr: string | undefined | null): string {
  if (!monthStr) return '';
  const clean = monthStr.trim();
  const parts = clean.split('-');
  if (parts.length < 2) return clean;
  const [year, month] = parts;
  const paddedMonth = month.padStart(2, '0');
  return `${paddedMonth}/${year}`;
}

export function parseBrlInput(str: string): number {
  if (!str) return 0;
  const clean = str.replace(/[R$\s.]/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) || !isFinite(num) ? 0 : num;
}

export function normalizeSearchText(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchDocumentSearch(doc: string | undefined | null, searchInput: string): boolean {
  if (!doc) return false;
  const cleanSearchDigits = searchInput.replace(/\D/g, '');
  if (cleanSearchDigits.length < 3) return false;
  const cleanDoc = doc.replace(/\D/g, '');
  return cleanDoc.includes(cleanSearchDigits);
}

export function matchSearch(query: string, ...targets: (string | undefined | null)[]): boolean {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) return true;
  return targets.some((target) => normalizeSearchText(target).includes(normQuery));
}

/**
 * Validação algorítmica canônica de CPF (Receita Federal do Brasil)
 * Rejeita tamanhos inválidos, sequências de dígitos iguais e valida os dois dígitos verificadores.
 */
export function isValidCpf(cpf: string | undefined | null): boolean {
  if (!cpf) return false;
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;

  // Rejeita sequências de dígitos idênticos conhecidas (000... a 999...)
  if (/^(\d)\1{10}$/.test(clean)) return false;

  // Primeiro dígito verificador
  let sum1 = 0;
  for (let i = 0; i < 9; i++) {
    sum1 += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let rem1 = (sum1 * 10) % 11;
  if (rem1 === 10 || rem1 === 11) rem1 = 0;
  if (rem1 !== parseInt(clean.charAt(9), 10)) return false;

  // Segundo dígito verificador
  let sum2 = 0;
  for (let i = 0; i < 10; i++) {
    sum2 += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  let rem2 = (sum2 * 10) % 11;
  if (rem2 === 10 || rem2 === 11) rem2 = 0;
  if (rem2 !== parseInt(clean.charAt(10), 10)) return false;

  return true;
}

/**
 * Validação simplificada e segura de e-mail
 */
export function isValidEmail(email: string | undefined | null): boolean {
  if (!email || !email.trim()) return true; // se opcional e vazio, é considerado válido
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validação algorítmica de CNPJ (Receita Federal do Brasil)
 */
export function isValidCnpj(cnpj: string | undefined | null): boolean {
  if (!cnpj) return false;
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return false;

  // Rejeita sequências de dígitos idênticos conhecidas
  if (/^(\d)\1{13}$/.test(clean)) return false;

  // Primeiro dígito verificador
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum1 = 0;
  for (let i = 0; i < 12; i++) {
    sum1 += parseInt(clean.charAt(i), 10) * weights1[i];
  }
  let rem1 = sum1 % 11;
  const digit1 = rem1 < 2 ? 0 : 11 - rem1;
  if (digit1 !== parseInt(clean.charAt(12), 10)) return false;

  // Segundo dígito verificador
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum2 = 0;
  for (let i = 0; i < 13; i++) {
    sum2 += parseInt(clean.charAt(i), 10) * weights2[i];
  }
  let rem2 = sum2 % 11;
  const digit2 = rem2 < 2 ? 0 : 11 - rem2;
  if (digit2 !== parseInt(clean.charAt(13), 10)) return false;

  return true;
}

/**
 * Máscara dinâmica durante a digitação de CPF (###.###.###-##)
 */
export function maskCpfInput(value: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Máscara dinâmica durante a digitação de CNPJ (##.###.###/####-##)
 */
export function maskCnpjInput(value: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

/**
 * Máscara dinâmica durante a digitação de Telefone/WhatsApp brasileiro
 * Suporta fixo: (XX) XXXX-XXXX (10 dígitos) e celular: (XX) XXXXX-XXXX (11 dígitos)
 * Trata colagem com prefixo DDI 55
 */
export function maskPhoneInput(value: string): string {
  if (!value) return '';
  let digits = value.replace(/\D/g, '');

  // Se o usuário colou com 55 na frente (ex: 5534999999999)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.substring(2);
  }

  digits = digits.slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Validação de telefone brasileiro (DDD de 2 dígitos + 8 ou 9 dígitos locais)
 */
export function isValidPhone(phone: string | undefined | null): boolean {
  if (!phone) return false;
  let clean = phone.replace(/\D/g, '');
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    clean = clean.substring(2);
  }
  if (clean.length < 10 || clean.length > 11) return false;

  // DDD válido no Brasil (de 11 a 99)
  const ddd = parseInt(clean.substring(0, 2), 10);
  if (ddd < 11 || ddd > 99) return false;

  return true;
}

/**
 * Retorna a data civil de hoje no formato YYYY-MM-DD
 */
export function getTodayCivilDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Valida se uma string é uma data civil válida no formato YYYY-MM-DD
 */
export function isValidCivilDate(dateStr: string | undefined | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return false;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;

  return true;
}

/**
 * Verifica se a data civil informada (YYYY-MM-DD) é estritamente futura em relação a hoje
 */
export function isFutureCivilDate(dateStr: string | undefined | null): boolean {
  if (!dateStr || !isValidCivilDate(dateStr)) return false;
  const today = getTodayCivilDate();
  return dateStr.trim() > today;
}

/**
 * Calcula a idade em anos completos a partir da data de nascimento civil (YYYY-MM-DD)
 * Nunca sofre deslocamento de timezone e calcula de forma puramente dinâmica
 */
export function calculateAge(birthDateStr: string | undefined | null): number | null {
  if (!birthDateStr || !isValidCivilDate(birthDateStr)) return null;
  const parts = birthDateStr.split('-');
  const birthYear = parseInt(parts[0], 10);
  const birthMonth = parseInt(parts[1], 10);
  const birthDay = parseInt(parts[2], 10);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  let age = currentYear - birthYear;
  if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay)) {
    age--;
  }
  return age >= 0 ? age : 0;
}

/**
 * Calcula o próximo aniversário e os dias restantes até a data
 */
export function calculateNextBirthday(birthDateStr: string | undefined | null): {
  formattedDate: string;
  daysUntil: number;
  isUpcoming: boolean;
} | null {
  if (!birthDateStr || !isValidCivilDate(birthDateStr)) return null;
  const parts = birthDateStr.split('-');
  const birthMonth = parseInt(parts[1], 10);
  const birthDay = parseInt(parts[2], 10);

  const now = new Date();
  const currentYear = now.getFullYear();
  const today = new Date(currentYear, now.getMonth(), now.getDate());

  let nextBday = new Date(currentYear, birthMonth - 1, birthDay);
  if (nextBday < today) {
    nextBday = new Date(currentYear + 1, birthMonth - 1, birthDay);
  }

  const diffTime = nextBday.getTime() - today.getTime();
  const daysUntil = Math.round(diffTime / (1000 * 60 * 60 * 24));

  const dd = String(birthDay).padStart(2, '0');
  const mm = String(birthMonth).padStart(2, '0');
  const yyyy = nextBday.getFullYear();

  return {
    formattedDate: `${dd}/${mm}/${yyyy}`,
    daysUntil,
    isUpcoming: daysUntil >= 0 && daysUntil <= 7,
  };
}

/**
 * Diferença em dias civis inteiros entre dateA e dateB (dateA - dateB)
 * Ex: se dateA = 2026-09-18 e dateB = 2026-09-15 -> retorna 3
 */
export function calculateCivilDaysDiff(dateAStr: string, dateBStr: string): number {
  if (!dateAStr || !dateBStr) return 0;
  const cleanA = dateAStr.split('T')[0];
  const cleanB = dateBStr.split('T')[0];
  const partsA = cleanA.split('-').map(Number);
  const partsB = cleanB.split('-').map(Number);
  if (partsA.length !== 3 || partsB.length !== 3) return 0;

  const dtA = new Date(partsA[0], partsA[1] - 1, partsA[2]);
  const dtB = new Date(partsB[0], partsB[1] - 1, partsB[2]);
  const diffTime = dtA.getTime() - dtB.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}



