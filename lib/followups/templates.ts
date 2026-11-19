import { siteLabel } from '@/lib/leads/labels';
import type { WebsiteStatus } from '@/lib/leads/labels';

export const templateVars = [
  'nome_negocio',
  'nicho',
  'bairro',
  'cidade',
  'nota_maps',
  'avaliacoes',
  'situacao_site',
  'argumento',
  'meu_nome',
  'link_portfolio',
  'saudacao',
] as const;
export type TemplateVar = (typeof templateVars)[number];
export type TemplateValues = Partial<Record<TemplateVar, string | null | undefined>>;

/** "Bom dia" até 11h59, "Boa tarde" até 17h59, "Boa noite" depois (hora de São Paulo). */
export function greeting(now: Date): string {
  const h = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

/**
 * Troca `{{variavel}}` pelos valores. Variável ausente (ou desconhecida) fica no texto e entra em
 * `missing`; com qualquer `{{` sobrando, `blocked` é true e o app não abre o WhatsApp.
 */
export function renderTemplate(body: string, values: TemplateValues, now = new Date()) {
  const all: TemplateValues = { ...values, saudacao: greeting(now) };
  const missing = new Set<string>();
  const text = body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, name: string) => {
    const v = all[name as TemplateVar];
    if (v != null && String(v).trim() !== '') return String(v).trim();
    missing.add(name);
    return whole;
  });
  return { text, missing: [...missing], blocked: text.includes('{{') };
}

type LeadLike = {
  name: string;
  mapsRating: string | null;
  mapsReviews: number | null;
  websiteStatus: WebsiteStatus;
  pitch: string | null;
};

export function templateValues(
  lead: LeadLike,
  niche: { name: string },
  region: { city: string; neighborhood: string | null },
  profile: { name?: string; portfolioUrl?: string },
): TemplateValues {
  return {
    nome_negocio: lead.name,
    nicho: niche.name,
    bairro: region.neighborhood,
    cidade: region.city,
    nota_maps: lead.mapsRating,
    avaliacoes: lead.mapsReviews?.toString(),
    situacao_site: siteLabel[lead.websiteStatus],
    argumento: lead.pitch,
    meu_nome: profile.name,
    link_portfolio: profile.portfolioUrl,
  };
}
