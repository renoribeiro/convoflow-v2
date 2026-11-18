import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TextoWhatsApp } from './TextoWhatsApp';

const montar = (texto: string, props: Partial<React.ComponentProps<typeof TextoWhatsApp>> = {}) =>
  render(
    <p className="whitespace-pre-wrap">
      <TextoWhatsApp texto={texto} {...props} />
    </p>,
  ).container.querySelector('p') as HTMLParagraphElement;

describe('<TextoWhatsApp />: cada formatação', () => {
  it('negrito vira <strong> e os asteriscos somem', () => {
    const p = montar('Sua *Consulta* está marcada');
    expect(p.querySelector('strong')?.textContent).toBe('Consulta');
    expect(p.textContent).toBe('Sua Consulta está marcada');
  });

  it('itálico vira <em>', () => {
    expect(montar('_amanhã_').querySelector('em')?.textContent).toBe('amanhã');
  });

  it('riscado vira <s>', () => {
    expect(montar('~R$ 200~').querySelector('s')?.textContent).toBe('R$ 200');
  });

  it('monoespaçado usa a fonte de código', () => {
    const el = montar('```cupom10```').querySelector('[data-formatacao="mono"]');
    expect(el?.textContent).toBe('cupom10');
    expect(el?.className).toContain('font-mono');
  });

  it('código vira <code>', () => {
    expect(montar('use `PIX`').querySelector('code')?.textContent).toBe('PIX');
  });

  it('citação ganha a barra e perde o "> "', () => {
    const el = montar('> texto citado').querySelector('[data-formatacao="citacao"]');
    expect(el?.textContent).toBe('texto citado');
  });

  it('lista com marcador e lista numerada', () => {
    const p = montar('* arroz\n- feijão\n1. um');
    expect(p.querySelectorAll('[data-formatacao="item"]')).toHaveLength(2);
    expect(p.querySelector('[data-formatacao="numerado"]')?.textContent).toBe('1.um');
    expect(p.textContent).not.toContain('*');
  });

  it('negrito com itálico dentro', () => {
    const p = montar('*Dia _10_*');
    expect(p.querySelector('strong em')?.textContent).toBe('10');
  });
});

describe('<TextoWhatsApp />: texto comum não muda', () => {
  it('sem formatação, os mesmos nós de antes (texto e quebra de linha)', () => {
    const p = montar('Bom dia\nquero marcar');
    expect(p.textContent).toBe('Bom dia\nquero marcar');
    expect(p.querySelector('span, strong, em')).toBeNull();
  });

  it('sinal dentro da palavra ou solto continua visível', () => {
    expect(montar('meu_arquivo_final.pdf').textContent).toBe('meu_arquivo_final.pdf');
    expect(montar('nota 5* do cliente').textContent).toBe('nota 5* do cliente');
    expect(montar('2*3*4').querySelector('strong')).toBeNull();
  });

  it('sinal sem par continua visível', () => {
    expect(montar('*sem fechar').textContent).toBe('*sem fechar');
  });

  it('Instagram (formatar=false) mostra os sinais como vieram', () => {
    const p = montar('*oi*', { formatar: false });
    expect(p.textContent).toBe('*oi*');
    expect(p.querySelector('strong')).toBeNull();
  });

  it('emoji dentro do negrito', () => {
    expect(montar('*Promoção 🎉*').querySelector('strong')?.textContent).toBe('Promoção 🎉');
  });

  it('linhas em branco continuam lá quando há formatação', () => {
    const p = montar('*a*\n\nb');
    expect(p.querySelectorAll('br')).toHaveLength(1);
  });
});

describe('<TextoWhatsApp />: links', () => {
  it('link comum continua clicável, abre em outra aba', () => {
    const a = montar('veja https://exemplo.com.br/a_b_c').querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://exemplo.com.br/a_b_c');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('link dentro do negrito: clicável e sem o asterisco no endereço', () => {
    const p = montar('*veja https://exemplo.com.br/p?a=1*');
    expect(p.querySelector('strong a')?.getAttribute('href')).toBe('https://exemplo.com.br/p?a=1');
  });

  it('sublinhado no endereço não vira itálico', () => {
    const p = montar('*Oferta* em https://exemplo.com.br/_promo_');
    expect(p.querySelector('em')).toBeNull();
    expect(p.querySelector('a')?.getAttribute('href')).toBe('https://exemplo.com.br/_promo_');
  });

  it('prévia sem links (links=false): endereço fica texto, com e sem formatação', () => {
    expect(montar('veja https://exemplo.com.br', { links: false }).querySelector('a')).toBeNull();
    const p = montar('*veja https://exemplo.com.br*', { links: false });
    expect(p.querySelector('a')).toBeNull();
    expect(p.querySelector('strong')?.textContent).toBe('veja https://exemplo.com.br');
  });

  it('javascript: nunca vira link', () => {
    const p = montar('*javascript:alert(1)*');
    expect(p.querySelector('a')).toBeNull();
    expect(p.querySelector('strong')?.textContent).toBe('javascript:alert(1)');
  });
});

describe('<TextoWhatsApp />: segurança', () => {
  it.each([
    '<img src=x onerror=alert(1)>',
    '*<img src=x onerror=alert(1)>*',
    '_<script>alert(1)</script>_',
    '```<iframe src="https://exemplo.com.br"></iframe>```',
    '> <b onclick="alert(1)">oi</b>',
    '`<svg onload=alert(1)>`',
  ])('"%s" fica texto puro', (texto) => {
    const p = montar(texto);
    expect(p.querySelector('img, script, iframe, b, svg')).toBeNull();
    expect(p.textContent).toContain('<');
    expect(p.innerHTML).not.toMatch(/<(img|script|iframe|svg|b)[\s>]/);
  });
});

describe('<TextoWhatsApp />: busca e pedaço próprio', () => {
  it('o termo da busca continua marcado dentro do negrito', () => {
    expect(montar('*Consulta marcada*', { termo: 'marcada' }).querySelector('strong mark')?.textContent).toBe('marcada');
  });

  it('o termo da busca continua marcado em texto comum', () => {
    expect(montar('Consulta marcada', { termo: 'consulta' }).querySelector('mark')?.textContent).toBe('Consulta');
  });

  it('folha própria desenha os pedaços de texto (templates)', () => {
    const p = montar('*Olá {{1}}*', { folha: (t) => <span data-folha="">{t}</span> });
    expect(p.querySelector('strong [data-folha]')?.textContent).toBe('Olá {{1}}');
  });
});
