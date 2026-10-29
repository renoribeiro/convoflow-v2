import { Children, isValidElement, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Espaço guardado para o "+N" quando nem todos os selos cabem. */
const RESERVA_DO_MAIS = 30;

/**
 * Selos numa linha só, sem passar da borda: o que não cabe vira "+N".
 *
 * Mede a largura natural de cada selo uma vez (quando a lista de selos muda) e
 * recalcula quantos cabem sempre que a linha muda de largura. Sem medida (teste
 * em jsdom, primeiro quadro) mostra todos. Os selos escondidos aparecem no
 * `title` do "+N".
 */
export function LinhaDeSelos({ children, className }: { children: ReactNode; className?: string }) {
  // toArray já tira null, undefined e false.
  const itens = Children.toArray(children);
  const assinatura = itens.map((c, i) => (isValidElement(c) ? String(c.key ?? i) : String(i))).join('|');

  const linhaRef = useRef<HTMLDivElement>(null);
  const larguras = useRef<number[] | null>(null);
  const [cabem, setCabem] = useState(Infinity);
  const [assinaturaMedida, setAssinaturaMedida] = useState(assinatura);
  if (assinaturaMedida !== assinatura) {
    // Selos novos: mostra todos de novo para medir antes de pintar.
    setAssinaturaMedida(assinatura);
    setCabem(Infinity);
    larguras.current = null;
  }

  const medindo = cabem === Infinity;
  useLayoutEffect(() => {
    const linha = linhaRef.current;
    if (!linha) return;
    const calcular = () => {
      if (!larguras.current) {
        // Só dá para medir com todos à mostra.
        if (!medindo) return;
        const selos = Array.from(linha.querySelectorAll<HTMLElement>(':scope > [data-selo]'));
        if (selos.length !== itens.length) return;
        larguras.current = selos.map((s) => s.getBoundingClientRect().width);
      }
      const total = linha.clientWidth;
      if (!total) return;
      const gap = parseFloat(getComputedStyle(linha).columnGap) || 0;
      const ws = larguras.current;
      let usado = 0;
      let n = 0;
      for (let i = 0; i < ws.length; i++) {
        // Selo que não desenha nada (componente que devolve null) não ocupa lugar.
        const w = ws[i] ?? 0;
        if (w === 0) {
          n++;
          continue;
        }
        const proximo = usado + (usado ? gap : 0) + w;
        const reserva = i < ws.length - 1 ? gap + RESERVA_DO_MAIS : 0;
        if (proximo + reserva > total) break;
        usado = proximo;
        n++;
      }
      setCabem(n >= ws.length ? Infinity : n);
    };
    calcular();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calcular) : null;
    ro?.observe(linha);
    return () => ro?.disconnect();
    // `medindo` refaz a conta depois que todos voltaram a aparecer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, medindo]);

  // Conta só os que desenham algo (os vazios não somam no "+N").
  const escondidos =
    cabem === Infinity ? 0 : (larguras.current?.slice(cabem).filter((w) => w > 0).length ?? itens.length - cabem);
  const nomesEscondidos = escondidos
    ? Array.from(linhaRef.current?.querySelectorAll<HTMLElement>(':scope > [data-selo]') ?? [])
        .slice(cabem)
        .map((s) => s.textContent?.trim())
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <div ref={linhaRef} className={cn('flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden', className)}>
      {itens.map((item, i) => (
        <span
          key={isValidElement(item) ? (item.key ?? i) : i}
          data-selo
          className={cn('flex max-w-full flex-shrink-0 items-center empty:hidden', i >= cabem && 'hidden')}
        >
          {item}
        </span>
      ))}
      {escondidos > 0 && (
        <span
          className="flex-shrink-0 rounded-full border border-border px-1.5 text-[11px] font-medium leading-5 text-muted-foreground"
          title={nomesEscondidos || undefined}
        >
          +{escondidos}
        </span>
      )}
    </div>
  );
}
