/** Rótulos pt-BR dos enums de lead (SPEC 4.2 e planilha). */
export const statusLabel = {
  new: 'Novo',
  to_contact: 'A abordar',
  contacted: 'Abordado',
  no_response: 'Sem resposta',
  replied: 'Respondeu',
  negotiating: 'Em negociação',
  client: 'Cliente',
  lost: 'Perdido',
  discarded: 'Descartado',
} as const;
export type ContactStatus = keyof typeof statusLabel;
export const contactStatuses = Object.keys(statusLabel) as ContactStatus[];

export const siteLabel = {
  none: 'Não tem',
  social_only: 'Só rede social',
  bad: 'Ruim',
  good: 'Bom',
  unknown: 'Não avaliado',
} as const;
export type WebsiteStatus = keyof typeof siteLabel;
export const websiteStatuses = Object.keys(siteLabel) as WebsiteStatus[];

export const ticketLabel = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' } as const;
