import Papa from 'papaparse';

const norm = (v: string): string =>
  v
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

const TICKET = { alto: 'alto', medio: 'medio', baixo: 'baixo' } as const;
const OPENNESS = { alta: 'alta', media: 'media', baixa: 'baixa' } as const;

function pick<T extends Record<string, string>>(
  map: T,
  raw: string | undefined,
  label: string,
): null | T[keyof T] {
  if (!raw?.trim()) return null;

  const v = map[norm(raw)];

  if (!v) throw new Error(`Valor inválido em "${label}": "${raw}"`);

  return v as T[keyof T];
}

/**
 * Lê o CSV da aba Nichos (cabeçalhos pt-BR da planilha). Nunca inventa valores
 * ausentes.
 */
export interface NicheCsvRow {
  firstOffer: null | string;
  name: string;
  openness: (typeof OPENNESS)[keyof typeof OPENNESS] | null;
  ticket: (typeof TICKET)[keyof typeof TICKET] | null;
  whyBuys: null | string;
}

export function parseNichesCsv(csv: string): NicheCsvRow[] {
  const { data } = Papa.parse<Record<string, string>>(csv.replace(/^\ufeff/, ''), {
    header: true,
    skipEmptyLines: true,
  });

  return data.map((row) => {
    const name = row['Nicho']?.trim();

    if (!name) throw new Error('Linha de nicho sem nome');

    return {
      name,
      ticket: pick(TICKET, row['Ticket do serviço'], 'Ticket do serviço'),
      openness: pick(OPENNESS, row['Abertura a site novo'], 'Abertura a site novo'),
      whyBuys: row['Por que costuma comprar']?.trim() || null,
      firstOffer: row['O que oferecer primeiro']?.trim() || null,
    };
  });
}
