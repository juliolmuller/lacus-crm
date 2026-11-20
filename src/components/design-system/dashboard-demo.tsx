import { ArrowRightLeft, Bot, MessageSquare } from 'lucide-react';
import { HBarChart, Sparkline } from '@/components/dashboard/charts';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { Timeline } from '@/components/dashboard/timeline';
import { BottomNavBar } from '@/components/layout/bottom-nav';

const funnel = [
  { name: 'A diagnosticar', value: 18, text: '18 · R$ 4.500,00' },
  { name: 'A abordar', value: 11, text: '11 · R$ 6.200,00' },
  { name: 'Abordado', value: 7, text: '7 · R$ 5.100,00' },
  { name: 'Em conversa', value: 4, text: '4 · R$ 7.800,00' },
  { name: 'Em negociação', value: 2, text: '2 · R$ 9.000,00' },
  { name: 'Ganho', value: 1, text: '1 · R$ 3.000,00', fill: 'var(--success)' },
  { name: 'Perdido', value: 0, text: '0 · R$ 0,00', fill: 'var(--danger)' },
];
const usage = [4, 12, 30, 28, 0, 0, 22, 30, 18, 9, 30, 25, 31, 15].map((requests, i) => ({
  name: `${String(i + 6).padStart(2, '0')}/11`,
  requests,
}));
const at = (h: number) => new Date(Date.UTC(2026, 10, 19, h));

/** KPI card, gráfico, linha do tempo e navegação inferior com dados fictícios (SPEC 7.3). */
export function DashboardDemo() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <h3 className="text-label font-semibold text-text-muted">KPI card</h3>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Leads novos" value={52} hint="nos últimos 30 dias" />
          <KpiCard label="Taxa de resposta" value="38%" hint="5 de 13 abordados" />
          <KpiCard label="Valor em aberto" value="R$ 28.600,00" hint="Ponderado R$ 9.240,00" />
          <KpiCard
            label="Follow-ups atrasados"
            value={3}
            hint="vencidos antes de agora"
            tone="danger"
          />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-label font-semibold text-text-muted">Gráfico (barras e linha)</h3>
        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <HBarChart
            data={funnel}
            label="Negociações por etapa (dados fictícios)"
            labelWidth={150}
            nameWidth={112}
          />
        </div>
        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <Sparkline data={usage} budget={30} label="Requisições por dia (dados fictícios)" />
          <p className="text-label text-text-muted">Tracejado: orçamento diário (30)</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-label font-semibold text-text-muted">Linha do tempo</h3>
        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <Timeline
            label="Atividade fictícia"
            items={[
              {
                id: 'a',
                Icon: MessageSquare,
                title: 'WhatsApp · Clínica Exemplo',
                detail: 'Enviada por mim: primeiro contato',
                at: at(15),
              },
              {
                id: 'b',
                Icon: ArrowRightLeft,
                title: 'Clínica Exemplo',
                detail: 'A abordar → Abordado (por regra)',
                at: at(14),
              },
              { id: 'c', Icon: Bot, title: 'Lead criado pelo MCP: Estúdio Modelo', at: at(12) },
            ]}
          />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-label font-semibold text-text-muted">Navegação inferior (mobile)</h3>
        <div className="mx-auto w-full max-w-sm overflow-hidden rounded-lg border border-border">
          <BottomNavBar pathname="/funil" label="Principal (demonstração)" />
        </div>
      </div>
    </div>
  );
}
