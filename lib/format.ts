const TZ = 'America/Sao_Paulo';

/** Ano corrente no fuso America/Sao_Paulo. */
export const currentYear = (now = new Date()): number =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric' }).format(now));
