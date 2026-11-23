import { describe, expect, it } from 'vitest';

import {
  applyMapping,
  autoMapHeaders,
  COLUMNS,
  HEADERS,
  leadToRow,
  parseContactDate,
  parseDate,
  parseLeadRow,
  parseNumber,
} from '@/lib/leads/csv';

describe('mapeamento de cabeçalhos', () => {
  it('são 39 cabeçalhos únicos, da coluna A à AM', () => {
    expect(HEADERS).toHaveLength(39);
    expect(new Set(HEADERS).size).toBe(39);
  });
  it('reconhece sem acento/caixa e deixa o resto sem mapear', () => {
    const m = autoMapHeaders(['nome do negocio', 'WHATSAPP', 'Coluna extra']);

    expect(m).toEqual({
      'nome do negocio': 'Nome do negócio',
      'WHATSAPP': 'WhatsApp',
      'Coluna extra': null,
    });
    expect(applyMapping({ 'nome do negocio': 'X', 'Coluna extra': 'Y' }, m)).toEqual({
      'Nome do negócio': 'X',
    });
  });
});

describe('conversões', () => {
  it('números pt-BR', () => {
    expect(parseNumber('4,5')).toBe(4.5);
    expect(parseNumber('R$ 1.500,00')).toBe(1500);
    expect(parseNumber('1.500')).toBe(1500);
    expect(parseNumber('2500')).toBe(2500);
    expect(() => parseNumber('abc')).toThrow();
  });
  it('datas dd/mm/aaaa e ISO; rejeita inexistente', () => {
    expect(parseDate('18/11/2026')).toBe('2026-11-18');
    expect(parseDate('2026-11-18')).toBe('2026-11-18');
    expect(() => parseDate('31/02/2026')).toThrow();
    expect(() => parseDate('ontem')).toThrow();
  });
  it('data do contato vira 12:00 de São Paulo (15:00 UTC)', () => {
    expect(parseContactDate('18/11/2026').toISOString()).toBe('2026-11-18T15:00:00.000Z');
  });
});

describe('parseLeadRow', () => {
  const row = {
    'ID': '54ccff37-d6e1-4b65-b244-df29358576d6',
    'Nome do negócio': 'Odontlux',
    'WhatsApp': 'Sim',
    'Situação do site': 'Só rede social',
    'Nota no Maps': '4,5',
    'Dono responde avaliações': '',
    'Instagram atualizado': '',
    'Ticket do nicho': 'Médio',
    'Status do contato': 'Em negociação',
    'Valor da proposta (R$)': '1.200,50',
    'Data de inclusão': '12/11/2026',
  };

  it('converte e só devolve os campos presentes', () => {
    const r = parseLeadRow(row);

    expect(r.errors).toEqual([]);
    expect(r.values).toMatchObject({
      id: row.ID,
      name: 'Odontlux',
      hasWhatsapp: true,
      websiteStatus: 'social_only',
      mapsRating: '4.5',
      ownerRepliesReviews: null,
      instagramActive: false,
      contactStatus: 'negotiating',
      proposalValue: '1200.50',
      includedAt: '2026-11-12',
    });
    expect(r.ticket).toBe('medio');
    expect('email' in r.values).toBe(false);
  });
  it('status desconhecido vira new e o original vai para as observações', () => {
    const r = parseLeadRow({ 'Status do contato': 'Em análise', 'Observações': 'algo' });

    expect(r.values).toMatchObject({
      contactStatus: 'new',
      notes: '[status original: Em análise] algo',
    });
  });
  it('acumula erros por coluna sem lançar', () => {
    const r = parseLeadRow({
      'Nota no Maps': '7',
      'Data do contato': 'x',
      'WhatsApp': 'talvez',
      'ID': 'abc',
    });

    expect(r.errors).toHaveLength(4);
  });
  it('data de inclusão vazia mantém o padrão do banco', () => {
    expect('includedAt' in parseLeadRow({ 'Data de inclusão': '' }).values).toBe(false);
  });
});

describe('leadToRow ↔ parseLeadRow', () => {
  it('ida e volta preserva os valores', () => {
    const lead = {
      id: '54ccff37-d6e1-4b65-b244-df29358576d6',
      name: 'Odontlux',
      phone: '(41) 98837-2454',
      hasWhatsapp: true,
      websiteStatus: 'bad',
      mapsRating: '5.0',
      mapsReviews: 155,
      ownerRepliesReviews: false,
      hasActiveAds: false,
      instagramActive: false,
      strongLocalCompetition: true,
      score: 85,
      contactStatus: 'lost',
      lastContactAt: new Date('2026-11-18T15:00:00Z'),
      proposalValue: '1500.00',
      includedAt: '2026-11-12',
      notes: 'linha 1\nlinha 2, com vírgula; e ponto-e-vírgula',
    } as { score: number } & Record<string, unknown>;
    const row = leadToRow(
      lead,
      { name: 'Clínicas odontológicas', ticket: 'alto' },
      'Xaxim, Curitiba/PR',
    );

    expect(Object.keys(row)).toEqual(HEADERS);

    const back = parseLeadRow(row);

    expect(back.errors).toEqual([]);
    for (const col of COLUMNS) {
      if (['niche', 'place', 'ticket', 'score'].includes(col.kind)) continue;

      const v = lead[col.key];

      if (v === undefined) continue;

      expect(back.values[col.key], col.key).toEqual(v);
    }
    expect(back.nicheName).toBe('Clínicas odontológicas');
    expect(back.place).toBe('Xaxim, Curitiba/PR');
    expect(back.ticket).toBe('alto');
    expect(back.sheetScore).toBe(85);
  });
});
