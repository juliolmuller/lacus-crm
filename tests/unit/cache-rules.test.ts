import { describe, expect, it } from 'vitest';
import { cacheableAtRuntime, neverCache } from '@/lib/pwa/cache-rules';

const req = (path: string, method = 'GET', headers: Record<string, string> = {}) => ({
  url: `https://crm.test${path}`,
  method,
  headers: new Headers(headers),
});

describe('neverCache', () => {
  it.each([
    '/api/auth/get-session',
    '/api/auth/callback/vercel',
    '/api/mcp',
    '/api/mcp/sse',
    '/api/v1/leads',
    '/api/jobs/followups',
    '/api/google/callback',
    '/.well-known/oauth-authorization-server',
  ])('bloqueia %s', (path) => expect(neverCache(req(path))).toBe(true));

  it('bloqueia qualquer método diferente de GET e Server Actions', () => {
    expect(neverCache(req('/api/offline/snapshot', 'POST'))).toBe(true);
    expect(neverCache(req('/leads', 'GET', { 'next-action': 'abc' }))).toBe(true);
  });

  it('não bloqueia o resto', () => {
    expect(neverCache(req('/api/offline/snapshot'))).toBe(false);
    expect(neverCache(req('/api/authors'))).toBe(false); // prefixo parecido, rota diferente
  });
});

describe('cacheableAtRuntime', () => {
  it('só o GET do snapshot', () => {
    expect(cacheableAtRuntime(req('/api/offline/snapshot'))).toBe(true);
    expect(cacheableAtRuntime(req('/api/offline/snapshot', 'POST'))).toBe(false);
    for (const p of ['/', '/leads', '/api/leads/export', '/api/auth/get-session', '/api/v1/leads'])
      expect(cacheableAtRuntime(req(p))).toBe(false);
  });
});
