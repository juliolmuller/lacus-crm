import { Construction } from 'lucide-react';

/**
 * Página provisória das rotas que as próximas fases preenchem.
 */
export function Placeholder({ title, phase }: { phase: number; title: string }): React.JSX.Element {
  return (
    <section className="flex max-w-xl flex-col items-start gap-3">
      <h1 className="text-page">{title}</h1>
      <div className="flex w-full flex-col items-center gap-2 rounded-lg border border-border bg-surface-1 p-8 text-center shadow-e1">
        <Construction className="size-10 text-text-subtle" aria-hidden />
        <p className="text-lead">Em construção</p>
        <p className="text-body text-text-muted">Esta tela chega na fase {phase} do projeto.</p>
      </div>
    </section>
  );
}
