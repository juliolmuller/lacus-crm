import { z } from 'zod';

const points = z.number().min(0);

export const scoreWeights = z.object({
  website: points,
  reputation: points,
  marketing: points,
  ticket: points,
  directContact: points,
  competition: points,
});

export const scoreThresholds = z.object({
  green: z.number().int().min(0).max(100),
  yellow: z.number().int().min(0).max(100),
  minRating: z.number().min(0).max(5),
  minReviews: z.number().int().min(0),
  ticketPoints: z.object({ high: points, medium: points, low: points }),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use AAAA-MM-DD');

export const settingSchemas = {
  score_weights: scoreWeights,
  score_thresholds: scoreThresholds,
  places_daily_budget: z.number().int().positive(),
  calendar_defaults: z.object({ popupReminderMinutes: z.array(z.number().int().min(0)) }),
  business_calendar: z.object({
    extraHolidays: z.array(z.object({ date: isoDate, name: z.string() })),
  }),
  owner_profile: z.object({
    name: z.string().optional(),
    signature: z.string().optional(),
    portfolioUrl: z.union([z.url(), z.literal('')]).optional(),
  }),
} as const;

export type SettingKey = keyof typeof settingSchemas;

export const settingDefaults: { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> } = {
  score_weights: {
    website: 30,
    reputation: 20,
    marketing: 15,
    ticket: 15,
    directContact: 10,
    competition: 10,
  },
  score_thresholds: {
    green: 70,
    yellow: 40,
    minRating: 4.0,
    minReviews: 20,
    ticketPoints: { high: 15, medium: 7.5, low: 0 },
  },
  places_daily_budget: 30,
  calendar_defaults: { popupReminderMinutes: [10, 0] },
  business_calendar: { extraHolidays: [] },
  owner_profile: {},
};

/**
 * Valor guardado no banco que não passa no schema da chave (ex.: migration
 * pendente). É falha do servidor/dados, não entrada do cliente.
 */
export class SettingError extends Error {
  public constructor(
    public key: SettingKey,
    public issues: z.core.$ZodIssue[],
  ) {
    super(
      `Configuração "${key}" inválida no banco; rode as migrations pendentes (bun run db:migrate)`,
    );
  }
}

/**
 * Lê o valor de uma chave vindo do banco; lança SettingError (nunca ZodError).
 */
export const readSetting = <K extends SettingKey>(
  key: K,
  value: unknown,
): z.infer<(typeof settingSchemas)[K]> => {
  const r = settingSchemas[key].safeParse(value);

  if (!r.success) throw new SettingError(key, r.error.issues);

  return r.data as z.infer<(typeof settingSchemas)[K]>;
};

/**
 * Valida o valor de uma chave de `settings`; lança ZodError se inválido.
 */
export const parseSetting = <K extends SettingKey>(
  key: K,
  value: unknown,
): z.infer<(typeof settingSchemas)[K]> =>
  settingSchemas[key].parse(value) as z.infer<(typeof settingSchemas)[K]>;
