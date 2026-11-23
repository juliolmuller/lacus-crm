/**
 * Normalização pura (SPEC 14): telefone, nome e "Cidade / bairro".
 */

/**
 * Telefone BR → E.164 (+55DDNNNNNNNNN). Sem DDD ou com tamanho inválido → null.
 */
export function normalizePhone(raw: null | string | undefined): null | string {
  let d = (raw ?? '').replace(/\D/g, '');

  if (!d) return null;

  if (d.startsWith('00')) d = d.slice(2);

  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);

  const ddd = Number(d.slice(0, 2));
  const validLength = d.length === 10 || (d.length === 11 && d[2] === '9');

  return validLength && ddd >= 11 ? `+55${d}` : null;
}

/**
 * Minúsculas, sem acentos, só letras e números separados por um espaço.
 */
export const normalizeName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export interface ParsedPlace {
  city: string;
  label: string;
  neighborhood: null | string;
  state: string;
}

/**
 * "Xaxim, Curitiba/PR" → { PR, Curitiba, Xaxim, "PR - Curitiba - Xaxim" }.
 * "Curitiba/PR" → "PR - Curitiba". Aceita "PR - Curitiba - Xaxim" (o próprio
 * label). Inválido → null.
 */
export function parseCityNeighborhood(raw: null | string | undefined): null | ParsedPlace {
  const v = (raw ?? '').trim().replace(/\s+/g, ' ');

  if (!v) return null;

  const build = (
    state: string,
    city: string,
    neighborhood: null | string,
  ): { city: string; label: string; neighborhood: null | string; state: string } => ({
    state: state.toUpperCase(),
    city,
    neighborhood,
    label: `${state.toUpperCase()} - ${city}${neighborhood ? ` - ${neighborhood}` : ''}`,
  });
  const label = /^([A-Z]{2}) - ([^-]+?)(?: - (.+))?$/i.exec(v);

  if (label) return build(label[1]!, label[2]!.trim(), label[3]?.trim() || null);

  // eslint-disable-next-line regexp/no-super-linear-backtracking -- runs on one short place label, never on unbounded input
  const slash = /^(?:(.+?)\s*,\s*)?(.+?)\s*\/\s*([A-Z]{2})$/i.exec(v);

  if (slash) return build(slash[3]!, slash[2]!.trim(), slash[1]?.trim() || null);

  return null;
}

/**
 * Inverso de parseCityNeighborhood, para exportar no formato da planilha.
 */
export const formatCityNeighborhood = (r: {
  city: string;
  neighborhood: null | string;
  state: string;
}): string => `${r.neighborhood ? `${r.neighborhood}, ` : ''}${r.city}/${r.state}`;
