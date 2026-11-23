import { normalizeName } from '@/lib/normalize';

/**
 * Frases que indicam recusa explícita. Só gera candidatos: quem aplica é o
 * Júlio (PLAN, decisão 4).
 */
const REFUSAL =
  /nao (?:contat|abord|me procure|quero|tenho interesse|faz sentido)|recus|pare de|parar de|opt out|me remov|nao precisa|sem interesse/;

export function dncEvidence(l: {
  nextAction?: null | string;
  notes?: null | string;
  responseOrObjection?: null | string;
}): string[] {
  return [l.responseOrObjection, l.nextAction, l.notes]
    .filter((t): t is string => !!t)
    .filter((t) => REFUSAL.test(normalizeName(t)));
}
