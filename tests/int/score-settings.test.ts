import { describe, expect, it } from 'vitest';

import { createLead, recomputeAllScores, resolveRegion } from '@/lib/services/leads';
import { previewBandChanges, saveScoreSettings } from '@/lib/services/score-settings';
import { settingDefaults } from '@/lib/validation/settings';

import { inTx, schema } from './db';

const base = {
  weights: settingDefaults.score_weights,
  thresholds: settingDefaults.score_thresholds,
};

async function world(tx: Parameters<Parameters<typeof inTx>[0]>[0]): Promise<void> {
  const [niche] = await tx
    .insert(schema.niches)
    .values({ name: 'Nicho score', ticket: 'high' })
    .returning();
  const region = await resolveRegion(tx, {
    state: 'PR',
    city: 'Curitiba',
    neighborhood: null,
    label: 'PR - Curitiba',
  });

  // site ruim + WhatsApp + nicho alto = 30 + 15 + 10 = 55 (faixa amarela)
  await createLead(tx, {
    values: {
      name: 'Lead faixa',
      phone: '(41) 99999-1234',
      hasWhatsapp: true,
      websiteStatus: 'bad',
    },
    nicheId: niche!.id,
    regionId: region.id,
  });
}

describe('score: prévia e recálculo', () => {
  it('conta quem muda de faixa sem gravar e valida os limiares', async () => {
    await inTx(async (tx) => {
      await world(tx);
      expect(await previewBandChanges(tx, base)).toEqual({ changed: 0, total: 1 });

      const lower = { ...base, thresholds: { ...base.thresholds, green: 50 } }; // 55 passa a verde

      expect(await previewBandChanges(tx, lower)).toEqual({ changed: 1, total: 1 });
      await expect(
        saveScoreSettings(tx, { ...lower, thresholds: { ...lower.thresholds, yellow: 60 } }),
      ).rejects.toThrow();
      await saveScoreSettings(tx, {
        weights: { ...base.weights, website: 40 },
        thresholds: base.thresholds,
      });
      expect(await recomputeAllScores(tx)).toBe(1); // 40 + 15 + 10 = 65
    });
  });
});
