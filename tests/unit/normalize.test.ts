import { describe, expect, it } from 'vitest';

import {
  formatCityNeighborhood,
  normalizeName,
  normalizePhone,
  parseCityNeighborhood,
} from '@/lib/normalize';

describe('normalizePhone', () => {
  it.each([
    ['(41) 98837-2454', '+5541988372454'],
    ['(41) 3053-4004', '+554130534004'],
    ['+55 41 99635-5969', '+5541996355969'],
    ['5541996355969', '+5541996355969'],
    ['0055 41 3148-1142', '+554131481142'],
  ])('%s → %s', (raw, e164) => expect(normalizePhone(raw)).toBe(e164));

  it.each([[''], [null], [undefined], ['3053-4004'], ['0800 123 4567'], ['41 8837-24543']])(
    'inválido %s → null',
    (raw) => expect(normalizePhone(raw)).toBeNull(),
  );
});

describe('normalizeName', () => {
  it('tira acento, caixa e pontuação', () => {
    expect(normalizeName('  Lumiê  Odontologia — Sítio Cercado! ')).toBe(
      'lumie odontologia sitio cercado',
    );
    expect(normalizeName('Dra. Aline Fernandes')).toBe('dra aline fernandes');
  });
});

describe('parseCityNeighborhood', () => {
  it('bairro, cidade e UF', () => {
    expect(parseCityNeighborhood('Xaxim, Curitiba/PR')).toEqual({
      state: 'PR',
      city: 'Curitiba',
      neighborhood: 'Xaxim',
      label: 'PR - Curitiba - Xaxim',
    });
    expect(parseCityNeighborhood('Alto Boqueirão, Curitiba/PR')?.label).toBe(
      'PR - Curitiba - Alto Boqueirão',
    );
  });
  it('sem bairro e com espaços ao redor da barra', () => {
    expect(parseCityNeighborhood('Curitiba/PR')?.label).toBe('PR - Curitiba');
    expect(parseCityNeighborhood(' Jaraguá do Sul / sc ')?.label).toBe('SC - Jaraguá do Sul');
  });
  it('aceita o próprio label', () => {
    expect(parseCityNeighborhood('PR - Curitiba - Xaxim')?.neighborhood).toBe('Xaxim');
    expect(parseCityNeighborhood('SC - Chapecó')?.neighborhood).toBeNull();
  });
  it('inválido → null e ida e volta', () => {
    expect(parseCityNeighborhood('Curitiba')).toBeNull();
    expect(parseCityNeighborhood('')).toBeNull();

    const p = parseCityNeighborhood('Xaxim, Curitiba/PR')!;

    expect(formatCityNeighborhood(p)).toBe('Xaxim, Curitiba/PR');
  });
});
