import { afterEach, describe, expect, it, vi } from 'vitest';

import { isOwner } from '@/lib/auth/allowlist';
import { isE2EBypassActive } from '@/lib/auth/bypass';

describe('isOwner', () => {
  it('com sub configurado, só o sub vale (o e-mail é ignorado)', () => {
    const owner = { sub: 'abc', email: 'julio@example.com' };

    expect(isOwner({ sub: 'abc' }, owner)).toBe(true);
    expect(isOwner({ sub: 'xyz', email: 'julio@example.com', emailVerified: true }, owner)).toBe(
      false,
    );
  });

  it('sem sub, vale o e-mail verificado (sem diferenciar maiúsculas)', () => {
    const owner = { email: 'Julio@Example.com' };

    expect(isOwner({ email: 'julio@example.com', emailVerified: true }, owner)).toBe(true);
    expect(isOwner({ email: 'julio@example.com', emailVerified: false }, owner)).toBe(false);
    expect(isOwner({ email: 'outro@example.com', emailVerified: true }, owner)).toBe(false);
  });

  it('sem configuração, ninguém entra', () => {
    expect(isOwner({ sub: 'abc', email: 'a@b.c', emailVerified: true }, {})).toBe(false);
  });
});

describe('isE2EBypassActive', () => {
  afterEach(() => vi.unstubAllEnvs());

  const env = (bypass: string, node: string, vercel?: string): boolean => {
    vi.stubEnv('E2E_AUTH_BYPASS', bypass);
    vi.stubEnv('NODE_ENV', node);

    if (vercel === undefined) delete process.env.VERCEL_ENV;
    else vi.stubEnv('VERCEL_ENV', vercel);

    return isE2EBypassActive();
  };

  it('só ativa com bypass=1, fora de produção e sem VERCEL_ENV', () => {
    expect(env('1', 'development')).toBe(true);
    expect(env('0', 'development')).toBe(false);
    expect(env('1', 'production')).toBe(false);
    expect(env('1', 'development', 'preview')).toBe(false);
  });

  it('em build de produção exige também E2E_PROD_BUILD=1, e nunca na Vercel', () => {
    vi.stubEnv('E2E_PROD_BUILD', '1');
    expect(env('1', 'production')).toBe(true);
    expect(env('1', 'production', 'production')).toBe(false);
    expect(env('0', 'production')).toBe(false);
  });
});
