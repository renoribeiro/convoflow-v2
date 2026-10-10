/**
 * "Chrome 128 no Windows" a partir do user agent cru, para quem não lê
 * "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36…". O texto
 * cru continua disponível ao passar o mouse.
 *
 * A ordem dos testes importa: Edge, Opera e Samsung também dizem "Chrome";
 * Chrome também diz "Safari"; iPad em modo computador diz "Macintosh".
 */
export function describeUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;

  const navegadores: Array<[RegExp, string]> = [
    [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
    [/(?:CriOS|Chrome)\/(\d+)/, 'Chrome'],
    [/Version\/(\d+)[\d.]*.*Safari/, 'Safari'],
  ];
  let navegador: string | null = null;
  for (const [re, nome] of navegadores) {
    const m = re.exec(ua);
    if (m) {
      navegador = `${nome} ${m[1]}`;
      break;
    }
  }

  const sistemas: Array<[RegExp, string]> = [
    [/iPhone|iPad|iPod/, 'iPhone/iPad'],
    [/Android/, 'Android'],
    [/Windows/, 'Windows'],
    [/CrOS/, 'ChromeOS'],
    [/Mac OS X|Macintosh/, 'macOS'],
    [/Linux/, 'Linux'],
  ];
  const sistema = sistemas.find(([re]) => re.test(ua))?.[1] ?? null;

  if (!navegador && !sistema) return 'Navegador desconhecido';
  return [navegador ?? 'Navegador desconhecido', sistema].filter(Boolean).join(' no ');
}
