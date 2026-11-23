'use client';

import {
  type Announcements,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  type UniqueIdentifier,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Handshake } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { moveDealAction } from '@/app/(app)/funil/actions';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney } from '@/lib/format';
import { type BoardCard, type BoardStage } from '@/lib/services/deals';
import { cn } from '@/lib/utils';

import { CloseDialogs, type Closing } from './close-dialogs';
import { CardBody, DealCard } from './deal-card';

type Stage = Pick<BoardStage, 'color' | 'count' | 'id' | 'isLost' | 'isWon' | 'name' | 'total'>;
type Cols = Record<string, string[]>;

const colId = (stageId: number): string => `col-${stageId}`;
const stageOf = (id: string): number => Number(id.slice(4));
// classes estáticas: o Tailwind só gera o que aparece literalmente
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

const group = (stages: Stage[], cards: BoardCard[]): Cols =>
  Object.fromEntries(
    stages.map((s) => [colId(s.id), cards.filter((c) => c.stageId === s.id).map((c) => c.id)]),
  );

/**
 * Tira o cartão de onde está e o põe em `to`, depois de `prevId` (ou antes de
 * `nextId`, ou no fim).
 */
function place(
  cols: Cols,
  id: string,
  to: string,
  prevId: null | string,
  nextId: null | string,
): Cols {
  const next: Cols = Object.fromEntries(
    Object.entries(cols).map(([k, v]) => [k, v.filter((x) => x !== id)]),
  );
  const list = next[to] ?? [];
  const at =
    prevId && list.includes(prevId)
      ? list.indexOf(prevId) + 1
      : nextId && list.includes(nextId)
        ? list.indexOf(nextId)
        : list.length;

  next[to] = [...list.slice(0, at), id, ...list.slice(at)];

  return next;
}

const collision: CollisionDetection = (args) => {
  const p = pointerWithin(args);

  return p.length ? p : rectIntersection(args);
};

function Column({
  stage,
  ids,
  cards,
  stages,
  dragging,
  onOpen,
  onMoveTo,
}: {
  cards: Map<string, BoardCard>;
  dragging: boolean;
  ids: string[];
  onMoveTo: (id: string, stageId: number) => void;
  onOpen: (id: string) => void;
  stage: Stage;
  stages: Array<{ id: number; name: string }>;
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: colId(stage.id) });
  const closed = stage.isWon || stage.isLost;

  return (
    <section
      id={colId(stage.id)}
      aria-label={`${stage.name}, ${stage.count} negociações`}
      className={cn(
        'flex w-[85vw] shrink-0 snap-center flex-col rounded-lg border border-border bg-surface-1 md:w-72',
        isOver && 'border-primary',
      )}
    >
      <header className="flex flex-col gap-0.5 border-b border-border p-3">
        <h2 className="flex items-center gap-2 text-section">
          <span
            aria-hidden
            className={cn('size-2.5 rounded-full', dot[stage.color] ?? 'bg-stage-1')}
          />
          <span className="truncate">{stage.name}</span>
          <span className="ml-auto rounded-full bg-surface-3 px-2 text-label text-text-muted">
            {stage.count}
          </span>
        </h2>
        <p className="tabular text-label text-text-muted">{formatMoney(stage.total)}</p>
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          aria-label={`Cartões de ${stage.name}`}
          className="flex max-h-[calc(100dvh-17rem)] min-h-24 flex-col gap-2 overflow-y-auto p-2"
        >
          {ids
            .filter((id) => cards.has(id)) // outro cartão pode ter sumido do servidor durante um movimento
            .map((id) => (
              <DealCard
                key={id}
                card={cards.get(id)!}
                stages={stages}
                dragging={dragging}
                onOpen={onOpen}
                onMoveTo={onMoveTo}
              />
            ))}
          {!ids.length && (
            <li className="grid flex-1 place-items-center p-4 text-center text-label text-text-muted">
              {closed ? 'Solte aqui para encerrar' : 'Nenhuma negociação'}
            </li>
          )}
        </ul>
      </SortableContext>
      {closed && stage.count > ids.length && (
        <p className="border-t border-border p-2 text-center text-label text-text-muted">
          Mostrando as {ids.length} mais recentes de {stage.count}
        </p>
      )}
    </section>
  );
}

export function FunnelBoard({
  stages,
  cards,
}: {
  cards: BoardCard[];
  stages: Stage[];
}): React.JSX.Element {
  const router = useRouter();
  const byId = new Map(cards.map((c) => [c.id, c]));
  const stageById = new Map(stages.map((s) => [colId(s.id), s]));
  const [cols, setCols] = useState<Cols>(() => group(stages, cards));
  const [source, setSource] = useState(cards);
  const [saving, setSaving] = useState(0); // movimentos ainda indo para o servidor

  if (cards !== source) {
    // dados novos do servidor (depois de router.refresh): a verdade volta a ser o banco. Com um
    // movimento em andamento eles são anteriores a ele e o desfariam na tela; o persist() termina
    // com um refresh que traz o estado certo.
    setSource(cards);

    if (!saving) setCols(group(stages, cards));
  }

  const [active, setActive] = useState<null | string>(null);
  const [closing, setClosing] = useState<Closing | null>(null);
  const [current, setCurrent] = useState(0);
  const snapshotRef = useRef<Cols>(cols);
  const lastDragRef = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const colsRef = useRef(cols);

  useEffect(() => {
    colsRef.current = cols;
  });

  /**
   * ← → vão direto à coluna vizinha (o padrão do dnd-kit escolhe a própria
   * coluna primeiro); ↑ ↓ reordenam.
   */
  const coordinateGetter: KeyboardCoordinateGetter = (event, args) => {
    if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight')
      return sortableKeyboardCoordinates(event, args);

    event.preventDefault();

    const keys = stages.map((s) => colId(s.id));
    const from = Object.keys(colsRef.current).find((k) =>
      colsRef.current[k]!.includes(String(args.active)),
    );
    const to = keys[keys.indexOf(from ?? '') + (event.code === 'ArrowLeft' ? -1 : 1)];
    const rect = to ? args.context.droppableRects.get(to) : undefined;

    return rect ? { x: rect.left + 8, y: rect.top + 8 } : undefined;
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  const containerOf = (c: Cols, id: UniqueIdentifier): string | undefined =>
    String(id) in c ? String(id) : Object.keys(c).find((k) => c[k]!.includes(String(id)));
  const nameOf = (id: UniqueIdentifier): string => byId.get(String(id))?.leadName ?? 'cartão';
  const where = (id: UniqueIdentifier): string => {
    const k = containerOf(cols, id);

    if (!k) return 'fora das colunas';

    const idx = String(id) in cols ? cols[k]!.length + 1 : cols[k]!.indexOf(String(id)) + 1;

    return `coluna ${stageById.get(k)?.name}, posição ${idx} de ${cols[k]!.length}`;
  };
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Pegou o cartão ${nameOf(a.id)}, na ${where(a.id)}.`,
    onDragOver: ({ active: a, over }) =>
      over ? `Cartão ${nameOf(a.id)} sobre a ${where(over.id)}.` : undefined,
    onDragEnd: ({ active: a, over }) =>
      over
        ? `Cartão ${nameOf(a.id)} solto na ${where(a.id)}.`
        : `Cartão ${nameOf(a.id)} solto fora das colunas.`,
    onDragCancel: ({ active: a }) =>
      `Movimento cancelado. O cartão ${nameOf(a.id)} voltou ao lugar.`,
  };

  const open = (id: string): void => {
    if (Date.now() - lastDragRef.current > 250) router.push(`/funil?deal=${id}`);
  };

  /**
   * Salva a posição do cartão em `cols`; erro (ou rede caída) devolve o quadro
   * ao estado anterior.
   */
  async function persist(
    id: string,
    next: Cols,
    rollback: Cols,
    undo?: { nextId: null | string; prevId: null | string; to: string },
  ): Promise<undefined> {
    const to = containerOf(next, id)!;
    const list = next[to]!;
    const i = list.indexOf(id);

    setSaving((n) => n + 1);

    const r = await moveDealAction({
      dealId: id,
      stageId: stageOf(to),
      prevId: list[i - 1] ?? null,
      nextId: list[i + 1] ?? null,
    }).catch(() => ({ ok: false as const, error: 'Sem conexão. A negociação voltou ao lugar.' }));

    setSaving((n) => n - 1);

    if (!r.ok) {
      setCols(rollback);

      toast.error(r.error);

      return;
    }

    if (undo)
      toast(`${nameOf(id)}: movida para ${stageById.get(to)?.name}`, {
        duration: 8000,
        action: {
          label: 'Desfazer',
          onClick: () => {
            const back = place(next, id, undo.to, undo.prevId, undo.nextId);

            setCols(back);
            persist(id, back, next);
          },
        },
      });

    router.refresh();
  }

  /**
   * Menu "Mover para…": vai para o fim da etapa escolhida.
   */
  const moveTo = (id: string, stageId: number): void => {
    const to = colId(stageId);
    const target = stageById.get(to);

    if (!target) return;

    if (target.isWon || target.isLost) return setClosing(closeFor(id, target));

    const from = containerOf(cols, id)!;
    const o = cols[from]!.indexOf(id);
    const list = cols[to]!;
    const next = place(cols, id, to, list.at(-1) ?? null, null);

    setCols(next);
    persist(id, next, cols, {
      to: from,
      prevId: cols[from]![o - 1] ?? null,
      nextId: cols[from]![o + 1] ?? null,
    });
  };

  const closeFor = (id: string, target: Stage): Closing => ({
    dealId: id,
    title: byId.get(id)?.leadName ?? '',
    kind: target.isWon ? 'won' : 'lost',
    value: byId.get(id)?.value ?? null,
  });

  const onDragStart = (e: DragStartEvent): void => {
    snapshotRef.current = cols;
    setActive(String(e.active.id));
  };

  const onDragOver = ({ active: a, over }: DragOverEvent): void => {
    if (!over) return;

    const from = containerOf(cols, a.id);
    const to = containerOf(cols, over.id);

    if (!from || !to || from === to || stageById.get(to)?.isWon || stageById.get(to)?.isLost)
      return;

    const below =
      a.rect.current.translated && a.rect.current.translated.top > over.rect.top + over.rect.height;

    setCols((prev) => {
      const items = prev[to]!;
      const overIndex = items.indexOf(String(over.id));
      const at = overIndex >= 0 ? overIndex + (below ? 1 : 0) : items.length;

      return {
        ...prev,
        [from]: prev[from]!.filter((x) => x !== String(a.id)),
        [to]: [...items.slice(0, at), String(a.id), ...items.slice(at)],
      };
    });
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent): void => {
    lastDragRef.current = Date.now();
    setActive(null);

    const id = String(a.id);
    const start = snapshotRef.current;

    if (!over) return setCols(start);

    const to = containerOf(cols, over.id);
    const target = to ? stageById.get(to) : undefined;

    if (target?.isWon || target?.isLost) {
      setCols(start); // o cartão só muda de lugar depois do diálogo

      return setClosing(closeFor(id, target));
    }

    const at = containerOf(cols, id);

    if (!at) return setCols(start);

    let next = cols;

    if (at === to && String(over.id) !== id && !(String(over.id) in cols)) {
      const list = cols[at]!;

      next = { ...cols, [at]: arrayMove(list, list.indexOf(id), list.indexOf(String(over.id))) };
    }

    setCols(next);

    const from = containerOf(start, id)!;
    const was = start[from]!.indexOf(id);
    const moved = from !== at;

    if (!moved && next[at]!.indexOf(id) === was) return; // soltou onde estava

    persist(
      id,
      next,
      start,
      moved
        ? { to: from, prevId: start[from]![was - 1] ?? null, nextId: start[from]![was + 1] ?? null }
        : undefined,
    );
  };

  const onScroll = (): void => {
    const el = scrollerRef.current;

    if (el) setCurrent(Math.round(el.scrollLeft / (el.scrollWidth / stages.length)));
  };
  const goTo = (i: number): undefined | void =>
    document
      .getElementById(colId(stages[i]!.id))
      ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

  const activeCard = active ? byId.get(active) : null;
  const total = cards.length;

  if (!stages.length || (!total && stages.every((s) => !s.count)))
    return (
      <EmptyState icon={Handshake} title="Nenhuma negociação ainda">
        Abra um lead em Leads e use “Criar negociação” para começar o funil.
      </EmptyState>
    );

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <nav aria-label="Etapas" className="flex gap-2 overflow-x-auto pb-1 md:hidden">
        {stages.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-current={i === current ? 'true' : undefined}
            onClick={() => goTo(i)}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-label',
              i === current
                ? 'border-primary bg-primary/15 text-text'
                : 'border-border bg-surface-1 text-text-muted',
            )}
          >
            {s.name}
            <span className="tabular">{s.count}</span>
          </button>
        ))}
      </nav>
      <DndContext
        id="funil"
        sensors={sensors}
        collisionDetection={collision}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'Para mover o cartão, pressione espaço. Use as setas para mudar de posição ou de coluna, espaço para soltar e Esc para cancelar. Enter abre os detalhes.',
          },
        }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          lastDragRef.current = Date.now();
          setActive(null);
          setCols(snapshotRef.current);
        }}
      >
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className={cn(
            'flex items-start gap-3 overflow-x-auto pb-3',
            active ? 'snap-none' : 'snap-x snap-mandatory md:snap-none',
          )}
        >
          {stages.map((s) => (
            <Column
              key={s.id}
              stage={s}
              ids={cols[colId(s.id)] ?? []}
              cards={byId}
              stages={stages}
              dragging={active !== null}
              onOpen={open}
              onMoveTo={moveTo}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard && (
            <div className="flex cursor-grabbing flex-col gap-1.5 rounded-md border border-primary bg-surface-2 p-3 shadow-e3">
              <CardBody card={activeCard} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <CloseDialogs
        key={closing ? `${closing.dealId}-${closing.kind}` : 'none'}
        closing={closing}
        onClose={() => setClosing(null)}
        onDone={() => {
          setClosing(null);
          router.refresh();
        }}
      />
    </div>
  );
}
