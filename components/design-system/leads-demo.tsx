'use client';

import { SearchX } from 'lucide-react';
import { useState } from 'react';
import { LeadTabs } from '@/components/leads/lead-tabs';
import { LeadsTable } from '@/components/leads/leads-table';
import { ScoreBreakdown } from '@/components/leads/score-breakdown';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import type { LeadListRow } from '@/lib/services/lead-list';

const sample: LeadListRow[] = [
  ['Clínica Exemplo Um', 85, 'new', 'social_only', '5.0', 83, true, 'Abordar por WhatsApp', 1],
  ['Escritório Exemplo Dois', 55, 'contacted', 'bad', '4.5', 40, false, 'Ligar na segunda', null],
  ['Estúdio Exemplo Três', 20, 'discarded', 'good', null, null, false, null, null],
].map(([name, score, status, site, rating, reviews, wa, next, priority], i) => ({
  id: `demo-${i}`,
  name: name as string,
  score: score as number,
  contactStatus: status as LeadListRow['contactStatus'],
  websiteStatus: site as LeadListRow['websiteStatus'],
  mapsRating: rating as string | null,
  mapsReviews: reviews as number | null,
  hasWhatsapp: wa as boolean,
  nextAction: next as string | null,
  lastContactAt: i === 1 ? new Date('2026-11-15T15:00:00Z') : null,
  priority: priority as number | null,
  doNotContact: i === 2,
  phone: null,
  placeId: null,
  nicheName: 'Clínicas odontológicas',
  regionLabel: 'PR - Curitiba - Xaxim',
  sortValue: '',
}));

/** Os componentes da fase 2 com dados fictícios (nada aqui toca o banco). */
export function LeadsDemo() {
  const [side, setSide] = useState(false);
  const [center, setCenter] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-label text-text-muted">
          Tabela virtualizada (edição inline em Status, Próxima ação e Prioridade)
        </p>
        <div className="[&>div]:h-64!">
          <LeadsTable
            initialRows={sample}
            initialCursor={null}
            qs=""
            columns={[
              'score',
              'name',
              'niche',
              'status',
              'site',
              'rating',
              'nextAction',
              'priority',
            ]}
            sort="score"
            dir="desc"
            onSort={() => {}}
            onOpen={() => setSide(true)}
            loadMore={async () => ({ rows: [], nextCursor: null })}
            update={async () => ({ ok: true })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-label text-text-muted">Estado vazio</p>
          <EmptyState
            icon={SearchX}
            title="Nenhum lead encontrado"
            action={<Button variant="secondary">Limpar filtros</Button>}
          >
            Ajuste a busca ou os filtros.
          </EmptyState>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-label text-text-muted">Skeleton</p>
          <Skeleton className="h-6 w-1/2" />
          <TableSkeleton rows={4} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-label text-text-muted">Score com detalhamento</p>
          <ScoreBreakdown
            score={85}
            weights={{
              website: 30,
              reputation: 20,
              marketing: 15,
              ticket: 15,
              directContact: 10,
              competition: 10,
            }}
            breakdown={{
              website: 30,
              reputation: 20,
              marketing: 0,
              ticket: 15,
              directContact: 10,
              competition: 10,
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-label text-text-muted">Abas</p>
          <LeadTabs
            tabs={[
              { id: 'a', label: 'Resumo', panel: <p className="text-body">Painel Resumo.</p> },
              {
                id: 'b',
                label: 'Interações',
                panel: <p className="text-body">Painel Interações.</p>,
              },
              { id: 'c', label: 'Dados', panel: <p className="text-body">Painel Dados.</p> },
            ]}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCenter(true)}>
              Abrir diálogo
            </Button>
            <Button variant="secondary" onClick={() => setSide(true)}>
              Abrir drawer
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={center}
        onClose={() => setCenter(false)}
        title="Diálogo"
        description="Esc fecha; o foco fica preso dentro."
      >
        <p className="text-body">Conteúdo do diálogo.</p>
      </Dialog>
      <Dialog open={side} onClose={() => setSide(false)} title="Drawer de detalhe" variant="side">
        <p className="text-body">
          No desktop, o lead abre assim; no celular, vira a rota cheia /leads/[id].
        </p>
      </Dialog>
    </div>
  );
}
