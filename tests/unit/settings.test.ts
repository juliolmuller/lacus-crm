import { describe, expect, it } from 'vitest';

import { cadence } from '@/lib/validation/followups';
import {
  parseSetting,
  settingDefaults,
  SettingError,
  type SettingKey,
  settingSchemas,
} from '@/lib/validation/settings';

describe('settings', () => {
  it('os valores padrão passam no schema de cada chave', () => {
    for (const key of Object.keys(settingSchemas) as SettingKey[]) {
      expect(() => parseSetting(key, settingDefaults[key])).not.toThrow();
    }
  });

  it('rejeita valores inválidos', () => {
    expect(() => parseSetting('places_daily_budget', -1)).toThrow();
    expect(() => parseSetting('score_weights', { website: 30 })).toThrow();
    expect(() =>
      parseSetting('business_calendar', { extraHolidays: [{ date: '25/12/2026', name: 'x' }] }),
    ).toThrow();
  });

  it('lança SettingError com a chave e os caminhos das issues', () => {
    const legacy = {
      ...settingDefaults.score_thresholds,
      ticketPoints: { alto: 15, medio: 7.5, baixo: 0 },
    };

    expect(() => parseSetting('score_thresholds', legacy)).toThrow(SettingError);

    try {
      parseSetting('score_thresholds', legacy);
    } catch (e) {
      expect(e).toBeInstanceOf(SettingError);
      expect((e as SettingError).key).toBe('score_thresholds');
      expect((e as SettingError).issues[0]?.path[0]).toBe('ticketPoints');
    }
  });

  it('valida a cadência de follow-up', () => {
    expect(() => cadence.parse([{ offsetBusinessDays: 2, time: '9:30', title: 'x' }])).toThrow();
    expect(cadence.parse([{ offsetBusinessDays: -1, time: '09:30', title: 'x' }])).toHaveLength(1);
  });
});
