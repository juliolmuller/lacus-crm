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
import { Archive, ArchiveRestore, GripVertical, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  archiveStageAction,
  reorderStagesAction,
  saveStageAction,
} from '@/app/(app)/configuracoes/actions';
import { Button } from '@/components/ui/button';
import { bareControl } from '@/components/ui/field';
import { stageColors } from '@/lib/funnel/status-sync';
import { contactStatuses, statusLabel } from '@/lib/leads/labels';
import { cn } from '@/lib/utils';

export type StageRow = {
  id: number;
  name: string;
  color: string;
  defaultProbability: number | null;
  leadStatus: (typeof contactStatuses)[number] | null;
  isWon: boolean;
  isLost: boolean;
  archived: boolean;
  open: number;
};

const dot: Record<string, string> = {
  'stage-1': 'bg-stage-1',
  'stage-2': 'bg-stage-2',
  'stage-3': 'bg-stage-3',
  'stage-4': 'bg-stage-4',
  'stage-5': 'bg-stage-5',
  'stage-6': 'bg-stage-6',
  'stage-won': 'bg-stage-won',
  'stage-lost': 'bg-stage-lost',
};

/** Uma linha por etapa: editar e salvar, arquivar e arrastar (ou Espaço + setas) para reordenar. */
function Row({ s, onChanged }: { s: StageRow; onChanged: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: s.id,
    attributes: { roleDescription: 'etapa reordenável' },
  });
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? 'Erro');
      toast.success(ok);
      onChanged();
    });
  const tag = s.isWon ? 'Ganho' : s.isLost ? 'Perdido' : null;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-md border border-border bg-surface-2 p-3',
        isDragging && 'opacity-60',
        s.archived && 'opacity-70',
      )}
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const prob = String(f.get('prob')).trim();
          run(
            () =>
              saveStageAction(s.id, {
                name: f.get('name'),
                color: f.get('color'),
                defaultProbability: prob ? Number(prob) : null,
                leadStatus: f.get('leadStatus') || null,
              }),
            'Etapa salva',
          );
        }}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reordenar ${s.name}`}
          className="grid size-9 cursor-grab place-items-center rounded-md text-text-muted hover:bg-surface-3"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <span
          aria-hidden
          className={cn('mb-3 size-3 rounded-full', dot[s.color] ?? 'bg-stage-1')}
        />
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-label">
          Nome
          <input
            name="name"
            defaultValue={s.name}
            required
            maxLength={40}
            className={bareControl}
          />
        </label>
        <label className="flex flex-col gap-1 text-label">
          Cor
          <select name="color" defaultValue={s.color} className={bareControl}>
            {stageColors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-24 flex-col gap-1 text-label">
          Prob. (%)
          <input
            name="prob"
            type="number"
            min={0}
            max={100}
            defaultValue={s.defaultProbability ?? ''}
            className={bareControl}
          />
        </label>
        <label className="flex flex-col gap-1 text-label">
          Status do lead
          <select name="leadStatus" defaultValue={s.leadStatus ?? ''} className={bareControl}>
            <option value="">Não altera</option>
            {contactStatuses.map((c) => (
              <option key={c} value={c}>
                {statusLabel[c]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" loading={pending}>
          Salvar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() =>
            run(
              () => archiveStageAction(s.id, !s.archived),
              s.archived ? 'Etapa restaurada' : 'Etapa arquivada',
            )
          }
        >
          {s.archived ? (
            <ArchiveRestore className="size-4" aria-hidden />
          ) : (
            <Archive className="size-4" aria-hidden />
          )}
          {s.archived ? 'Restaurar' : 'Arquivar'}
        </Button>
      </form>
      <p className="mt-2 text-label text-text-muted">
        {tag ? `Etapa de ${tag}. ` : ''}
        {s.open} {s.open === 1 ? 'negociação' : 'negociações'}
        {s.archived ? ' · arquivada (some do quadro)' : ''}
      </p>
    </li>
  );
}

export function StageSettings({ stages }: { stages: StageRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(stages);
  const [prev, setPrev] = useState(stages);
  if (stages !== prev) {
    setPrev(stages);
    setRows(stages);
  }
  const [adding, startAdd] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const before = rows;
    const next = arrayMove(
      rows,
      rows.findIndex((r) => r.id === active.id),
      rows.findIndex((r) => r.id === over.id),
    );
    setRows(next);
    const r = await reorderStagesAction(next.map((x) => x.id)).catch(() => ({
      ok: false as const,
      error: 'Sem conexão',
    }));
    if (!r.ok) {
      setRows(before);
      return void toast.error(r.error);
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <DndContext
        id="etapas"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-3">
            {rows.map((s) => (
              <Row
                key={`${s.id}-${s.name}-${s.color}-${s.archived}`}
                s={s}
                onChanged={() => router.refresh()}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <form
        className="flex flex-wrap items-end gap-3 rounded-md border border-dashed border-border-strong p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          startAdd(async () => {
            const r = await saveStageAction(null, {
              name: f.get('name'),
              color: 'stage-5',
              defaultProbability: null,
              leadStatus: null,
            });
            if (!r.ok) return void toast.error(r.error);
            toast.success('Etapa criada antes de Ganho');
            form.reset();
            router.refresh();
          });
        }}
      >
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-label">
          Nova etapa
          <input
            name="name"
            required
            maxLength={40}
            placeholder="Ex.: Proposta enviada"
            className={bareControl}
          />
        </label>
        <Button type="submit" size="sm" variant="secondary" loading={adding}>
          <Plus className="size-4" aria-hidden />
          Adicionar etapa
        </Button>
      </form>
    </div>
  );
}
