import { eq } from 'drizzle-orm';

import { type Db, schema } from '@/lib/db';
import { computeScore, scoreBand, type ScoreSettings } from '@/lib/score';
import { scoreThresholds, scoreWeights } from '@/lib/validation/settings';

import { saveSetting } from './followup-settings';
import { getScoreSettings } from './leads';

const { leads, niches } = schema;

/**
 * Quantos leads trocam de faixa (verde/amarelo/vermelho) se `next` valesse no
 * lugar do que está salvo.
 */
export async function previewBandChanges(
  db: Db,
  next: ScoreSettings,
): Promise<{ changed: number; total: number }> {
  const cur = await getScoreSettings(db);
  const rows = await db
    .select({ lead: leads, niche: niches })
    .from(leads)
    .leftJoin(niches, eq(niches.id, leads.nicheId));
  const changed = rows.filter(
    ({ lead, niche }) =>
      scoreBand(lead.score ?? 0, cur.thresholds)
      !== scoreBand(computeScore(lead, niche, next).score, next.thresholds),
  ).length;

  return { changed, total: rows.length };
}

/**
 * Valida e grava pesos e limiares (a mudança nos leads só vale ao Recalcular).
 */
export async function saveScoreSettings(db: Db, next: unknown): Promise<void> {
  const s = next as ScoreSettings;
  const weights = scoreWeights.parse(s.weights);
  const thresholds = scoreThresholds.parse(s.thresholds);

  if (thresholds.yellow >= thresholds.green)
    throw new Error('O limiar amarelo precisa ser menor que o verde');

  await saveSetting(db, 'score_weights', weights);
  await saveSetting(db, 'score_thresholds', thresholds);
}
