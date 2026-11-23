import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';

import { contactStatuses, websiteStatuses } from './labels';

export const SORTS = ['score', 'name', 'updated', 'included', 'contact', 'priority'] as const;

/**
 * Colunas da tabela (id → rótulo). `name` é sempre visível.
 */
export const TABLE_COLUMNS = {
  score: 'Score',
  name: 'Nome',
  niche: 'Nicho',
  region: 'Região',
  status: 'Status',
  site: 'Site',
  rating: 'Nota/Avaliações',
  whatsapp: 'WhatsApp',
  nextAction: 'Próxima ação',
  contact: 'Último contato',
  priority: 'Prioridade',
} as const;
export type TableColumn = keyof typeof TABLE_COLUMNS;
export const tableColumnIds = Object.keys(TABLE_COLUMNS) as TableColumn[];

/**
 * Estado da lista na URL (SPEC 6.2). Usado pelo cliente (nuqs) e pelo servidor
 * (createLoader).
 */
export const leadSearchParams = {
  q: parseAsString.withDefault(''),
  status: parseAsArrayOf(parseAsStringLiteral(contactStatuses)).withDefault([]),
  niche: parseAsInteger,
  region: parseAsInteger,
  smin: parseAsInteger,
  smax: parseAsInteger,
  site: parseAsArrayOf(parseAsStringLiteral(websiteStatuses)).withDefault([]),
  wa: parseAsStringLiteral(['yes', 'no'] as const),
  dnc: parseAsStringLiteral(['hide', 'show', 'only'] as const).withDefault('hide'),
  deal: parseAsStringLiteral(['open', 'none'] as const),
  overdue: parseAsBoolean.withDefault(false),
  from: parseAsString,
  to: parseAsString,
  source: parseAsString,
  sort: parseAsStringLiteral(SORTS).withDefault('score'),
  dir: parseAsStringLiteral(['asc', 'desc'] as const).withDefault('desc'),
  cols: parseAsArrayOf(parseAsStringLiteral(tableColumnIds)).withDefault([...tableColumnIds]),
  lead: parseAsString,
};

export interface LeadFilters {
  deal: 'none' | 'open' | null;
  dir: 'asc' | 'desc';
  dnc: 'hide' | 'only' | 'show';
  from: null | string;
  /**
   * Só MCP: filtra por ter (true) ou não (false) prioridade / link de sessão.
   */
  hasPriority?: boolean;
  hasSession?: boolean;
  niche: null | number;
  overdue: boolean;
  q: string;
  region: null | number;
  site: Array<(typeof websiteStatuses)[number]>;
  smax: null | number;
  smin: null | number;
  sort: (typeof SORTS)[number];
  source: null | string;
  status: Array<(typeof contactStatuses)[number]>;
  to: null | string;
  wa: 'no' | 'yes' | null;
}

/**
 * Chaves que formam o filtro (o resto é só apresentação).
 */
export const FILTER_KEYS = [
  'q',
  'status',
  'niche',
  'region',
  'smin',
  'smax',
  'site',
  'wa',
  'dnc',
  'deal',
  'overdue',
  'from',
  'to',
  'source',
] as const;
