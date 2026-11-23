import { type Metadata } from 'next';
import { type ReactNode } from 'react';

import { Copyright } from '@/components/brand/copyright';
import { Logo } from '@/components/brand/logo';
import { DashboardDemo } from '@/components/design-system/dashboard-demo';
import { FunnelDemo } from '@/components/design-system/funnel-demo';
import { LeadsDemo } from '@/components/design-system/leads-demo';
import { ToastDemo } from '@/components/design-system/toast-demo';
import {
  Badge,
  contactStatusMeta,
  ScoreBadge,
  StatusBadge,
  SyncBadge,
} from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';

export const metadata: Metadata = { title: 'Design System' };

const THEMES = ['dark', 'light'] as const;
const colorTokens = [
  'bg',
  'surface-1',
  'surface-2',
  'surface-3',
  'border',
  'border-strong',
  'text',
  'text-muted',
  'text-subtle',
  'primary',
  'primary-hover',
  'focus-ring',
  'success',
  'warning',
  'danger',
  'logo-main',
  'logo-accent',
];
const groups = {
  'Score (fundo / texto)': [
    'score-high-bg',
    'score-high-fg',
    'score-mid-bg',
    'score-mid-fg',
    'score-low-bg',
    'score-low-fg',
  ],
  'Etapas do funil': [
    'stage-1',
    'stage-2',
    'stage-3',
    'stage-4',
    'stage-5',
    'stage-6',
    'stage-won',
    'stage-lost',
  ],
  'Gráficos': ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6'],
};
const scale = [
  ['Rótulo 12/16 · 500', 'text-label'],
  ['Tabela 13/18', 'text-table'],
  ['Corpo 14/20', 'text-body'],
  ['Destaque 16/24', 'text-lead'],
  ['Título de seção 20/28 · 600', 'text-section'],
  ['Título de página 24/32 · 600', 'text-page'],
  ['KPI 30/36 · 600', 'text-kpi'],
] as const;
const variants = ['primary', 'secondary', 'ghost', 'destructive', 'link'] as const;
const sizes = ['sm', 'md', 'lg'] as const;
const forced = {
  hover: {
    primary: 'bg-primary-hover',
    secondary: 'bg-surface-2',
    ghost: 'bg-surface-3',
    destructive: 'brightness-110',
    link: 'underline',
  },
  active: {
    primary: 'brightness-90',
    secondary: 'brightness-90',
    ghost: 'brightness-90',
    destructive: 'brightness-90',
    link: 'brightness-90',
  },
} as const;
const focusCls = 'outline-2 outline-offset-2 outline-focus-ring';
const icons = [
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-192.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'favicon.ico',
  'icon.svg',
];

const Section = ({
  id,
  title,
  children,
}: {
  children: ReactNode;
  id: string;
  title: string;
}): React.JSX.Element => (
  <section aria-labelledby={id} className="flex flex-col gap-4">
    <h2 id={id} className="text-section">
      {title}
    </h2>
    {children}
  </section>
);

/**
 * Mostra o conteúdo nos dois temas lado a lado (data-theme local, sem depender
 * do tema ativo).
 */
const BothThemes = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <div className="grid gap-4 md:grid-cols-2">
    {THEMES.map((t) => (
      <div
        key={t}
        data-theme={t}
        className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4 text-text"
      >
        <p className="text-label text-text-muted">{t === 'dark' ? 'Escuro' : 'Claro'}</p>
        {children}
      </div>
    ))}
  </div>
);

const Swatches = ({ tokens }: { tokens: string[] }): React.JSX.Element => (
  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {tokens.map((t) => (
      <li key={t} className="flex items-center gap-2">
        <span
          className="size-8 shrink-0 rounded-md border border-border-strong"
          style={{ background: `var(--${t})` }}
        />
        <code className="font-mono text-label">--{t}</code>
      </li>
    ))}
  </ul>
);

export default function DesignSystemPage(): React.JSX.Element {
  return (
    <div className="flex max-w-5xl flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-page">Design System</h1>
        <p className="text-body text-text-muted">
          Tokens e componentes do Lacus CRM. Seções novas entram junto com os componentes de cada
          fase.
        </p>
      </header>

      <Section id="marca" title="Marca">
        <BothThemes>
          <div className="flex flex-wrap items-center gap-6">
            <Logo variant="mark" size={48} />
            <Logo variant="lockup" size={40} />
          </div>
        </BothThemes>
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4">
          <p className="text-label text-text-muted">
            Tamanho mínimo: 16 px. Área de respeito: 10% do tamanho em todos os lados.
          </p>
          <div className="flex flex-wrap items-end gap-6">
            {[16, 24, 32, 48].map((s) => (
              <figure key={s} className="flex flex-col items-center gap-1">
                <Logo variant="mark" size={s} />
                <figcaption className="text-label text-text-subtle">{s} px</figcaption>
              </figure>
            ))}
            <Logo variant="lockup" size={16} />
          </div>
          <p className="text-label text-text-muted">Ícones gerados (public/brand):</p>
          <ul className="flex flex-wrap items-end gap-4">
            {icons.map((f) => (
              <li key={f} className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/brand/${f}`}
                  alt={`Ícone ${f}`}
                  width={64}
                  height={64}
                  className="size-16 rounded-md border border-border object-contain"
                />
                <code className="font-mono text-label text-text-subtle">{f}</code>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section id="cores" title="Cores">
        <BothThemes>
          <Swatches tokens={colorTokens} />
          {Object.entries(groups).map(([name, tokens]) => (
            <div key={name} className="flex flex-col gap-2">
              <p className="text-label text-text-muted">{name}</p>
              <Swatches tokens={tokens} />
            </div>
          ))}
        </BothThemes>
      </Section>

      <Section id="tipografia" title="Tipografia, forma e elevação">
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4">
          {scale.map(([label, cls]) => (
            <p key={cls} className={cls}>
              {label}
            </p>
          ))}
          <p className="font-mono text-body">Geist Mono: +55 41 99999-0000 · R$ 1.234,56</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['sm', 'rounded-sm'],
            ['md', 'rounded-md'],
            ['lg', 'rounded-lg'],
            ['xl', 'rounded-xl'],
          ].map(([r, cls]) => (
            <div
              key={r}
              className={`flex h-16 items-center justify-center border border-border-strong bg-surface-2 text-label ${cls}`}
            >
              radius {r}
            </div>
          ))}
          {[
            ['e1', 'shadow-e1'],
            ['e2', 'shadow-e2'],
            ['e3', 'shadow-e3'],
            ['drag', 'shadow-drag'],
          ].map(([e, cls]) => (
            <div
              key={e}
              className={`flex h-16 items-center justify-center rounded-lg bg-surface-2 text-label ${cls}`}
            >
              shadow {e}
            </div>
          ))}
        </div>
      </Section>

      <Section id="botoes" title="Botões">
        <div className="flex flex-col gap-4 overflow-x-auto rounded-lg border border-border bg-surface-1 p-4">
          {variants.map((v) => (
            <div key={v} className="flex flex-col gap-2">
              <p className="text-label text-text-muted">{v}</p>
              <div className="flex flex-wrap items-center gap-3">
                {sizes.map((s) => (
                  <Button key={s} variant={v} size={s}>
                    {s}
                  </Button>
                ))}
                <Button variant={v} className={forced.hover[v]}>
                  Hover
                </Button>
                <Button variant={v} className={forced.active[v]}>
                  Active
                </Button>
                <Button variant={v} className={focusCls}>
                  Focus
                </Button>
                <Button variant={v} disabled>
                  Desabilitado
                </Button>
                <Button variant={v} loading>
                  Salvando
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="campos" title="Campos">
        <div className="grid gap-4 rounded-lg border border-border bg-surface-1 p-4 sm:grid-cols-2">
          <Field
            label="Nome do negócio"
            placeholder="Ex.: Clínica Sorriso"
            help="Como aparece no Google Maps."
          />
          <Field
            label="Telefone"
            defaultValue="41 9999"
            error="Informe o telefone com DDD e 9 dígitos."
          />
          <Field label="Desabilitado" defaultValue="Não editável" disabled />
          <Field label="Somente leitura" defaultValue="ID 7f3a-91" readOnly />
        </div>
      </Section>

      <Section id="badges" title="Badges">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4">
          <div className="flex flex-wrap gap-2">
            <Badge>Neutro</Badge>
            {(Object.keys(contactStatusMeta) as Array<keyof typeof contactStatusMeta>).map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <ScoreBadge score={85} />
            <ScoreBadge score={55} />
            <ScoreBadge score={20} />
          </div>
          <div className="flex flex-wrap gap-2">
            <SyncBadge status="synced" />
            <SyncBadge status="pending" />
            <SyncBadge status="error" />
          </div>
        </div>
      </Section>

      <Section id="leads" title="Leads: tabela, drawer, abas e estados">
        <LeadsDemo />
      </Section>

      <Section id="funil" title="Funil: cartão, coluna e linha do tempo">
        <FunnelDemo />
      </Section>

      <Section id="painel" title="Painel: KPI, gráficos, linha do tempo e navegação inferior">
        <DashboardDemo />
      </Section>

      <Section id="toast" title="Toast">
        <ToastDemo />
      </Section>

      <Copyright />
    </div>
  );
}
