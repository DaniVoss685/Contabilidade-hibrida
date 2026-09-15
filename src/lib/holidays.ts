// Feriados Nacionais Brasileiros (Leis nº 662/1949, 6.802/1980, 10.607/2002 e 14.759/2023)
// e Calculo Astronomico de Feriados Moveis (Pascoa, Carnaval, Sexta-feira Santa e Corpus Christi)

function getEasterDate(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = Marco, 4 = Abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const holidaysCache = new Map<number, Map<string, string>>();

export function getHolidaysForYear(year: number): Map<string, string> {
  if (holidaysCache.has(year)) {
    return holidaysCache.get(year)!;
  }

  const map = new Map<string, string>();

  // 1. Feriados Nacionais Fixos
  map.set(formatDateKey(year, 1, 1), 'Confraternizacao Universal (Ano Novo)');
  map.set(formatDateKey(year, 4, 21), 'Tiradentes');
  map.set(formatDateKey(year, 5, 1), 'Dia do Trabalho');
  map.set(formatDateKey(year, 9, 7), 'Independencia do Brasil');
  map.set(formatDateKey(year, 10, 12), 'Nossa Senhora Aparecida');
  map.set(formatDateKey(year, 11, 2), 'Finados');
  map.set(formatDateKey(year, 11, 15), 'Proclamacao da Republica');
  map.set(formatDateKey(year, 11, 20), 'Dia da Consciencia Negra');
  map.set(formatDateKey(year, 12, 25), 'Natal');

  // 2. Feriados Moveis baseados na Pascoa
  const { month: easterMonth, day: easterDay } = getEasterDate(year);
  const easterDate = new Date(year, easterMonth - 1, easterDay);

  // Carnaval: terca-feira de carnaval (47 dias antes da Pascoa)
  const carnavalDate = new Date(easterDate);
  carnavalDate.setDate(easterDate.getDate() - 47);
  map.set(
    formatDateKey(year, carnavalDate.getMonth() + 1, carnavalDate.getDate()),
    'Carnaval'
  );

  // Sexta-feira Santa / Paixao de Cristo (2 dias antes da Pascoa)
  const goodFridayDate = new Date(easterDate);
  goodFridayDate.setDate(easterDate.getDate() - 2);
  map.set(
    formatDateKey(year, goodFridayDate.getMonth() + 1, goodFridayDate.getDate()),
    'Sexta-feira Santa'
  );

  // Pascoa
  map.set(formatDateKey(year, easterMonth, easterDay), 'Domingo de Pascoa');

  // Corpus Christi (60 dias apos a Pascoa)
  const corpusChristiDate = new Date(easterDate);
  corpusChristiDate.setDate(easterDate.getDate() + 60);
  map.set(
    formatDateKey(year, corpusChristiDate.getMonth() + 1, corpusChristiDate.getDate()),
    'Corpus Christi'
  );

  holidaysCache.set(year, map);
  return map;
}

export function getHoliday(date: string | Date): string | null {
  const d = typeof date === 'string' ? new Date(`${date.split('T')[0]}T12:00:00`) : date;
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const map = getHolidaysForYear(year);
  const key = formatDateKey(year, d.getMonth() + 1, d.getDate());
  return map.get(key) || null;
}

export function isSunday(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(`${date.split('T')[0]}T12:00:00`) : date;
  if (isNaN(d.getTime())) return false;
  return d.getDay() === 0;
}

export function isSundayOrHoliday(date: string | Date): {
  isRed: boolean;
  isSunday: boolean;
  isHoliday: boolean;
  holidayName: string | null;
} {
  const holiday = getHoliday(date);
  const sunday = isSunday(date);
  return {
    isRed: sunday || Boolean(holiday),
    isSunday: sunday,
    isHoliday: Boolean(holiday),
    holidayName: holiday,
  };
}
