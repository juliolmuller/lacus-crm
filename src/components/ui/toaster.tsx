'use client';

import { Toaster as Sonner } from 'sonner';

// Vida de 5 s (8 s com ação, via `duration` no toast); sonner já usa aria-live="polite".
export function Toaster(): React.JSX.Element {
  return (
    <Sonner
      duration={5000}
      style={
        {
          '--normal-bg': 'var(--surface-2)',
          '--normal-text': 'var(--text)',
          '--normal-border': 'var(--border-strong)',
          'zIndex': 60,
        } as React.CSSProperties
      }
    />
  );
}
