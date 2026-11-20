'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  markPendingAction,
  moveToTopAction,
  reorderQueueAction,
  skipQueueAction,
} from '@/app/(app)/fila/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { bareControl } from '@/components/ui/field';
import { formatWhen } from '@/lib/format';
import { cn } from '@/lib/utils';

export type QueueRow = {
  position: number;
  region: string;
  niche: string;
  status: 'pending' | 'done' | 'error';
  skipped: boolean;
  executedAt: string | null;
  leadsAdded: number;
  notes: string | null;
  lease: 'active' | 'expired' | null;
  leaseUntil: string | null;
};

const statusFilters = [
  ['', 'Todos'],
  ['pending', 'Pendente'],
  ['done', 'Concluído'],
  ['error', 'Com erro'],
  ['skipped', 'Pulado'],
] as const;

const label = (r: QueueRow) =>
  r.skipped ? (
    <Badge>Pulado</Badge>
  ) : r.status === 'done' ? (
    <Badge tone="success">Concluído</Badge>
  ) : r.status === 'error' ? (
    <Badge tone="danger">Com erro</Badge>
  ) : (
    <Badge tone="primary">Pendente</Badge>
  );

type Actions = {
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void;
};

function Row({ r, a, canDrag }: { r: QueueRow; a: Actions; canDrag: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: r.position,
    disabled: !canDrag,
    attributes: { roleDescription: 'item da fila reordenável' },
  });
  const cell = 'px-2 py-2 align-top';
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'border-t border-border',
        isDragging && 'bg-surface-2 opacity-70',
        r.skipped && 'text-text-muted',
      )}
      data-testid={`queue-row-${r.position}`}
    >
      <td className={cell}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            disabled={!canDrag}
            aria-label={`Reordenar ${r.region} ${r.niche}`}
            className="grid size-8 cursor-grab place-items-center rounded-md text-text-muted hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
          <span className="tabular">{r.position}</span>
        </div>
      </td>
      <td className={cell}>{r.region}</td>
      <td className={cell}>{r.niche}</td>
      <td className={cell}>{label(r)}</td>
      <td className={cn(cell, 'tabular')}>
        {r.executedAt ? formatWhen(new Date(r.executedAt)) : '—'}
      </td>
      <td className={cn(cell, 'tabular')}>{r.status === 'pending' ? '—' : r.leadsAdded}</td>
      <td className={cell}>{r.notes ?? '—'}</td>
      <td className={cell}>
        {r.lease === 'active' && r.leaseUntil ? (
          <Badge tone="warning">
            Em andamento até {formatWhen(new Date(r.leaseUntil)).slice(-5)}
          </Badge>
        ) : r.lease === 'expired' ? (
          <Badge>Lease vencido</Badge>
        ) : (
          '—'
        )}
      </td>
      <td className={cell}>
        <div className="flex flex-wrap gap-1">
          {r.status === 'pending' && !r.skipped && (
            <Button
              size="sm"
              variant="ghost"
              disabled={a.busy}
              onClick={() => a.run(() => moveToTopAction(r.position), 'Movido para o topo')}
            >
              Mover para o topo
            </Button>
          )}
          {r.status === 'pending' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={a.busy}
              onClick={() =>
                a.run(
                  () => skipQueueAction(r.position, !r.skipped),
                  r.skipped ? 'Item reativado' : 'Item pulado',
                )
              }
            >
              {r.skipped ? 'Reativar' : 'Pular'}
            </Button>
          )}
          {r.status !== 'pending' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={a.busy}
              onClick={() => a.run(() => markPendingAction(r.position), 'Marcado como pendente')}
            >
              Marcar como pendente
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Fila de prospecção (SPEC 6.5): ordem editável por arrastar (ou Espaço + setas) e ações por item. */
export function QueueTable({ rows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [items, setItems] = useState(rows);
  // novo `rows` do servidor (depois de router.refresh) substitui a ordem local
  const [seen, setSeen] = useState(rows);
  if (seen !== rows) {
    setSeen(rows);
    setItems(rows);
  }
  const [status, setStatus] = useState('');
  const [city, setCity] = useState('');
  const [niche, setNiche] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const cities = useMemo(
    () => [...new Set(rows.map((r) => r.region.split(' - ')[1] ?? ''))].sort(),
    [rows],
  );
  const niches = useMemo(() => [...new Set(rows.map((r) => r.niche))].sort(), [rows]);
  const filtered = !!(status || city || niche);
  const shown = items.filter(
    (r) =>
      (!status || (status === 'skipped' ? r.skipped : !r.skipped && r.status === status)) &&
      (!city || r.region.split(' - ')[1] === city) &&
      (!niche || r.niche === niche),
  );

  const run: Actions['run'] = (fn, ok) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? 'Erro');
      toast.success(ok);
      router.refresh();
    });

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((r) => r.position === e.active.id);
    const to = items.findIndex((r) => r.position === e.over!.id);
    const next = arrayMove(items, from, to);
    setItems(next);
    run(() => reorderQueueAction(next.map((r) => r.position)), 'Ordem salva');
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-label">
          Status
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={bareControl}
          >
            {statusFilters.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label">
          Cidade
          <select
            aria-label="Cidade"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={bareControl}
          >
            <option value="">Todas</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label">
          Nicho
          <select
            aria-label="Nicho"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className={bareControl}
          >
            <option value="">Todos</option>
            {niches.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        {filtered && (
          <p className="text-label text-text-muted">Limpe os filtros para arrastar e reordenar.</p>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <DndContext
          id="fila-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={items.map((r) => r.position)}
            strategy={verticalListSortingStrategy}
          >
            <table className="w-full min-w-[60rem] text-left text-body">
              <thead className="bg-surface-1 text-label text-text-muted">
                <tr>
                  {[
                    'Ordem',
                    'Região',
                    'Nicho',
                    'Status',
                    'Executado em',
                    'Leads adicionados',
                    'Observações',
                    'Lease',
                    '',
                  ].map((h) => (
                    <th key={h} scope="col" className="px-2 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <Row
                    key={r.position}
                    r={r}
                    a={{ busy: pending, run }}
                    canDrag={!filtered && !pending}
                  />
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={9} className="px-2 py-6 text-center text-text-muted">
                      Nenhum item na fila.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
