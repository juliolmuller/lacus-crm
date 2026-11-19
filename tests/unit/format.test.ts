import { describe, expect, it } from 'vitest';
import { currentYear } from '@/lib/format';

describe('currentYear', () => {
  it('usa o fuso America/Sao_Paulo na virada do ano', () => {
    expect(currentYear(new Date('2027-01-01T02:00:00Z'))).toBe(2026); // 31/12 23h em Brasília
    expect(currentYear(new Date('2027-01-01T03:00:00Z'))).toBe(2027);
  });
});
