import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { formatWhen } from '@/lib/format';
import { type listSuppression } from '@/lib/services/suppression';
import { cn } from '@/lib/utils';

type Suppression = Awaited<ReturnType<typeof listSuppression>>;

/**
 * Dados: importar e exportar CSV, lista de supressão e a explicação de
 * LGPD/opt-out.
 */
export function DataSettings({ suppression }: { suppression: Suppression }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Link href="/leads/importar" className={cn(buttonVariants({ variant: 'secondary' }))}>
          Importar CSV
        </Link>
        {/* rota que devolve arquivo: navegação completa, não <Link> */}
        <a href="/api/leads/export" className={cn(buttonVariants({ variant: 'secondary' }))}>
          Exportar CSV
        </a>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4 text-body">
        <h3 className="text-label text-text">LGPD e opt-out</h3>
        <p className="text-text-muted">
          Quem pede para parar de receber mensagens vira “Não contatar”: os lembretes abertos são
          cancelados, as negociações abertas viram perdidas e o lead entra na lista de supressão.
          Excluir um lead também o suprime, para que uma nova importação ou a rotina de prospecção
          não o recrie. Na lista ficam só o identificador do Google Maps e hashes (SHA-256) do
          telefone e de nome + região, nunca os dados em texto.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-label text-text">
          Lista de supressão <span className="text-text-muted">({suppression.total})</span>
        </h3>
        {suppression.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body">
              <thead className="text-label text-text-muted">
                <tr>
                  <th className="py-2 pr-3">Quando</th>
                  <th className="py-2 pr-3">Motivo</th>
                  <th className="py-2 pr-3">Identificador</th>
                </tr>
              </thead>
              <tbody>
                {suppression.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="tabular py-2 pr-3">{formatWhen(r.createdAt)}</td>
                    <td className="py-2 pr-3">{r.reason}</td>
                    <td className="py-2 pr-3">
                      {[
                        r.placeId ? `place_id ${r.placeId}` : null,
                        r.hasPhone ? 'telefone (hash)' : null,
                        'nome + região (hash)',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {suppression.total > suppression.rows.length && (
              <p className="pt-2 text-label text-text-muted">
                Mostrando as {suppression.rows.length} mais recentes.
              </p>
            )}
          </div>
        ) : (
          <p className="text-body text-text-muted">Nenhum item na lista de supressão.</p>
        )}
      </div>
    </div>
  );
}
