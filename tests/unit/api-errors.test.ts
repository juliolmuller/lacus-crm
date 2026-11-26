import { afterEach, describe, expect, it, vi } from 'vitest';
import { z, ZodError } from 'zod';

import { ApiError, toApiError } from '@/lib/api/errors';
import { dashboardSummary } from '@/lib/api/ops';
import { toolError } from '@/lib/mcp/tool-error';
import { SettingError } from '@/lib/validation/settings';

const zodError = (): z.ZodError => {
  const r = z.object({ patch: z.object({ channel: z.string() }).strict() }).safeParse({
    patch: { channel: 1, nope: 1 },
  });

  if (r.success) throw new Error('esperava falha');

  return r.error;
};

describe('toApiError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('SettingError vira internal_error com a chave e registra só chave e issues', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const e = toApiError(new SettingError('score_thresholds', []));

    expect(e.code).toBe('internal_error');
    expect(e.status).toBe(500);
    expect(e.message).toContain('score_thresholds');
    expect(e.message).toContain('migrations');
    expect(e.details).toBeUndefined();
    expect(log).toHaveBeenCalledWith('setting error', 'score_thresholds', []);
  });

  it('ZodError continua validation_error', () => {
    expect(toApiError(new ZodError([])).code).toBe('validation_error');
  });

  it('ZodError vira validation_error com details compactos e path', () => {
    const err = toApiError(zodError());

    expect(err.code).toBe('validation_error');
    expect(err.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'patch.channel' })]),
    );
  });
});

describe('toolError', () => {
  it('validation_error: texto com as issues e structuredContent.error.details', () => {
    const r = toolError(toApiError(zodError()));

    expect(r.isError).toBe(true);
    expect(r.content[0]?.text.startsWith('validation_error: Entrada inválida\n')).toBe(true);
    expect(r.content[0]?.text).toContain('patch.channel');
    expect(r.structuredContent.error.code).toBe('validation_error');
    expect(r.structuredContent.error.details).toBeDefined();
  });

  it('outros códigos não levam details', () => {
    const r = toolError(new ApiError('internal_error', 'Erro interno', { segredo: 1 }));

    expect(r.content[0]?.text).toBe('internal_error: Erro interno');
    expect(r.structuredContent.error).toEqual({ code: 'internal_error', message: 'Erro interno' });
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
