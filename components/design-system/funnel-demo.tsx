'use client';

import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { DealTimeline } from '@/components/funnel/timeline';
import { DealCard } from '@/components/funnel/deal-card';
import type { BoardCard } from '@/lib/services/deals';

const card = (
  i: number,
  name: string,
  value: string | null,
  score: number,
  whatsapp: string | null,
): BoardCard => ({
  id: `demo-${i}`,
  leadId: `lead-${i}`,
  stageId: 1,
  title: name,
  leadName: name,
  niche: 'Clínicas odontológicas',
  place: 'Xaxim',
  value,
  score,
  whatsapp,
  daysInStage: i * 3,
  status: 'open',
});
const cards = [
  card(0, 'Clínica Exemplo Um', '1800.00', 85, '+5541999990000'),
  card(1, 'Estúdio Exemplo Dois', null, 55, null),
];
const stages = [
  { id: 1, name: 'A diagnosticar' },
  { id: 2, name: 'A abordar' },
];

/** Coluna do funil e linha do tempo com dados fictícios (nada aqui toca o banco). */
export function FunnelDemo() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <p className="text-label text-text-muted">
          Coluna com cartões (arrastar, setas ou “Mover para…”)
        </p>
        <DndContext id="ds-funil">
          <SortableContext items={cards.map((c) => c.id)}>
            <ul
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-2"
              aria-label="Exemplo de coluna"
            >
              {cards.map((c) => (
                <DealCard
                  key={c.id}
                  card={c}
                  stages={stages}
                  dragging={false}
                  onOpen={() => {}}
                  onMoveTo={() => {}}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-label text-text-muted">Linha do tempo unificada</p>
        <DealTimeline
          items={[
            {
              kind: 'stage',
              at: new Date('2026-11-18T15:00:00Z'),
              id: 'h1',
              from: 'A diagnosticar',
              to: 'Abordado',
              source: 'rule',
            },
            {
              kind: 'interaction',
              at: new Date('2026-11-18T14:55:00Z'),
              id: 'i1',
              row: {
                id: 'i1',
                leadId: 'l',
                dealId: 'd',
                type: 'whatsapp',
                direction: 'outbound',
                outcome: null,
                summary: 'Mensagem 1 enviada',
                body: null,
                occurredAt: new Date('2026-11-18T14:55:00Z'),
                templateId: null,
                createdBy: 'user',
                createdAt: new Date('2026-11-18T14:55:00Z'),
              },
            },
          ]}
        />
      </div>
    </div>
  );
}
