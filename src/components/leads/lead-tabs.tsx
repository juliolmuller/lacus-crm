'use client';

import { type KeyboardEvent, type ReactNode, useId, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Abas (WAI-ARIA): setas e Home/End; os painéis chegam prontos do servidor.
 */
export function LeadTabs({
  tabs,
}: {
  tabs: Array<{ id: string; label: string; panel: ReactNode }>;
}): React.JSX.Element {
  const baseId = useId();
  const [active, setActive] = useState(tabs[0]!.id);
  const onKey = (e: KeyboardEvent): void => {
    const i = tabs.findIndex((t) => t.id === active);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];

    if (next === undefined) return;

    e.preventDefault();

    const t = tabs[(next + tabs.length) % tabs.length]!;

    setActive(t.id);
    document.getElementById(`${baseId}-tab-${t.id}`)?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* eslint-disable-next-line jsx-a11y-x/interactive-supports-focus -- focus lives on the tabs inside (roving arrows) */}
      <div
        role="tablist"
        aria-label="Seções do lead"
        onKeyDown={onKey}
        className="flex gap-1 overflow-x-auto border-b border-border pb-px"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`${baseId}-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={active === t.id}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => setActive(t.id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-body whitespace-nowrap',
              active === t.id
                ? 'border-primary text-text'
                : 'border-transparent text-text-muted hover:text-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`${baseId}-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${t.id}`}
          hidden={active !== t.id}
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
