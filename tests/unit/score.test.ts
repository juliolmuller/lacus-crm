import { describe, expect, it } from 'vitest';

import { computeScore, scoreBand, type ScoreLead } from '@/lib/score';
import { settingDefaults } from '@/lib/validation/settings';

const settings = {
  weights: settingDefaults.score_weights,
  thresholds: settingDefaults.score_thresholds,
};
const base: ScoreLead = {
  websiteStatus: 'good',
  mapsRating: null,
  mapsReviews: null,
  hasActiveAds: false,
  instagramActive: false,
  hasWhatsapp: false,
  decisionMakerContact: null,
  strongLocalCompetition: false,
};
const score = (l: Partial<ScoreLead>, ticket: 'high' | 'low' | 'medium' | null = null): number =>
  computeScore({ ...base, ...l }, { ticket }, settings).score;

describe('computeScore', () => {
  it('lead fictício da SPEC 4.6 = 85', () => {
    const r = computeScore(
      {
        websiteStatus: 'social_only',
        mapsRating: 5.0,
        mapsReviews: 83,
        hasActiveAds: false,
        instagramActive: false,
        hasWhatsapp: true,
        decisionMakerContact: null,
        strongLocalCompetition: true,
      },
      { ticket: 'high' },
      settings,
    );

    expect(r.score).toBe(85);
    expect(r.breakdown).toEqual({
      website: 30,
      reputation: 20,
      marketing: 0,
      ticket: 15,
      directContact: 10,
      competition: 10,
    });
  });

  it('limite da nota: 3,9 não pontua, 4,0 pontua', () => {
    expect(score({ mapsRating: 3.9, mapsReviews: 50 })).toBe(0);
    expect(score({ mapsRating: '4.0', mapsReviews: 50 })).toBe(20);
  });

  it('limite das avaliações: 19 não pontua, 20 pontua', () => {
    expect(score({ mapsRating: 5, mapsReviews: 19 })).toBe(0);
    expect(score({ mapsRating: 5, mapsReviews: 20 })).toBe(20);
  });

  it('cada critério isolado', () => {
    expect(score({ websiteStatus: 'none' })).toBe(30);
    expect(score({ websiteStatus: 'bad' })).toBe(30);
    expect(score({ websiteStatus: 'unknown' })).toBe(0);
    expect(score({ hasActiveAds: true })).toBe(15);
    expect(score({ instagramActive: true })).toBe(15);
    expect(score({ hasActiveAds: true, instagramActive: true })).toBe(15);
    expect(score({ hasWhatsapp: true })).toBe(10);
    expect(score({ decisionMakerContact: ' 41 99999-0000 ' })).toBe(10);
    expect(score({ decisionMakerContact: '  ' })).toBe(0);
    expect(score({ strongLocalCompetition: true })).toBe(10);
  });

  it('ticket: alto 15, médio 7,5 (arredonda para 8), baixo 0, sem nicho 0', () => {
    expect(score({}, 'high')).toBe(15);
    expect(score({}, 'medium')).toBe(8);
    expect(score({}, 'low')).toBe(0);
    expect(computeScore(base, null, settings).score).toBe(0);
  });

  it('escala o ticket pelo peso editado e limita a 0..100', () => {
    const w = { ...settings.weights, ticket: 30 };

    expect(computeScore(base, { ticket: 'medium' }, { ...settings, weights: w }).score).toBe(15);

    const all = {
      website: 60,
      reputation: 60,
      marketing: 60,
      ticket: 60,
      directContact: 60,
      competition: 60,
    };

    expect(
      computeScore(
        { ...base, websiteStatus: 'none' },
        { ticket: 'high' },
        { ...settings, weights: all },
      ).score,
    ).toBe(100);
  });

  it('faixas: 70 verde, 69 amarelo, 40 amarelo, 39 vermelho', () => {
    const t = settings.thresholds;

    expect([70, 69, 40, 39].map((n) => scoreBand(n, t))).toEqual(['high', 'mid', 'mid', 'low']);
  });
});
