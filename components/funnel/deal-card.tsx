'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MessageCircle } from 'lucide-react';
import { ScoreBadge } from '@/components/ui/badge';
import { formatMoney, formatWhen } from '@/lib/format';
import { whatsappUrl } from '@/lib/leads/links';
import type { BoardCard } from '@/lib/services/deals';
import { cn } from '@/lib/utils';

export type StageOption = { id: number; name: string };

/** Só o visual: serve ao cartão da coluna e ao DragOverlay. */
export function CardBody({ card }: { card: BoardCard }) {
  return (
    <>
      <p className="truncate text-body font-medium">{card.leadName}</p>
      <p className="truncate text-label text-text-muted">
        {card.niche} · {card.place}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="tabular text-body">{formatMoney(card.value)}</span>
        <ScoreBadge score={card.score} />
      </div>
      <p className="text-label text-text-muted">
        {card.nextFollowupAt ? (
          <span className={cn(card.followupOverdue && 'font-semibold text-danger-text')}>
            Follow-up: {formatWhen(new Date(card.nextFollowupAt))}
          </span>
        ) : (
          'Follow-up: —'
        )}{' '}
        · {card.daysInStage} {card.daysInStage === 1 ? 'dia' : 'dias'} na etapa
      </p>
    </>
  );
}

type Props = {
  card: BoardCard;
  stages: StageOption[];
  dragging: boolean; // algum cartão está sendo arrastado
  onOpen: (id: string) => void;
  onMoveTo: (id: string, stageId: number) => void;
};

export function DealCard({ card, stages, dragging, onOpen, onMoveTo }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    attributes: { roleDescription: 'cartão do funil' },
  });
  const wa = whatsappUrl(card.whatsapp);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-md border border-border bg-surface-2 shadow-e1',
        isDragging && 'opacity-40',
      )}
    >
      {/* O corpo é o arrastável (mouse, toque e teclado); os controles ficam fora dele, sem aninhar foco. */}
      <div
        {...attributes}
        {...listeners}
        className="flex cursor-grab flex-col gap-1.5 rounded-t-md p-3 outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
        onClick={() => onOpen(card.id)}
        onKeyDown={(e) => {
          listeners?.onKeyDown?.(e);
          if (e.key === 'Enter' && !dragging) onOpen(card.id);
        }}
      >
        <CardBody card={card} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp de ${card.leadName}`}
            className="grid size-8 place-items-center rounded-md text-text-muted hover:bg-surface-3 hover:text-text"
          >
            <MessageCircle className="size-4" aria-hidden />
          </a>
        ) : (
          <span />
        )}
        <select
          aria-label={`Mover ${card.leadName} para…`}
          value=""
          onChange={(e) => onMoveTo(card.id, Number(e.target.value))}
          className="h-8 max-w-40 rounded-md border border-border-strong bg-surface-3 px-2 text-label text-text"
        >
          <option value="" disabled>
            Mover para…
          </option>
          {stages
            .filter((s) => s.id !== card.stageId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </div>
    </li>
  );
}
