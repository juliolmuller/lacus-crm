import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import { toApiError } from '@/lib/api/errors';
import { dashboardSummary } from '@/lib/api/ops';
import { SettingError } from '@/lib/validation/settings';

describe('toApiError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('SettingError vira internal_error com a chave e registra só chave e issues', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const e = toApiError(new SettingError('score_thresholds', []));

    expect(e.code).toBe('internal_error');
    expect(e.status).toBe(500);
    expect(e.message).toContain('score_thresholds');
    expect(e.message).toContain('migrations');
    expect(log).toHaveBeenCalledWith('setting error', 'score_thresholds', []);
  });

  it('ZodError continua validation_error', () => {
    expect(toApiError(new ZodError([])).code).toBe('validation_error');
  });
});

describe('crm_dashboard_summary: entrada', () => {
  it('padrão 30 e aceita 7, 30, 90, "all" e números em texto', () => {
    expect(dashboardSummary.input.parse({})).toEqual({ period: 30 });

    for (const period of [7, 30, 90, 'all', '7', '30', '90']) {
      expect(() => dashboardSummary.input.parse({ period })).not.toThrow();
    }
  });

  it('rejeita períodos fora da lista', () => {
    expect(() => dashboardSummary.input.parse({ period: 15 })).toThrow();
    expect(() => dashboardSummary.input.parse({ period: '15' })).toThrow();
  });
});
