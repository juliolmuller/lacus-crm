import { z } from 'zod';

const text = z.string().trim().min(1).max(2000);

/** Lead que a rotina de prospecção envia (SPEC 9.1/9.2). Só campos de máquina; os humanos nunca são tocados. */
export const leadInput = z.object({
  id: z.uuid().optional(),
  name: text.max(200),
  nicheName: text.max(100),
  regionLabel: text.max(200).describe('"PR - Curitiba - Xaxim" ou "Xaxim, Curitiba/PR"'),
  // placeId e mapsUrl não têm ferramenta de correção: recusa valores provisórios (já houve "PLACEHOLDER")
  placeId: text
    .max(300)
    .refine((v) => !/placeholder|provis|^(?:tbd|todo|n\/?a|null|undefined|x+)$/i.test(v), {
      message: 'placeId deve ser o `id` real da Places API, sem valores provisórios',
    })
    .optional(),
  phone: text.max(50).optional(),
  address: text.optional(),
  mapsRating: z.number().min(0).max(5).optional(),
  mapsReviews: z.number().int().min(0).optional(),
  mapsUrl: z
    .url({ protocol: /^https?$/ })
    .max(2000)
    .optional(),
  mapsCategory: text.max(200).optional(),
  digitalSignals: text.optional(),
  websiteUrl: text.optional(),
  websiteStatus: z.enum(['none', 'social_only', 'bad', 'good', 'unknown']).optional(),
  instagram: text.max(300).optional(),
  businessSummary: text.optional(),
  pitch: text.optional(),
  hasWhatsapp: z.boolean().optional(),
  hasActiveAds: z.boolean().optional(),
  instagramActive: z.boolean().optional(),
});
export type LeadInput = z.infer<typeof leadInput>;

export const upsertInput = z.object({
  runId: z.string().trim().min(1).max(200),
  queuePosition: z.number().int().optional(),
  leads: z.array(leadInput).min(1).max(20),
});
export type UpsertInput = z.infer<typeof upsertInput>;
