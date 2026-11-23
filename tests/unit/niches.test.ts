import { describe, expect, it } from 'vitest';

import { parseNichesCsv } from '@/lib/niches';

const header =
  '"Nicho","Ticket do serviço","Abertura a site novo","Por que costuma comprar","O que oferecer primeiro"';

describe('parseNichesCsv', () => {
  it('converte rótulos pt-BR (com acento) para os enums', () => {
    const [n] = parseNichesCsv(`${header}\n"Clínicas","Médio","Média","porque, sim","oferta"`);

    expect(n).toMatchObject({
      name: 'Clínicas',
      ticket: 'medio',
      openness: 'media',
      whyBuys: 'porque, sim',
    });
  });

  it('deixa ticket e abertura nulos quando a planilha não tem, e recusa valores desconhecidos', () => {
    expect(parseNichesCsv(`${header}\n"X","","","",""`)[0]).toMatchObject({
      ticket: null,
      openness: null,
    });
    expect(() => parseNichesCsv(`${header}\n"X","Caro","","",""`)).toThrow('Ticket do serviço');
  });
});
