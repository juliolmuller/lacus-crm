import { requireOwner } from '@/lib/auth/dal';
import { getDb } from '@/lib/db';
import { parseFilters } from '@/lib/leads/filters-server';
import { exportLeadsCsv } from '@/lib/services/export';

export const dynamic = 'force-dynamic';

/**
 * CSV dos leads (39 cabeçalhos, BOM) com os filtros da tela. `?sep=,` troca o
 * `;` padrão.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    await requireOwner();
  } catch {
    return new Response('Não autorizado', { status: 401 });
  }

  const url = new URL(req.url);
  const filters = parseFilters(Object.fromEntries(url.searchParams));
  const csv = await exportLeadsCsv(
    getDb(),
    filters,
    url.searchParams.get('sep') === ',' ? ',' : ';',
  );
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="leads-${day}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
