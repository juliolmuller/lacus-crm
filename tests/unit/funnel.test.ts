import { describe, expect, it } from 'vitest';
import { keyBetween, MAX_KEY_LENGTH, needsRebalance, rebalanceKeys } from '@/lib/funnel/fractional';
import { syncedStatus } from '@/lib/funnel/status-sync';

describe('chaves fracionárias', () => {
  it('gera chaves em ordem estrita entre vizinhos', () => {
    const a = keyBetween(null, null)!;
    const c = keyBetween(a, null)!;
    const b = keyBetween(a, c)!;
    expect(a < b && b < c).toBe(true);
    expect(keyBetween(null, a)! < a).toBe(true);
  });

  it('ordem inválida (iguais ou invertidas) devolve null para rebalancear', () => {
    const a = keyBetween(null, null)!;
    expect(keyBetween(a, a)).toBeNull();
    expect(keyBetween('a5', 'a1')).toBeNull();
  });

  it('inserir sempre no mesmo ponto engorda a chave até o limite; o rebalanceamento encurta e mantém a ordem', () => {
    const first = keyBetween(null, null)!;
    let hi = keyBetween(first, null)!;
    let key = first;
    for (let i = 0; i < 5000 && !needsRebalance(key); i++) {
      key = keyBetween(first, hi)!;
      hi = key;
    }
    expect(key.length).toBeGreaterThan(MAX_KEY_LENGTH);
    const keys = rebalanceKeys(5);
    expect(keys).toHaveLength(5);
    expect([...keys].sort()).toEqual(keys);
    expect(keys.every((k) => !needsRebalance(k))).toBe(true);
  });
});

describe('sincronia etapa → status (D3, só para frente)', () => {
  it('avança, mas nunca retrocede', () => {
    expect(syncedStatus('new', 'contacted')).toBe('contacted');
    expect(syncedStatus('contacted', 'to_contact')).toBeNull();
    expect(syncedStatus('replied', 'contacted')).toBeNull();
    expect(syncedStatus('no_response', 'replied')).toBe('replied');
    expect(syncedStatus('contacted', 'contacted')).toBeNull();
  });
  it('lost, client e discarded sempre se aplicam', () => {
    expect(syncedStatus('new', 'client')).toBe('client');
    expect(syncedStatus('negotiating', 'lost')).toBe('lost');
    expect(syncedStatus('client', 'lost')).toBe('lost');
  });
  it('lead perdido/descartado não é revivido por etapa aberta, salvo ao reabrir (force)', () => {
    expect(syncedStatus('lost', 'contacted')).toBeNull();
    expect(syncedStatus('lost', 'contacted', true)).toBe('contacted');
    expect(syncedStatus('new', null)).toBeNull();
  });
});
