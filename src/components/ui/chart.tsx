'use client';

import { type ComponentProps, createContext, type ReactNode, use, useId } from 'react';
import { ResponsiveContainer, Tooltip, type TooltipContentProps } from 'recharts';

import { cn } from '@/lib/utils';

// Base: componente `chart` do shadcn/ui (recharts 3), enxuto e com os tokens deste projeto.
export type ChartConfig = Record<string, { color: string; label: string }>;

const ChartContext = createContext<ChartConfig | null>(null);
const useChartConfig = (): ChartConfig => use(ChartContext) ?? {};

/**
 * Define `--color-<chave>` por gráfico; as marcas usam
 * `fill="var(--color-chave)"`.
 */
export function ChartContainer({
  config,
  className,
  children,
  ...props
}: { children: ReactNode; config: ChartConfig } & ComponentProps<'div'>): React.JSX.Element {
  const id = `chart-${useId().replace(/:/g, '')}`;
  const vars = Object.entries(config)
    .map(([k, v]) => `--color-${k}: ${v.color};`)
    .join(' ');

  return (
    <ChartContext value={config}>
      <div
        data-chart={id}
        className={cn(
          'flex aspect-video w-full justify-center text-label',
          '[&_.recharts-cartesian-axis-tick_text]:fill-text-muted',
          '[&_.recharts-cartesian-grid_line]:stroke-border',
          '[&_.recharts-layer]:outline-hidden [&_.recharts-surface]:outline-hidden',
          className,
        )}
        {...props}
      >
        <style>{`[data-chart=${id}] { ${vars} }`}</style>
        <ResponsiveContainer initialDimension={{ width: 320, height: 200 }}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </ChartContext>
  );
}

export const ChartTooltip = Tooltip;

const formatPtBr = (v: number): string => v.toLocaleString('pt-BR');

/**
 * Tooltip no estilo do projeto: rótulo, bolinha da cor da série, valor com
 * tabular-nums.
 */
export function ChartTooltipContent({
  active,
  payload,
  label,
  valueFormatter = formatPtBr,
}: Partial<TooltipContentProps<number, string>> & {
  valueFormatter?: (v: number) => string;
}): null | React.JSX.Element {
  const config = useChartConfig();

  if (!active || !payload?.length) return null;

  return (
    <div className="grid min-w-32 gap-1.5 rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-label shadow-e2">
      {label !== undefined && <p className="font-medium text-text">{String(label)}</p>}
      {payload.map((p) => {
        const key = String(p.dataKey ?? p.name);

        return (
          <div key={key} className="flex items-center gap-2 text-text-muted">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: `var(--color-${key})` }}
            />
            <span className="flex-1">{config[key]?.label ?? p.name}</span>
            <span className="tabular font-medium text-text">{valueFormatter(Number(p.value))}</span>
          </div>
        );
      })}
    </div>
  );
}
