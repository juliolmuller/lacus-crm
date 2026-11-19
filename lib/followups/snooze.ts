import { addBusinessDays, spDateTime, spYmd, type BusinessCalendar } from './business-days';

export const snoozePresets = ['1h', 'tomorrow', 'plus2bd'] as const;
export type SnoozePreset = (typeof snoozePresets)[number];
export const snoozeLabel: Record<SnoozePreset, string> = {
  '1h': 'Daqui a 1 hora',
  tomorrow: 'Amanhã, 9h30',
  plus2bd: '+2 dias úteis, 9h30',
};

/** Novo vencimento de um adiamento (SPEC 6.4). */
export function snoozeDue(preset: SnoozePreset, now: Date, cal?: BusinessCalendar): Date {
  if (preset === '1h') return new Date(now.getTime() + 3_600_000);
  const today = spYmd(now);
  const next = preset === 'tomorrow' ? addDays(today, 1) : addBusinessDays(today, 2, cal);
  return spDateTime(next, '09:30');
}

const addDays = (ymd: string, n: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Atrasos entre tentativas de sincronização: 1, 5 e 30 min; depois só o job (null). */
export const backoffMinutes = (attempts: number): number | null =>
  attempts <= 1 ? 1 : attempts === 2 ? 5 : attempts === 3 ? 30 : null;
