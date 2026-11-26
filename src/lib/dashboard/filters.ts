import { createLoader, parseAsInteger, parseAsStringLiteral } from 'nuqs/server';

import { type DashboardFilters, type Period } from '@/lib/services/dashboard';

export const PERIODS = ['7', '30', '90', 'all'] as const;

/**
 * Normaliza o período recebido como texto (URL, MCP) ou número para `Period`.
 * Fica aqui, e não em `services/dashboard`, para o bundle do navegador não
 * puxar o banco.
 */
export const toPeriod = (p: '30' | '7' | '90' | 'all' | 30 | 7 | 90): Period =>
  p === 'all' ? 'all' : (Number(p) as 30 | 7 | 90);

export const periodLabel = {
  '7': '7 dias',
  '30': '30 dias',
  '90': '90 dias',
  'all': 'Tudo',
} as const;

/**
 * Filtros da tela inicial na URL (SPEC 6.1): cliente (nuqs) e servidor
 * (createLoader) usam o mesmo desenho.
 */
export const dashboardSearchParams = {
  period: parseAsStringLiteral(PERIODS).withDefault('30'),
  niche: parseAsInteger,
  region: parseAsInteger,
};

const load = createLoader(dashboardSearchParams);

export function parseDashboardFilters(
  params: Record<string, string | string[] | undefined>,
): DashboardFilters {
  const p = load(params);

  return {
    period: toPeriod(p.period),
    niche: p.niche,
    region: p.region,
  };
}
