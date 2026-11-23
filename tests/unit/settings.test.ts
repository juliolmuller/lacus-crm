import { describe, expect, it } from 'vitest';

import { cadence } from '@/lib/validation/followups';
import {
  parseSetting,
  settingDefaults,
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

  it('valida a cadência de follow-up', () => {
    expect(() => cadence.parse([{ offsetBusinessDays: 2, time: '9:30', title: 'x' }])).toThrow();
    expect(cadence.parse([{ offsetBusinessDays: -1, time: '09:30', title: 'x' }])).toHaveLength(1);
  });
});
