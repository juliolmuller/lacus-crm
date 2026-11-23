const TZ = 'America/Sao_Paulo';

/**
 * Ano corrente no fuso America/Sao_Paulo.
 */
export const currentYear = (now = new Date()): number =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric' }).format(now));

/**
 * "19/11/2026 14:30" em São Paulo.
 */
export const formatWhen = (d: Date): string =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(d);

/**
 * "R$ 1.500,00"; null/vazio vira "—".
 */
export const formatMoney = (v: null | number | string | undefined): string =>
  v === null || v === undefined || v === ''
    ? '—'
    : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * 0,6667 vira "67%"; null (denominador zero) vira "—".
 */
export const formatPercent = (rate: null | number): string =>
  rate === null ? '—' : `${Math.round(rate * 100)}%`;
