import { describe, expect, it } from 'vitest';

import { leadInput } from '@/lib/validation/upsert';

const base = {
  name: 'Clínica Alfa',
  nicheName: 'Nicho',
  regionLabel: 'PR - Curitiba - Xaxim',
};

describe('leadInput: placeId e mapsUrl', () => {
  it('aceita valores reais', () => {
    expect(
      leadInput.safeParse({
        ...base,
        placeId: 'ChIJ-aqyto_73JQR7x-oGSKSbQw',
        mapsUrl: 'https://maps.google.com/?cid=895532576073588719',
      }).success,
    ).toBe(true);
  });

  it('recusa valores provisórios', () => {
    for (const placeId of ['PLACEHOLDER', 'placeholder-1', 'TBD', 'n/a', 'null', 'XXXX'])
      expect(leadInput.safeParse({ ...base, placeId }).success, placeId).toBe(false);
    for (const mapsUrl of ['PLACEHOLDER', 'maps.google.com/?cid=1', 'javascript:alert(1)'])
      expect(leadInput.safeParse({ ...base, mapsUrl }).success, mapsUrl).toBe(false);
  });
});
