import { describe, expect, it } from 'vitest';
import {
  RATE_LIMIT_PER_MIN,
  allows,
  hashToken,
  looksLikePat,
  withinRateLimit,
} from '@/lib/services/tokens';

describe('tokens', () => {
  it('hash SHA-256 estável e só reconhece o prefixo lcrm_', () => {
    expect(hashToken('lcrm_abc')).toBe(hashToken('lcrm_abc'));
    expect(hashToken('lcrm_abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('lcrm_abc')).not.toBe(hashToken('lcrm_abd'));
    expect(looksLikePat('lcrm_x')).toBe(true);
    expect(looksLikePat('eyJhbGciOi.a.b')).toBe(false);
  });

  it('escopos: write cobre read; prospecting é separado', () => {
    expect(allows(['read'], ['read'])).toBe(true);
    expect(allows(['write'], ['read'])).toBe(true);
    expect(allows(['read'], ['write'])).toBe(false);
    expect(allows(['prospecting'], ['read'])).toBe(false);
    expect(allows(['prospecting'], ['write', 'prospecting'])).toBe(true);
    expect(allows(['write'], ['prospecting'])).toBe(false);
    expect(allows([], ['read'])).toBe(false);
  });

  it('limite de 120 requisições por minuto, por token', () => {
    const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
    for (let i = 0; i < RATE_LIMIT_PER_MIN; i++)
      expect(withinRateLimit('tok-a', t0 + i)).toBe(true);
    expect(withinRateLimit('tok-a', t0 + 1000)).toBe(false);
    expect(withinRateLimit('tok-b', t0 + 1000)).toBe(true); // outro token
    expect(withinRateLimit('tok-a', t0 + 60_000)).toBe(true); // minuto seguinte
  });
});
