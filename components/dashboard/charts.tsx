'use client';

import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export type BarDatum = {
  name: string;
  value: number;
  /** rótulo direto no fim da barra (ex.: "12 · R$ 3.000,00") */
  text: string;
  /** cor da marca; padrão: série 1 */
  fill?: string;
};

const barConfig = { value: { label: 'Total', color: 'var(--chart-1)' } } satisfies ChartConfig;
const lineConfig = {
  requests: { label: 'Requisições', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** Resumo para leitores de tela: o gráfico é uma imagem e a tabela traz os mesmos números. */
function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[0]}>
            {r.map((c, i) =>
              i ? (
                <td key={i}>{c}</td>
              ) : (
                <th key={i} scope="row">
                  {c}
                </th>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Barras horizontais de uma série só (magnitude): rótulo direto, grade discreta, uma cor. */
export function HBarChart({
  data,
  label,
  labelWidth = 56,
  nameWidth = 120,
}: {
  data: BarDatum[];
  /** o que o gráfico mostra; vira o texto alternativo e a legenda da tabela */
  label: string;
  /** espaço à direita para o rótulo direto */
  labelWidth?: number;
  nameWidth?: number;
}) {
  const height = data.length * 34 + 8;
  return (
    <figure className="flex flex-col">
      <div role="img" aria-label={label} className="w-full">
        <ChartContainer config={barConfig} className="aspect-auto w-full" style={{ height }}>
          <BarChart
            data={data}
            layout="vertical"
            accessibilityLayer={false}
            margin={{ top: 0, right: labelWidth, bottom: 0, left: 0 }}
            barCategoryGap={8}
          >
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="name"
              width={nameWidth}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => {
                const max = Math.floor(nameWidth / 6.5);
                return v.length > max ? `${v.slice(0, max - 1)}…` : v;
              }}
            />
            <ChartTooltip
              cursor={{ fill: 'var(--surface-3)', opacity: 0.6 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-label shadow-e2">
                    <p className="font-medium text-text">
                      {(payload[0]!.payload as BarDatum).name}
                    </p>
                    <p className="tabular text-text-muted">
                      {(payload[0]!.payload as BarDatum).text}
                    </p>
                  </div>
                ) : null
              }
            />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              barSize={16}
              minPointSize={3}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill ?? 'var(--color-value)'} />
              ))}
              <LabelList
                dataKey="text"
                content={({ x, y, width, height, index }) => (
                  <text
                    x={Number(x) + Number(width) + 6}
                    y={Number(y) + Number(height) / 2}
                    dy="0.35em"
                    className="tabular fill-text text-label"
                  >
                    {data[Number(index)]?.text}
                  </text>
                )}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
      <DataTable
        caption={label}
        head={['Item', 'Valor']}
        rows={data.map((d) => [d.name, d.text])}
      />
    </figure>
  );
}

/** Linha de 14 dias com o orçamento diário tracejado; o tooltip mostra dia e valor. */
export function Sparkline({
  data,
  budget,
  label,
}: {
  data: { name: string; requests: number }[];
  budget: number;
  label: string;
}) {
  const top = Math.max(budget, ...data.map((d) => d.requests), 1);
  return (
    <figure className="flex flex-col">
      <div role="img" aria-label={label} className="w-full">
        <ChartContainer config={lineConfig} className="aspect-auto h-16 w-full">
          <LineChart
            data={data}
            accessibilityLayer={false}
            margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          >
            <XAxis dataKey="name" hide />
            <YAxis hide domain={[0, top]} />
            <ReferenceLine y={budget} stroke="var(--danger)" strokeDasharray="3 3" />
            <ChartTooltip
              cursor={{ stroke: 'var(--border-strong)' }}
              content={<ChartTooltipContent />}
            />
            <Line
              type="monotone"
              dataKey="requests"
              stroke="var(--color-requests)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--surface-1)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      </div>
      <DataTable
        caption={label}
        head={['Dia', 'Requisições']}
        rows={data.map((d) => [d.name, String(d.requests)])}
      />
    </figure>
  );
}
