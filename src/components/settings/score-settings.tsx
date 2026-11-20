'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  previewScoreAction,
  recomputeScoresAction,
  saveScoreAction,
} from '@/app/(app)/configuracoes/actions';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { ScoreSettings } from '@/lib/score';

const WEIGHTS = [
  ['website', 'Site (ausente, só rede social ou ruim)'],
  ['reputation', 'Reputação (nota e avaliações mínimas)'],
  ['marketing', 'Marketing (anúncios ou Instagram ativo)'],
  ['ticket', 'Ticket do nicho'],
  ['directContact', 'Contato direto (WhatsApp)'],
  ['competition', 'Concorrência local forte'],
] as const;

/** Pesos e limiares do score (SPEC 4.6): prévia ao vivo de quem muda de faixa, Salvar e Recalcular. */
export function ScoreSettingsForm({ initial }: { initial: ScoreSettings }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [preview, setPreview] = useState<{ changed: number; total: number } | null>(null);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const r = await previewScoreAction(s);
      if (mine === seq.current && r.ok) setPreview({ changed: r.changed, total: r.total });
    }, 400);
    return () => clearTimeout(t);
  }, [s]);

  const num = (v: string) => (v === '' ? 0 : Number(v));
  const setW = (k: keyof ScoreSettings['weights'], v: string) =>
    setS({ ...s, weights: { ...s.weights, [k]: num(v) } });
  const setT = (k: 'green' | 'yellow' | 'minRating' | 'minReviews', v: string) =>
    setS({ ...s, thresholds: { ...s.thresholds, [k]: num(v) } });
  const setTicket = (k: 'alto' | 'medio' | 'baixo', v: string) =>
    setS({
      ...s,
      thresholds: { ...s.thresholds, ticketPoints: { ...s.thresholds.ticketPoints, [k]: num(v) } },
    });
  const total = Object.values(s.weights).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-label text-text">Pesos (pontos)</legend>
        {WEIGHTS.map(([k, label]) => (
          <Field
            key={k}
            label={label}
            type="number"
            min={0}
            step="any"
            value={s.weights[k]}
            onChange={(e) => setW(k, e.target.value)}
          />
        ))}
      </fieldset>
      <p className="text-label text-text-muted">
        Soma dos pesos: {total} (o score é limitado a 100).
      </p>
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-label text-text">Faixas e reputação</legend>
        <Field
          label="Verde a partir de"
          type="number"
          min={0}
          max={100}
          value={s.thresholds.green}
          onChange={(e) => setT('green', e.target.value)}
        />
        <Field
          label="Amarelo a partir de"
          type="number"
          min={0}
          max={100}
          value={s.thresholds.yellow}
          onChange={(e) => setT('yellow', e.target.value)}
        />
        <Field
          label="Nota mínima"
          type="number"
          min={0}
          max={5}
          step="0.1"
          value={s.thresholds.minRating}
          onChange={(e) => setT('minRating', e.target.value)}
        />
        <Field
          label="Avaliações mínimas"
          type="number"
          min={0}
          value={s.thresholds.minReviews}
          onChange={(e) => setT('minReviews', e.target.value)}
        />
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-label text-text">
          Pontos por ticket do nicho (escala do peso)
        </legend>
        {(['alto', 'medio', 'baixo'] as const).map((k) => (
          <Field
            key={k}
            label={`Ticket ${k === 'medio' ? 'médio' : k}`}
            type="number"
            min={0}
            step="any"
            value={s.thresholds.ticketPoints[k]}
            onChange={(e) => setTicket(k, e.target.value)}
          />
        ))}
      </fieldset>
      <p role="status" data-testid="score-preview" className="text-body">
        {preview
          ? `${preview.changed} de ${preview.total} leads mudam de faixa com estes valores.`
          : 'Calculando prévia…'}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await saveScoreAction(s);
              if (!r.ok) return void toast.error(r.error);
              toast.success('Pesos salvos. Clique em Recalcular para aplicar aos leads.');
              router.refresh();
            })
          }
        >
          Salvar
        </Button>
        <Button
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await recomputeScoresAction();
              if (!r.ok) return void toast.error(r.error);
              toast.success(`${r.changed} lead(s) recalculado(s)`);
              router.refresh();
            })
          }
        >
          Recalcular
        </Button>
      </div>
    </div>
  );
}
