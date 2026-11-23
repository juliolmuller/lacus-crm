import { createHash } from 'node:crypto';

import { normalizeName } from '@/lib/normalize';

export const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');

/**
 * Chaves da suppression_list (SPEC 4.3): telefone E.164 e nome+região, ambos em
 * SHA-256.
 */
export const suppressionKeys = (l: {
  nameNormalized: string;
  phoneE164?: null | string;
  regionLabel: string;
}): { nameRegionHash: string; phoneE164Hash: null | string } => ({
  phoneE164Hash: l.phoneE164 ? sha256(l.phoneE164) : null,
  nameRegionHash: sha256(`${l.nameNormalized}|${normalizeName(l.regionLabel)}`),
});
