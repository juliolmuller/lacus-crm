const TZ = 'America/Sao_Paulo';

export type BusinessCalendar = { extraHolidays: { date: string; name: string }[] };

const day = 86_400_000;
const ymdOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const msOf = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);

/** Domingo de Páscoa (algoritmo gregoriano anônimo), como "AAAA-MM-DD". */
export function easterSunday(year: number): string {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const dayOfMonth = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
}

// Nacionais fixos (inclui 20/11, nacional desde a Lei 14.759/2023) e Curitiba (8/set).
const FIXED: [string, string][] = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência'],
  ['09-08', 'Nossa Senhora da Luz dos Pinhais (Curitiba)'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Consciência Negra'],
  ['12-25', 'Natal'],
];
// Móveis, em dias a partir da Páscoa.
const MOVING: [number, string][] = [
  [-48, 'Carnaval (segunda)'],
  [-47, 'Carnaval (terça)'],
  [-2, 'Sexta-feira Santa'],
  [60, 'Corpus Christi'],
];

/** Feriados do ano: data → nome. */
export function holidaysOf(year: number, cal?: BusinessCalendar): Map<string, string> {
  const map = new Map<string, string>();
  for (const [md, name] of FIXED) map.set(`${year}-${md}`, name);
  const easter = msOf(easterSunday(year));
  for (const [offset, name] of MOVING) map.set(ymdOf(easter + offset * day), name);
  for (const h of cal?.extraHolidays ?? [])
    if (h.date.startsWith(`${year}-`)) map.set(h.date, h.name);
  return map;
}

export function isBusinessDay(ymd: string, cal?: BusinessCalendar): boolean {
  const weekday = new Date(msOf(ymd)).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !holidaysOf(Number(ymd.slice(0, 4)), cal).has(ymd);
}

/** Soma (ou subtrai, se negativo) `n` dias úteis a uma data "AAAA-MM-DD". n = 0 devolve a própria data. */
export function addBusinessDays(ymd: string, n: number, cal?: BusinessCalendar): string {
  const step = n < 0 ? -1 : 1;
  let ms = msOf(ymd);
  for (let left = Math.abs(n); left > 0;) {
    ms += step * day;
    if (isBusinessDay(ymdOf(ms), cal)) left--;
  }
  return ymdOf(ms);
}

/** Dias úteis entre duas datas (quantos dias úteis depois de `from` até `to`, inclusive `to`). */
export function businessDaysBetween(from: string, to: string, cal?: BusinessCalendar): number {
  let n = 0;
  for (let ms = msOf(from) + day; ms <= msOf(to); ms += day) if (isBusinessDay(ymdOf(ms), cal)) n++;
  return n;
}

/** Data de calendário em São Paulo de um instante. */
export const spYmd = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, dateStyle: 'short' }).format(d);

const offsetMs = (t: number) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(t)
      .map((x) => [x.type, x.value]),
  );
  const local = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return local - Math.floor(t / 1000) * 1000;
};

/** "AAAA-MM-DD" + "HH:MM" em São Paulo → instante UTC. */
export function spDateTime(ymd: string, hhmm: string): Date {
  const guess = Date.parse(`${ymd}T${hhmm}:00Z`);
  return new Date(guess - offsetMs(guess - offsetMs(guess)));
}
