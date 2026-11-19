import { ScoreBadge } from '@/components/ui/badge';
import type { ScoreBreakdown as Breakdown, ScoreWeights } from '@/lib/score';

const LABEL: Record<keyof Breakdown, string> = {
  website: 'Site fraco ou ausente',
  reputation: 'Boa reputação no Maps',
  marketing: 'Anuncia ou tem Instagram ativo',
  ticket: 'Ticket do nicho',
  directContact: 'Contato direto (WhatsApp ou decisor)',
  competition: 'Concorrência local com site forte',
};

/** Score com o detalhamento por critério (pontos ganhos / peso). */
export function ScoreBreakdown({
  score,
  breakdown,
  weights,
}: {
  score: number;
  breakdown: Breakdown | null;
  weights: ScoreWeights;
}) {
  return (
    <section
      aria-labelledby="score-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 id="score-title" className="text-lead">
          Score
        </h3>
        <ScoreBadge score={score} />
      </div>
      {breakdown ? (
        <ul className="flex flex-col gap-2">
          {(Object.keys(LABEL) as (keyof Breakdown)[]).map((k) => {
            const got = breakdown[k] ?? 0;
            const max = weights[k];
            return (
              <li key={k} className="flex flex-col gap-1">
                <div className="flex justify-between text-body">
                  <span>{LABEL[k]}</span>
                  <span className="tabular text-text-muted">
                    {Number.isInteger(got) ? got : got.toFixed(1)} / {max}
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-surface-3"
                  role="presentation"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${max ? Math.min(100, (got / max) * 100) : 0}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-body text-text-muted">Detalhamento ainda não calculado.</p>
      )}
    </section>
  );
}
