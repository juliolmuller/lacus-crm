import { cn } from '@/lib/utils';

const MIN_SIZE = 16;
const GRID = [40, 100, 160, 220];
// A célula 3-3 (x=160, y=160) é o destaque, desenhado à parte.
const CELLS = GRID.flatMap((y) => GRID.map((x) => [x, y] as const)).filter(
  ([x, y]) => !(x === 160 && y === 160),
);

function Mark({ size, decorative }: { decorative: boolean; size: number }): React.JSX.Element {
  const a11y = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ 'role': 'img', 'aria-label': 'Lacus CRM' } as const);

  return (
    <svg viewBox="0 0 300 300" width={size} height={size} className="shrink-0" {...a11y}>
      <rect
        x="10"
        y="10"
        width="280"
        height="280"
        rx="40"
        fill="none"
        stroke="var(--logo-main)"
        strokeWidth="20"
      />
      {CELLS.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="40"
          height="40"
          rx="10"
          fill="var(--logo-main)"
        />
      ))}
      <rect x="160" y="160" width="40" height="40" rx="10" fill="var(--logo-accent)" />
    </svg>
  );
}

/**
 * `mark`: só o símbolo. `lockup`: símbolo + "Lacus CRM". Área de respeito = 10%
 * do tamanho.
 */
export function Logo({
  variant = 'mark',
  size = 24,
  className,
}: {
  className?: string;
  size?: number;
  variant?: 'lockup' | 'mark';
}): React.JSX.Element {
  const s = Math.max(MIN_SIZE, size);
  const style = { padding: s * 0.1 };

  if (variant === 'mark') {
    return (
      <span className={cn('inline-flex', className)} style={style}>
        <Mark size={s} decorative={false} />
      </span>
    );
  }

  return (
    <span
      className={cn('inline-flex items-center text-text', className)}
      style={{ ...style, gap: s * 0.3 }}
    >
      <Mark size={s} decorative />
      <span className="font-semibold leading-none tracking-tight" style={{ fontSize: s * 0.7 }}>
        Lacus CRM
      </span>
    </span>
  );
}
