import type { z } from 'zod';
import type { scoreThresholds, scoreWeights } from '@/lib/validation/settings';

export type ScoreWeights = z.infer<typeof scoreWeights>;
export type ScoreThresholds = z.infer<typeof scoreThresholds>;
export type ScoreSettings = { weights: ScoreWeights; thresholds: ScoreThresholds };

export type ScoreLead = {
  websiteStatus: 'none' | 'social_only' | 'bad' | 'good' | 'unknown' | null;
  mapsRating: number | string | null;
  mapsReviews: number | null;
  hasActiveAds: boolean | null;
  instagramActive: boolean | null;
  hasWhatsapp: boolean | null;
  decisionMakerContact: string | null;
  strongLocalCompetition: boolean | null;
};
export type ScoreNiche = { ticket: 'alto' | 'medio' | 'baixo' | null } | null;

export type ScoreBreakdown = Record<keyof ScoreWeights, number>;

/** SPEC 4.6. Pura: o mesmo cálculo serve ao app, à importação e ao REST/MCP. */
export function computeScore(lead: ScoreLead, niche: ScoreNiche, s: ScoreSettings) {
  const { weights: w, thresholds: t } = s;
  const rating = lead.mapsRating == null ? null : Number(lead.mapsRating);
  const maxTicket = Math.max(t.ticketPoints.alto, t.ticketPoints.medio, t.ticketPoints.baixo);
  const ticketRaw = niche?.ticket ? t.ticketPoints[niche.ticket] : 0;
  const breakdown: ScoreBreakdown = {
    website: ['none', 'social_only', 'bad'].includes(lead.websiteStatus ?? '') ? w.website : 0,
    reputation:
      rating != null &&
      rating >= t.minRating &&
      lead.mapsReviews != null &&
      lead.mapsReviews >= t.minReviews
        ? w.reputation
        : 0,
    marketing: lead.hasActiveAds || lead.instagramActive ? w.marketing : 0,
    ticket: maxTicket > 0 ? (ticketRaw / maxTicket) * w.ticket : 0,
    directContact: lead.hasWhatsapp || lead.decisionMakerContact?.trim() ? w.directContact : 0,
    competition: lead.strongLocalCompetition ? w.competition : 0,
  };
  const sum = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score: Math.min(100, Math.max(0, Math.round(sum))), breakdown };
}

export const scoreBand = (score: number, t: Pick<ScoreThresholds, 'green' | 'yellow'>) =>
  score >= t.green ? 'high' : score >= t.yellow ? 'mid' : 'low';
