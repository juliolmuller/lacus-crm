'use client';

import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  description?: string;
  onClose: () => void;
  open: boolean;
  title: string;
  /**
   * "side" é o drawer lateral (desktop); "center" é o diálogo comum.
   */
  variant?: 'center' | 'side';
  /**
   * Diálogo `center` mais largo, para formulários em colunas.
   */
  wide?: boolean;
}

/**
 * <dialog> nativo: foco preso, Esc fecha, aria-modal e backdrop de graça.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  variant = 'center',
  wide,
  children,
}: Props): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;

    if (!d) return;

    if (open && !d.open) d.showModal();

    if (!open && d.open) d.close();
  }, [open]);

  return (
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-noninteractive-element-interactions -- backdrop click; <dialog> already closes on Escape
    <dialog
      ref={ref}
      onClose={(e) => {
        e.stopPropagation(); // o evento "close" borbulha na árvore do React: diálogos aninhados não podem fechar o pai
        onClose();
      }}

      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={cn(
        'm-0 max-h-none max-w-none overflow-hidden border-border bg-surface-1 p-0 text-text shadow-e3 backdrop:bg-black/50',
        variant === 'center' && 'm-auto max-h-[90dvh] rounded-lg border',
        variant === 'center'
          && (wide ? 'w-[min(44rem,calc(100vw-2rem))]' : 'w-[min(32rem,calc(100vw-2rem))]'),
        variant === 'side'
          && 'ml-auto h-dvh w-[min(44rem,100vw)] border-l backdrop:backdrop-blur-[1px]',
      )}
    >
      {open && (
        <div className="flex h-full max-h-[inherit] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-border p-4">
            <div className="min-w-0">
              <h2 className="text-section">{title}</h2>
              {description && <p className="text-body text-text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="rounded-md p-1.5 text-text-muted hover:bg-surface-3 hover:text-text"
            >
              <X className="size-5" aria-hidden />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
