import { normalizeName } from '@/lib/normalize';

import {
  type ContactStatus,
  contactStatuses,
  siteLabel,
  statusLabel,
  ticketLabel,
  type WebsiteStatus,
  websiteStatuses,
} from './labels';

/**
 * Os 39 campos da planilha, na ordem das colunas A–AM. `key` é a coluna do
 * banco.
 */
type Kind =
  | 'bool' // "Sim" / vazio
  | 'boolNull' // "Sim" / "Não" / vazio = desconhecido
  | 'date'
  | 'datetime'
  | 'id'
  | 'int'
  | 'long'
  | 'money'
  | 'niche'
  | 'place'
  | 'rating'
  | 'score'
  | 'site'
  | 'status'
  | 'text'
  | 'ticket';
export interface Column {
  header: string;
  key: string;
  kind: Kind;
}

export const COLUMNS: readonly Column[] = [
  { header: 'ID', key: 'id', kind: 'id' },
  { header: 'Nome do negócio', key: 'name', kind: 'text' },
  { header: 'Nicho', key: 'niche', kind: 'niche' },
  { header: 'Cidade / bairro', key: 'place', kind: 'place' },
  { header: 'Telefone', key: 'phone', kind: 'text' },
  { header: 'WhatsApp', key: 'hasWhatsapp', kind: 'bool' },
  { header: 'E-mail', key: 'email', kind: 'text' },
  { header: 'Contato direto com o decisor', key: 'decisionMakerContact', kind: 'text' },
  { header: 'Site atual', key: 'websiteUrl', kind: 'text' },
  { header: 'Situação do site', key: 'websiteStatus', kind: 'site' },
  { header: 'Instagram', key: 'instagram', kind: 'text' },
  { header: 'Outras redes sociais', key: 'otherSocials', kind: 'text' },
  { header: 'Link no Google Maps', key: 'mapsUrl', kind: 'text' },
  { header: 'Nota no Maps', key: 'mapsRating', kind: 'rating' },
  { header: 'Nº de avaliações no Maps', key: 'mapsReviews', kind: 'int' },
  { header: 'Dono responde avaliações', key: 'ownerRepliesReviews', kind: 'boolNull' },
  { header: 'Reclamações (Maps ou Reclame Aqui)', key: 'complaints', kind: 'long' },
  { header: 'Data de abertura (CNPJ)', key: 'cnpjOpenedAt', kind: 'date' },
  { header: 'Anos de mercado', key: 'yearsInBusiness', kind: 'int' },
  { header: 'Porte (MEI, ME, EPP)', key: 'companySize', kind: 'text' },
  { header: 'Anúncios ativos (Meta ou Google)', key: 'hasActiveAds', kind: 'bool' },
  { header: 'Instagram atualizado', key: 'instagramActive', kind: 'bool' },
  { header: 'Concorrência local com site forte', key: 'strongLocalCompetition', kind: 'bool' },
  { header: 'Ticket do nicho', key: 'ticket', kind: 'ticket' },
  { header: 'Score (0 a 100)', key: 'score', kind: 'score' },
  { header: 'Status do contato', key: 'contactStatus', kind: 'status' },
  { header: 'Data do contato', key: 'lastContactAt', kind: 'datetime' },
  { header: 'Canal', key: 'channel', kind: 'text' },
  { header: 'Resposta ou objeção', key: 'responseOrObjection', kind: 'long' },
  { header: 'Próxima ação', key: 'nextAction', kind: 'text' },
  { header: 'Valor da proposta (R$)', key: 'proposalValue', kind: 'money' },
  { header: 'Observações', key: 'notes', kind: 'long' },
  { header: 'Data de inclusão', key: 'includedAt', kind: 'date' },
  { header: 'Place ID (Google Maps)', key: 'placeId', kind: 'text' },
  { header: 'Endereço (Maps)', key: 'address', kind: 'text' },
  { header: 'Categoria no Maps', key: 'mapsCategory', kind: 'text' },
  { header: 'Sinais de interesse digital', key: 'digitalSignals', kind: 'long' },
  { header: 'Resumo do negócio', key: 'businessSummary', kind: 'long' },
  { header: 'Argumento de abordagem', key: 'pitch', kind: 'long' },
] as const;
export const HEADERS = COLUMNS.map((c) => c.header);

/**
 * Mapeia cada cabeçalho do arquivo ao campo canônico (igualdade sem
 * acento/caixa); o resto fica null.
 */
export function autoMapHeaders(csvHeaders: string[]): Record<string, null | string> {
  const byNorm = new Map(HEADERS.map((h) => [normalizeName(h), h]));

  return Object.fromEntries(csvHeaders.map((h) => [h, byNorm.get(normalizeName(h)) ?? null]));
}

/**
 * Aplica o mapeamento: devolve a linha com os cabeçalhos canônicos (só os
 * mapeados).
 */
export function applyMapping(
  row: Record<string, string>,
  mapping: Record<string, null | string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [from, to] of Object.entries(mapping))
    if (to && from in row) out[to] = row[from] ?? '';

  return out;
}

const TZ_OFFSET = '-03:00'; // America/Sao_Paulo (sem horário de verão desde 2019)

export function parseBool(raw: string): boolean {
  const v = normalizeName(raw);

  if (['sim', 's', 'true', '1', 'x', 'yes'].includes(v)) return true;

  if (['', 'nao', 'n', 'false', '0', 'no'].includes(v)) return false;

  throw new Error(`"${raw}" não é Sim/Não`);
}

/**
 * Dd/mm/aaaa ou aaaa-mm-dd → "aaaa-mm-dd" (valida o calendário).
 */
export function parseDate(raw: string): string {
  const v = raw.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2})?$/.exec(v);
  const [y, mo, d] = m
    ? [m[3]!, m[2]!, m[1]!]
    : (/^(\d{4})-(\d{2})-(\d{2})/.exec(v)?.slice(1) ?? []);

  if (!y || !mo || !d) throw new Error(`data inválida "${raw}" (use dd/mm/aaaa)`);

  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;

  if (Number.isNaN(Date.parse(iso)) || new Date(iso).toISOString().slice(0, 10) !== iso)
    throw new Error(`data inexistente "${raw}"`);

  return iso;
}

/**
 * Data do contato → 12:00 de America/Sao_Paulo (ou a hora informada).
 */
export function parseContactDate(raw: string): Date {
  const time = /\s(\d{1,2}):(\d{2})$/.exec(raw.trim());
  const hhmm = time ? `${time[1]!.padStart(2, '0')}:${time[2]}` : '12:00';

  return new Date(`${parseDate(raw)}T${hhmm}:00${TZ_OFFSET}`);
}

export function parseNumber(raw: string): number {
  const v = raw.replace(/R\$|\s/g, '');
  const n = v.includes(',')
    ? Number(v.replace(/\./g, '').replace(',', '.'))
    : /^\d{1,3}(?:\.\d{3})+$/.test(v)
      ? Number(v.replace(/\./g, ''))
      : Number(v);

  if (!Number.isFinite(n)) throw new Error(`número inválido "${raw}"`);

  return n;
}

const SITE_BY_LABEL = new Map<string, WebsiteStatus>([
  ...websiteStatuses.map((s) => [normalizeName(siteLabel[s]), s] as const),
  ['', 'unknown'],
  ['nao tem', 'none'],
  ['nao avaliavel', 'unknown'],
]);
const STATUS_BY_LABEL = new Map(
  contactStatuses.map((s) => [normalizeName(statusLabel[s]), s] as const),
);

export interface ParsedRow {
  errors: string[];
  nicheName?: string;
  place?: string;
  sheetScore?: null | number;
  ticket?: 'alto' | 'baixo' | 'medio' | null;
  /**
   * Valores prontos para o banco, só dos campos presentes na linha.
   */
  values: Record<string, unknown>;
}

/**
 * Converte uma linha com cabeçalhos canônicos. Campo ausente não entra; vazio
 * vira null/false.
 */
export function parseLeadRow(row: Record<string, string>): ParsedRow {
  const out: ParsedRow = { values: {}, errors: [] };
  for (const col of COLUMNS) {
    if (!(col.header in row)) continue;

    const raw = (row[col.header] ?? '').trim();

    try {
      const v = out.values;

      switch (col.kind) {
        case 'bool':
          v[col.key] = parseBool(raw);
          break;
        case 'boolNull':
          v[col.key] = raw ? parseBool(raw) : null;
          break;
        case 'date':
          if (col.key === 'includedAt') {
            if (raw) v[col.key] = parseDate(raw); // vazio: mantém o padrão do banco
          } else v[col.key] = raw ? parseDate(raw) : null;

          break;
        case 'datetime':
          v[col.key] = raw ? parseContactDate(raw) : null;
          break;
        case 'id':
          if (raw) v.id = raw.toLowerCase();

          if (
            raw
            && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
              v.id as string,
            )
          )
            throw new Error(`ID "${raw}" não é UUID`);

          break;
        case 'int':
          v[col.key] = raw ? Math.round(parseNumber(raw)) : null;
          break;
        case 'long':
        case 'text':
          v[col.key] = raw || null;
          break;
        case 'money':
          v[col.key] = raw ? parseNumber(raw).toFixed(2) : null;
          break;
        case 'niche':
          out.nicheName = raw;
          break;
        case 'place':
          out.place = raw;
          break;
        case 'rating': {
          const n = raw ? parseNumber(raw) : null;

          if (n !== null && (n < 0 || n > 5)) throw new Error(`nota fora de 0–5: "${raw}"`);

          v[col.key] = n === null ? null : n.toFixed(1);
          break;
        }
        case 'score':
          out.sheetScore = raw ? parseNumber(raw) : null;
          break;
        case 'site': {
          const s = SITE_BY_LABEL.get(normalizeName(raw));

          if (!s) throw new Error(`situação do site desconhecida "${raw}"`);

          v[col.key] = s;
          break;
        }
        case 'status': {
          const s = STATUS_BY_LABEL.get(normalizeName(raw));

          if (s) v[col.key] = s;
          else {
            // SPEC 4.2: valor desconhecido vira "new" e o original vai para as observações
            v[col.key] = 'new' satisfies ContactStatus;

            if (raw) out.values.__originalStatus = raw;
          }

          break;
        }
        case 'ticket': {
          const t = normalizeName(raw);
          out.ticket =
            t === 'alto' ? 'alto' : t === 'medio' ? 'medio' : t === 'baixo' ? 'baixo' : null;
          break;
        }
      }
    } catch (e) {
      out.errors.push(`${col.header}: ${(e as Error).message}`);
    }
  }
  const original = out.values.__originalStatus as string | undefined;
  delete out.values.__originalStatus;

  if (original) {
    const note = `[status original: ${original}]`;

    out.values.notes = [note, out.values.notes].filter(Boolean).join(' ');
  }

  return out;
}

type LeadLike = { score: number } & Record<string, unknown>;

/**
 * Aaaa-mm-dd → dd/mm/aaaa.
 */
export const formatDate = (iso: string): string =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Data (instante) → "aaaa-mm-dd" no fuso de São Paulo.
 */
export const spDate = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

/**
 * Lead → linha da planilha (cabeçalhos canônicos), no formato que parseLeadRow
 * lê de volta.
 */
export function leadToRow(
  lead: LeadLike,
  niche: { name: string; ticket: 'alto' | 'baixo' | 'medio' | null } | null,
  place: string,
): Record<string, string> {
  const row: Record<string, string> = {};
  for (const col of COLUMNS) {
    const x = lead[col.key];
    let s: string;

    switch (col.kind) {
      case 'bool':
        s = x ? 'Sim' : '';
        break;
      case 'boolNull':
        s = x === null || x === undefined ? '' : x ? 'Sim' : 'Não';
        break;
      case 'date':
        s = typeof x === 'string' && x ? formatDate(x) : '';
        break;
      case 'datetime':
        s = x instanceof Date ? formatDate(spDate(x)) : '';
        break;
      case 'money':
      case 'rating':
        s = x === null || x === undefined ? '' : String(x).replace('.', ',');
        break;
      case 'niche':
        s = niche?.name ?? '';
        break;
      case 'place':
        s = place;
        break;
      case 'score':
        s = String(lead.score);
        break;
      case 'site':
        s = x === 'unknown' || x === null || x === undefined ? '' : siteLabel[x as WebsiteStatus];
        break;
      case 'status':
        s = statusLabel[x as ContactStatus];
        break;
      case 'ticket':
        s = niche?.ticket ? ticketLabel[niche.ticket] : '';
        break;
      default:
        s = x === null || x === undefined ? '' : String(x);
    }

    row[col.header] = s;
  }

  return row;
}
