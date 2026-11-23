import { createLoader } from 'nuqs/server';

import { type LeadFilters, leadSearchParams } from './filters';

const load = createLoader(leadSearchParams);

/**
 * SearchParams (ou objeto equivalente) → filtros tipados, com os mesmos
 * defaults da URL.
 */
export const parseFilters = (params: Record<string, string | string[] | undefined>): LeadFilters =>
  load(params);
