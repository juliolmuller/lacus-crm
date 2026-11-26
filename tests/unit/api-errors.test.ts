import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError, toApiError } from '@/lib/api/errors';
import { toolError } from '@/lib/mcp/tool-error';
import { settingDefaults, SettingError } from '@/lib/validation/settings';

const zodError = (): z.ZodError => {
  const r = z.object({ patch: z.object({ channel: z.string() }).strict() }).safeParse({
    patch: { channel: 1, nope: 1 },
  });

  if (r.success) throw new Error('esperava falha');

  return r.error;
};

describe('toApiError', () => {
  it('ZodError vira validation_error com details compactos e path', () => {
    const err = toApiError(zodError());

    expect(err.code).toBe('validation_error');
    expect(err.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'patch.channel' })]),
    );
  });

  it('SettingError vira internal_error com a chave, sem valores nem details', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bad = { ...settingDefaults.score_thresholds, ticketPoints: { alto: 99, medio: 1 } };
    const r = z.object({ ticketPoints: z.object({ high: z.number() }) }).safeParse(bad);

    if (r.success) throw new Error('esperava falha');

    const err = toApiError(new SettingError('score_thresholds', r.error.issues));

    expect(err.code).toBe('internal_error');
    expect(err.message).toContain('"score_thresholds"');
    expect(err.message).not.toContain('99');
    expect(err.details).toBeUndefined();
    spy.mockRestore();
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
