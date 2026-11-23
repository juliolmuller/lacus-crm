import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * Chaves acima disso são reescritas (SPEC 6.3): `a0`, `a1`... crescem devagar,
 * mas inserir sempre no mesmo ponto engorda a chave.
 */
export const MAX_KEY_LENGTH = 50;

/**
 * Chave entre `prev` e `next` (null = ponta). Devolve null se a ordem for
 * inválida (prev >= next): o chamador rebalanceia.
 */
export function keyBetween(prev: null | string, next: null | string): null | string {
  if (prev !== null && next !== null && prev >= next) return null;

  return generateKeyBetween(prev, next);
}

export const needsRebalance = (key: string): boolean => key.length > MAX_KEY_LENGTH;

/**
 * `n` chaves curtas, em ordem, para reescrever a coluna.
 */
export const rebalanceKeys = (n: number): string[] => generateNKeysBetween(null, null, n);
