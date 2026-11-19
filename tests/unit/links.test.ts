import { describe, expect, it } from 'vitest';
import { instagramUrl, safeUrl, telUrl, whatsappUrl } from '@/lib/leads/links';

describe('links das ações rápidas', () => {
  it('safeUrl aceita só http(s)', () => {
    expect(safeUrl('odontlux.com.br')).toBe('https://odontlux.com.br/');
    expect(safeUrl('http://x.com/a')).toBe('http://x.com/a');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('')).toBeNull();
  });
  it('instagramUrl aceita @perfil, perfil e URL', () => {
    expect(instagramUrl('@dra_kaliane')).toBe('https://instagram.com/dra_kaliane');
    expect(instagramUrl('https://www.instagram.com/odontoart.cwb/')).toBe(
      'https://www.instagram.com/odontoart.cwb/',
    );
    expect(instagramUrl('Linktree')).toBe('https://instagram.com/Linktree'); // handle válido
    expect(instagramUrl('com espaço')).toBeNull();
  });
  it('wa.me sem o "+" e tel:', () => {
    expect(whatsappUrl('+5541988372454')).toBe('https://wa.me/5541988372454');
    expect(whatsappUrl('+5541988372454', 'Olá & tudo bem?')).toBe(
      'https://wa.me/5541988372454?text=Ol%C3%A1%20%26%20tudo%20bem%3F',
    );
    expect(whatsappUrl(null)).toBeNull();
    expect(telUrl('+554130534004')).toBe('tel:+554130534004');
  });
});
