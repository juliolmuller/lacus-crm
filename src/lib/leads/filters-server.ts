import { createLoader } from 'nuqs/server';
import { leadSearchParams, type LeadFilters } from './filters';

const load = createLoader(leadSearchParams);

/** searchParams (ou objeto equivalente) → filtros tipados, com os mesmos defaults da URL. */
export const parseFilters = (params: Record<string, string | string[] | undefined>): LeadFilters =>
  load(params);
